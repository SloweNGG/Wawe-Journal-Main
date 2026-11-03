// Analiz başlığındaki bilgi satırı (perf 3a-2): yükleniyorken de son hâliyle aynı parçalar (yer tutucu sayı ve tarih)
// yazılır; veri gelince satır telefonda 1 → 2 satıra çıkıp KPI kartlarını 23 px itmesin.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync('public/interface/analytics/js/analytics.js', 'utf8');
const fnSrc = src.slice(src.indexOf('function updateHeaderMeta()'), src.indexOf('function renderHeaderStats()'));
const css = fs.readFileSync('public/interface/analytics/css/components.css', 'utf8');

function run({ isDataReady, trades }) {
  const el = { innerHTML: '' };
  const ctx = {
    isDataReady, currentFilteredTrades: trades, currentRange: 'all', customRangeStart: null, customRangeEnd: null,
    _t: (k, d) => d,
    sanitizeHTML: (s) => String(s),
    setHeaderMetaHtml: () => {},
    document: {
      getElementById: (id) => (id === 'pro-header-meta' ? el : null),
      querySelector: (s) => (s.includes('journal-name') ? { firstChild: { textContent: 'Ana Hesap' } } : s.includes('date-filter-option') ? { textContent: 'Tümü' } : null),
    },
    window: {
      i18n: { getCurrentLanguage: () => 'tr' },
      WwMetrics: { isClosed: (t) => t.status === 'closed' },
      WwTime: { formatDate: (v) => 'T(' + String(v).slice(0, 10) + ')' },
    },
  };
  vm.runInNewContext(fnSrc + '\nupdateHeaderMeta();', ctx);
  return el.innerHTML.match(/<span class="ph-meta-item[^"]*">[^<]*<\/span>/g).map((s) => s.replace(/<[^>]+>/g, ''));
}

describe('analytics header meta line', () => {
  const trades = [{ status: 'closed', trade_date: '2026-10-30T09:00:00Z' }, { status: 'closed', trade_date: '2026-10-02T09:00:00Z' }];

  it('with data: journal · range · closed count · last trade date', () => {
    assert.deepEqual(run({ isDataReady: true, trades }), ['Ana Hesap', 'Tümü', '2 kapanmış işlem', 'Son işlem T(2026-10-30)']);
  });

  it('while loading: same four parts with placeholders (not "0 kapanmış işlem" and no missing date)', () => {
    const parts = run({ isDataReady: false, trades: [] });
    assert.equal(parts.length, 4);
    assert.equal(parts[2], '00 kapanmış işlem');
    assert.match(parts[3], /^Son işlem T\(\d{4}-\d{2}-28\)$/);
  });

  it('no trades after loading: no last-trade part (unchanged behaviour)', () => {
    assert.deepEqual(run({ isDataReady: true, trades: [] }), ['Ana Hesap', 'Tümü', '0 kapanmış işlem']);
  });

  it('loading shimmer is as wide as the placeholder text (fixed 300 px made it wrap differently)', () => {
    const rule = css.match(/#main-content\.is-loading #pro-header-meta,\s*#main-content\.is-loading #ps-meta \{([^}]*)\}/)[1];
    assert.match(rule, /width:\s*fit-content/);
    assert.doesNotMatch(rule, /width:\s*300px/);
  });
});
