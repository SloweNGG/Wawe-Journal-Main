// Zil bildirimleri (navbar.js): okundu anahtarları, kategoriler, tıklama hedefleri ve kategori tercihleri.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const nav = fs.readFileSync('public/components/navbar/navbar.js', 'utf8');
const slice = (from, to) => nav.slice(nav.indexOf(from), nav.indexOf(to));

// okundu anahtarı deseni (istemci) = notification_reads CHECK (migration)
const readRe = /var WW_READ_KEY_RE = (\/.+\/);/.exec(nav)[1];
const mig = fs.readFileSync('supabase/migrations/202611230003_notification_reads.sql', 'utf8');

// kategori / hedef / tercih fonksiyonları, gerçek kaynaktan
const prefsSrc = slice('var WW_NOTIF_PREF_CATS', 'async function wwSetNotifPref(');
const decoSrc = slice('var _wwNotifActions = {};', 'function wwRunNotifAction(');

function ctx(prefs = {}, coachAlerts = null) {
  const c = { localStorage: { getItem: () => null, setItem() {} }, t: (k, f, p) => (p && typeof f === 'string' ? f.replace('{n}', p.n) : f) };
  vm.runInNewContext(prefsSrc + '\n' + decoSrc + '\nthis.decorate = wwDecorateNotif; this.on = wwNotifPrefOn; this.safe = wwSafeNotifUrl; this.st = function () { return _wwNotifPrefs; };', c);
  c.st().prefs = prefs;
  c.st().coachAlerts = coachAlerts;
  return c;
}

describe('notification read keys', () => {
  it('client regex and the DB CHECK are the same pattern', () => {
    const sqlRe = /notif_key ~ '([^']+)'/.exec(mig)[1];
    assert.equal(readRe, '/' + sqlRe + '/');
  });

  it('stable keys: Pro expiring is keyed by the expiry day only, weekly overtrade by the week\'s Monday', () => {
    assert.match(nav, /var expiringId = 'prem_expiring_' \+ expDay;/);
    assert.doesNotMatch(nav, /prem_expiring_' \+ user\.id \+ '_' \+ daysLeft/);
    const ot = fs.readFileSync('public/src/features/overtrade.js', 'utf8');
    assert.match(ot, /const id = 'ot_weekly_' \+ mondayKey;/);
  });

  it('the client-built "Welcome to Pro" copy is gone (the webhooks write it)', () => {
    assert.doesNotMatch(nav, /if \(isFinished\)/);
    assert.match(nav, /\.in\('payment_status', \['failed', 'expired'\]\)/);
  });

  it('a stale load cannot overwrite a newer one', () => {
    assert.match(nav, /if \(loadSeq !== _wwNotifLoadSeq\) return;\n[^\n]*\n\s*window\._allNotifications = combined;/);
  });
});

describe('notification categories and actions', () => {
  const c = ctx();
  const d = (item) => c.decorate(Object.assign({ id: 'x', titleKey: '', meta: {} }, item));

  it('overtrade -> risk, trades + limits', () => {
    const r = d({ id: 'ot_daily_2026-11-23', is_overtrade: true });
    assert.equal(r.cat, 'risk');
    assert.deepEqual([...r.actions].map((a) => a.href), ['/trades', '/settings#panel-overtrade']);
  });

  it('coach alerts / coach reports open the coach panel', () => {
    assert.equal(d({ titleKey: 'coach.alert.plan_stop.title' }).cat, 'coach_alert');
    const w = d({ titleKey: 'coach.weekly.title' });
    assert.equal(w.cat, 'coach');
    assert.equal(w.actions[0].coach, true);
  });

  it('partner and payout -> /my-earnings; Pro, payments -> account (plan)', () => {
    assert.equal(d({ titleKey: 'noti.partner_approved_title', isPartner: true }).actions[0].href, '/my-earnings');
    assert.equal(d({ titleKey: 'noti.payout_rejected_title' }).cat, 'partner');
    assert.equal(d({ titleKey: 'noti.payment_success_title', srcType: 'premium' }).cat, 'account');
    assert.equal(d({ id: 'prem_expiring_2026-12-01' }).cat, 'account');
    assert.equal(d({ id: 'pay_42' }).actions[0].href, '/settings#panel-plan');
  });

  it('admin notifications: plain -> system without action; a site path in meta.url becomes the first action', () => {
    const plain = d({ titleKey: 'Bakım duyurusu', srcType: 'info' });
    assert.equal(plain.cat, 'system');
    assert.equal(plain.actions.length, 0);
    const linked = d({ titleKey: 'Yeni özellik', srcType: 'info', meta: { url: '/backtest', cta: 'Dene' } });
    assert.deepEqual([linked.actions[0].href, linked.actions[0].label], ['/backtest', 'Dene']);
    assert.equal(d({ srcType: 'warning' }).cat, 'risk');
  });

  it('only same-site paths are accepted as targets', () => {
    for (const ok of ['/trades', '/settings#panel-plan', '/x?a=1&b=2']) assert.equal(c.safe(ok), ok);
    for (const bad of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '/"><img>', '', null, 'trades']) assert.equal(c.safe(bad), '');
  });
});

describe('notification preferences', () => {
  it('everything is on by default; account is always on', () => {
    const c = ctx();
    for (const k of ['risk', 'coach_alert', 'coach', 'partner', 'system', 'account']) assert.equal(c.on(k), true);
  });

  it('turned-off categories are off; coach alerts follow coach_settings.alerts_enabled', () => {
    const c = ctx({ risk: false, system: false }, false);
    assert.equal(c.on('risk'), false);
    assert.equal(c.on('system'), false);
    assert.equal(c.on('coach_alert'), false);
    assert.equal(c.on('coach'), true);
    assert.equal(c.on('account'), true);
  });

  it('the migration keeps the column small and the bell filters hidden categories out', () => {
    const m = fs.readFileSync('supabase/migrations/202611230004_user_profile_notification_prefs.sql', 'utf8');
    assert.match(m, /pg_column_size\(notification_prefs\) <= 2048/);
    assert.match(nav, /if \(wwNotifPrefOn\(item\.cat\)\) return true;/);
  });

  it('every new bell text exists in tr, en and de', () => {
    const keys = [...new Set([...nav.matchAll(/t\('(noti\.(?:act|pref|prefs)_[a-z_]+)'/g)].map((m) => m[1]))];
    assert.ok(keys.length >= 20);
    for (const lang of ['tr', 'en', 'de']) {
      const loc = fs.readFileSync(`public/i18n/locales/${lang}.js`, 'utf8');
      for (const k of keys) assert.ok(loc.includes(`"${k}":`), `${lang} missing ${k}`);
    }
  });
});
