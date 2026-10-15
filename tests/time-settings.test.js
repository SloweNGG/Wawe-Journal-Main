// ============================================================
// WAWE JOURNAL - SAAT & GÜN AYARLARI TEST SUITE
// File: tests/time-settings.test.js
// Runner: node --test tests/*.test.js
// ============================================================

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const code = fs.readFileSync(path.resolve('public/interface/shared/time-settings.js'), 'utf8');

function load() {
  const store = {};
  const win = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    dispatchEvent: () => true,
    CustomEvent: class { constructor(n, o) { this.type = n; this.detail = o && o.detail; } },
    Intl, Date, Math, Number, String, Array, Object, RegExp, JSON, isNaN, isFinite, parseInt
  };
  win.window = win;
  vm.runInNewContext(code, win);
  return { T: win.WwTime, store };
}

describe('WwTime: ayarlar', () => {
  it('varsayılanlar: auto saat dilimi, gün 00:00, import "same", 24 saat', () => {
    const { T } = load();
    const s = T.getSettings();
    assert.equal(s.tz, 'auto');
    assert.equal(s.dayStart, 0);
    assert.equal(s.importTz, 'same');
    assert.equal(s.hour12, false);
    assert.ok(T.isValidTz(T.getTz()));
  });

  it('geçersiz değerler güvenli varsayılana döner, saat 0-23 aralığına sıkıştırılır', () => {
    const { T } = load();
    const s = T.setSettings({ tz: 'Mars/Olympus', dayStart: 99, importTz: 'nope', hour12: 1 });
    assert.equal(s.tz, 'auto');
    assert.equal(s.dayStart, 23);
    assert.equal(s.importTz, 'same');
    assert.equal(s.hour12, true);
    assert.equal(T.setSettings({ dayStart: -5 }).dayStart, 0);
  });

  it('ayarlar localStorage\'a yazılır ve sıfırlanır', () => {
    const { T, store } = load();
    T.setSettings({ tz: 'Europe/Istanbul', dayStart: 3 });
    assert.ok(store[T.STORAGE_KEY].includes('Europe/Istanbul'));
    T.resetSettings();
    assert.equal(T.getSettings().tz, 'auto');
    assert.equal(T.getSettings().dayStart, 0);
  });
});

describe('WwTime: gün anahtarı', () => {
  it('sadece-tarih değerler saat dilimiyle KAYMAZ', () => {
    const { T } = load();
    for (const tz of ['Pacific/Honolulu', 'Europe/Istanbul', 'Pacific/Auckland']) {
      T.setSettings({ tz, dayStart: 5 });
      assert.equal(T.dateKey('2026-10-14'), '2026-10-14');
      assert.equal(T.dateKey({ trade_date: '2026-10-14' }), '2026-10-14');
    }
  });

  it('tam UTC gece yarısı damgası (timestamptz\'e yazılmış sadece-tarih) gün kaymaz', () => {
    const { T } = load();
    T.setSettings({ tz: 'America/New_York' });
    assert.equal(T.dateKey('2026-10-14T00:00:00+00:00'), '2026-10-14');
    assert.equal(T.dateKey('2026-10-14T00:00:00.000Z'), '2026-10-14');
    assert.equal(T.dateKey('2026-10-14 00:00:00+00'), '2026-10-14');
  });

  it('zaman damgası seçilen saat dilimindeki güne yazılır (UTC değil)', () => {
    const { T } = load();
    T.setSettings({ tz: 'Europe/Istanbul' });           // UTC+3
    assert.equal(T.dateKey('2026-10-15T21:30:00Z'), '2026-10-16');
    T.setSettings({ tz: 'America/New_York' });          // 02:00Z = önceki gün 22:00
    assert.equal(T.dateKey('2026-10-15T02:00:00Z'), '2026-10-14');
    T.setSettings({ tz: 'UTC' });
    assert.equal(T.dateKey('2026-10-15T02:00:00Z'), '2026-10-15');
  });

  it('gün başlangıç saati: 02:00 olunca 01:30 önceki güne sayılır', () => {
    const { T } = load();
    T.setSettings({ tz: 'Europe/Istanbul', dayStart: 2 });
    assert.equal(T.dateKey('2026-10-15T22:30:00Z'), '2026-10-15');  // 01:30 İstanbul, 16 Ekim -> 15 Ekim işlem günü
    assert.equal(T.dateKey('2026-10-16T00:30:00Z'), '2026-10-16');  // 03:30 İstanbul -> 16 Ekim
    // sadece-tarih etkilenmez
    assert.equal(T.dateKey('2026-10-16'), '2026-10-16');
  });

  it('saat dilimi bilgisi olmayan damga UTC kabul edilir', () => {
    const { T } = load();
    T.setSettings({ tz: 'UTC' });
    assert.equal(T.dateKey('2026-10-14 10:00:00'), '2026-10-14');
    T.setSettings({ tz: 'Pacific/Auckland' });  // UTC+13 (Ekim: NZDT)
    assert.equal(T.dateKey('2026-10-14 15:00:00'), '2026-10-15');
  });

  it('boş / geçersiz değer', () => {
    const { T } = load();
    assert.equal(T.dateKey(null), '');
    assert.equal(T.dateKey(''), '');
    assert.equal(T.dateKey({ trade_date: null }), '');
  });

  it('todayKey seçilen saat dilimindeki bugünü verir', () => {
    const { T } = load();
    const ms = Date.UTC(2026, 9, 15, 22, 30);           // 15 Ekim 22:30Z
    T.setSettings({ tz: 'Europe/Istanbul', dayStart: 0 });
    assert.equal(T.todayKey(ms), '2026-10-16');
    T.setSettings({ tz: 'America/Los_Angeles' });
    assert.equal(T.todayKey(ms), '2026-10-15');
  });
});

describe('WwTime: takvim aritmetiği', () => {
  const { T } = load();
  it('addDays ay/yıl sınırlarını geçer', () => {
    assert.equal(T.addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(T.addDays('2026-01-01', -1), '2025-12-31');
    assert.equal(T.addDays('2024-02-28', 1), '2024-02-29');
  });

  it('addMonths ay sonunda taşmaz (31 Mart - 1 ay = Şubat sonu)', () => {
    assert.equal(T.addMonths('2026-03-31', -1), '2026-02-28');
    assert.equal(T.addMonths('2024-03-31', -1), '2024-02-29');
    assert.equal(T.addMonths('2026-01-15', -1), '2025-12-15');
    assert.equal(T.addMonths('2026-12-31', 2), '2027-02-28');
    assert.equal(T.addMonths('2026-10-15', -12), '2025-10-15');
  });

  it('rangeStartKey: hafta = bugün dahil 7 gün, ay = bir ay önce, yıl = 1 Ocak', () => {
    assert.equal(T.rangeStartKey('week', '2026-10-15'), '2026-10-09');
    assert.equal(T.rangeStartKey('month', '2026-03-31'), '2026-02-28');
    assert.equal(T.rangeStartKey('year', '2026-10-15'), '2026-01-01');
    assert.equal(T.rangeStartKey('all', '2026-10-15'), null);
  });

  it('previousRangeKeys: yıl için geçen yılın AYNI süresi (yıl başından bugüne)', () => {
    const w = T.previousRangeKeys('week', '2026-10-15');
    assert.equal(w.start, '2026-10-02'); assert.equal(w.end, '2026-10-09');
    const y = T.previousRangeKeys('year', '2026-10-15');
    assert.equal(y.start, '2025-01-01'); assert.equal(y.end, '2025-10-16');
    assert.equal(T.previousRangeKeys('all', '2026-10-15'), null);
  });

  it('dowOfKey', () => {
    assert.equal(T.dowOfKey('2026-10-15'), 4);  // Perşembe
    assert.equal(T.dowOfKey('2026-10-18'), 0);  // Pazar
  });
});

describe('WwTime: saat ve gösterim', () => {
  it('hourOf: damgalı işlemde saat dilimindeki saat, sadece-tarihte null', () => {
    const { T } = load();
    T.setSettings({ tz: 'Europe/Istanbul' });
    assert.equal(T.hourOf('2026-10-15T21:30:00Z'), 0);   // 00:30 İstanbul
    assert.equal(T.hourOf('2026-10-15T10:05:00Z'), 13);
    assert.equal(T.hourOf('2026-10-15'), null);
    assert.equal(T.hourOf('2026-10-15T00:00:00Z'), null);
  });

  it('dowOf gün anahtarına göre (UTC- bölgelerde bir gün önceye kaymaz)', () => {
    const { T } = load();
    T.setSettings({ tz: 'America/Los_Angeles' });
    assert.equal(T.dowOf('2026-10-12'), 1);  // Pazartesi
  });

  it('formatTime 24 ve 12 saat', () => {
    const { T } = load();
    T.setSettings({ tz: 'Europe/Istanbul', hour12: false });
    assert.equal(T.formatTime('2026-10-15T19:24:00Z', 'en'), '22:24');
    T.setSettings({ hour12: true });
    assert.match(T.formatTime('2026-10-15T19:24:00Z', 'en'), /^10:24\s?PM$/);
    assert.equal(T.formatTime('2026-10-15', 'en'), '');
  });

  it('formatDate: sadece-tarih kaymaz, damga seçili saat diliminde yazılır', () => {
    const { T } = load();
    T.setSettings({ tz: 'Pacific/Honolulu' });
    assert.equal(T.formatDate('2026-10-14', 'en', { day: 'numeric', month: 'numeric', year: 'numeric' }), '10/14/2026');
    T.setSettings({ tz: 'Europe/Istanbul' });
    assert.equal(T.formatDate('2026-10-15T21:30:00Z', 'en', { day: 'numeric', month: 'numeric', year: 'numeric' }), '10/16/2026');
  });

  it('formatOffset / offsetLabel', () => {
    const { T } = load();
    assert.equal(T.formatOffset(180), 'UTC+3');
    assert.equal(T.formatOffset(330), 'UTC+5:30');
    assert.equal(T.formatOffset(-300), 'UTC-5');
    assert.equal(T.formatOffset(0), 'UTC+0');
    assert.equal(T.offsetLabel('Europe/Istanbul', Date.UTC(2026, 6, 1)), 'UTC+3');
    assert.equal(T.offsetLabel('America/New_York', Date.UTC(2026, 0, 15)), 'UTC-5');
    assert.equal(T.offsetLabel('America/New_York', Date.UTC(2026, 6, 15)), 'UTC-4');
  });
});

describe('WwTime: zaman damgası ayrıştırma', () => {
  it('parseMs: Z, ofset, Postgres kısa ofseti, ofsetsiz', () => {
    const { T } = load();
    const base = Date.UTC(2026, 9, 14, 10, 0, 0);
    assert.equal(T.parseMs('2026-10-14T10:00:00Z'), base);
    assert.equal(T.parseMs('2026-10-14T13:00:00+03:00'), base);
    assert.equal(T.parseMs('2026-10-14 13:00:00+03'), base);
    assert.equal(T.parseMs('2026-10-14 10:00:00'), base);
    assert.equal(T.parseMs('2026-10-14T10:00:00.123456Z'), base + 123);
    assert.ok(isNaN(T.parseMs('geçersiz')));
  });
});

describe('WwTime: içe aktarma saati (broker/CSV saati -> UTC)', () => {
  it('"same": kullanıcının saat diliminden UTC\'ye (kış/yaz DST doğru)', () => {
    const { T } = load();
    T.setSettings({ tz: 'Europe/Berlin', importTz: 'same' });
    assert.equal(T.importWallTimeToIso(2026, 1, 15, 10, 0, 0), '2026-01-15T09:00:00.000Z');  // UTC+1
    assert.equal(T.importWallTimeToIso(2026, 7, 15, 10, 0, 0), '2026-07-15T08:00:00.000Z');  // UTC+2
  });

  it('sabit ofset (broker GMT+2): saat dilimimizden bağımsız', () => {
    const { T } = load();
    T.setSettings({ tz: 'America/New_York', importTz: 'offset:120' });
    assert.equal(T.importWallTimeToIso(2026, 6, 17, 10, 0, 0), '2026-06-17T08:00:00.000Z');
    T.setSettings({ importTz: 'offset:-330' });
    assert.equal(T.importWallTimeToIso(2026, 6, 17, 10, 0, 0), '2026-06-17T15:30:00.000Z');
  });

  it('"utc"', () => {
    const { T } = load();
    T.setSettings({ tz: 'Asia/Tokyo', importTz: 'utc' });
    assert.equal(T.importWallTimeToIso(2026, 6, 17, 10, 30, 15), '2026-06-17T10:30:15.000Z');
  });

  it('import edilen saat gün anahtarına tutarlı yansır (broker GMT+2, gece 23:30 -> bizim günümüz)', () => {
    const { T } = load();
    T.setSettings({ tz: 'Europe/Istanbul', importTz: 'offset:120', dayStart: 0 });
    const iso = T.importWallTimeToIso(2026, 10, 15, 23, 30, 0);   // 21:30Z
    assert.equal(T.dateKey(iso), '2026-10-16');                    // İstanbul 00:30
  });

  it('localWallTimeToIso: kullanıcı saat dilimindeki duvar saati', () => {
    const { T } = load();
    T.setSettings({ tz: 'Europe/Istanbul' });
    assert.equal(T.localWallTimeToIso(2026, 10, 15, 9, 0, 0), '2026-10-15T06:00:00.000Z');
  });

  it('DST: olmayan saat (ilkbahar ileri) ve tekrar eden saat (sonbahar geri) çökmeden çözülür', () => {
    const { T } = load();
    T.setSettings({ tz: 'Europe/Berlin', importTz: 'same' });
    const gap = T.importWallTimeToIso(2026, 3, 29, 2, 30, 0);     // 02:30 yok
    const dup = T.importWallTimeToIso(2026, 10, 25, 2, 30, 0);    // 02:30 iki kez var
    assert.ok(!isNaN(Date.parse(gap)));
    assert.ok(!isNaN(Date.parse(dup)));
  });
});

describe('WwTime: grafik ekseni ve yardımcılar', () => {
  it('pseudoUtcSeconds: saat dilimimizdeki duvar saatini sahte-UTC olarak verir', () => {
    const { T } = load();
    T.setSettings({ tz: 'Europe/Istanbul' });
    // 21:30Z = İstanbul 00:30 ertesi gün
    assert.equal(T.pseudoUtcSeconds('2026-10-15T21:30:00Z'), Date.UTC(2026, 9, 16, 0, 30, 0) / 1000);
    // sadece-tarih: günün 12:00'ı, kaymaz
    assert.equal(T.pseudoUtcSeconds('2026-10-14'), Date.UTC(2026, 9, 14, 12, 0, 0) / 1000);
    assert.equal(T.pseudoUtcSeconds(null), null);
  });

  it('dateFromKey: yerel Date alanları anahtarla aynı', () => {
    const { T } = load();
    const d = T.dateFromKey('2026-03-05');
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 2);
    assert.equal(d.getDate(), 5);
  });
});
