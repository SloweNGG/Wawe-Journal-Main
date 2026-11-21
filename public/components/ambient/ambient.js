// ============================================================
// ARKA PLAN MOTORU (window.WwAmbient) — Ayarlar > Görünüm > Arka plan
// ============================================================
// Uygulama sayfalarının arkasındaki katmanlar (Layout.astro #wj-ambient-backdrop, stiller ambient.css):
//   taban (düz renk / gradyan / gökyüzü)  →  sahne görseli (orman, dağ, günün saati)  →  karartma (okunurluk)
//   →  ışık topları (orbs)  →  K/Z ışığı (üst parıltı + alt aurora)
// Stiller: dynamic (K/Z ışığı, 4 renk paleti), gradient, solid, forest, mountain, daytime, off.
// K/Z ışığı yalnızca yön değil şiddet de gösterir: seçili dönemin K/Z'si ortalama işlem büyüklüğüyle oranlanır
// (hafif / orta / güçlü). Diğer stillerde "K/Z ışığı" anahtarıyla aynı ışık sahnenin üstüne eklenir.
// Tercih: localStorage ww_bg (JSON). Sayfa çizilmeden önce BaseHead'deki satır içi betik ww_bg_snap'i (en son
// uygulanan öznitelik + CSS değişkenleri) <html>'e yazar; böylece ilk karede yanlış arka plan görünmez.
// Eski ww_ambient_mode (dynamic / classic / off) ilk okumada ww_bg'ye taşınır.
// Saf fonksiyonlar (resolve, tierOf, daypartOf, normalize) tests/ambient.test.js ile test edilir.
// ============================================================
(function (global) {
  'use strict';

  var KEY = 'ww_bg', SNAP = 'ww_bg_snap';
  var STYLES = ['dynamic', 'gradient', 'solid', 'forest', 'mountain', 'daytime', 'off'];
  var IMG = '/images/backgrounds/';

  // K/Z renk paletleri (r,g,b): her yön için hafif / orta / güçlü kademede 3 renk (ana, ikinci, vurgu)
  var PNL = {
    classic: {
      profit: [['45,212,191', '34,197,94', '125,211,252'], ['34,197,94', '16,185,129', '45,212,191'], ['16,185,129', '34,197,94', '250,204,21']],
      loss: [['251,146,60', '244,63,94', '251,191,36'], ['239,68,68', '220,38,38', '251,113,133'], ['220,38,38', '159,18,57', '249,115,22']]
    },
    ocean: { // renk körlüğüne uygun: kâr mavi, zarar turuncu
      profit: [['125,211,252', '56,189,248', '165,180,252'], ['56,189,248', '59,130,246', '34,211,238'], ['37,99,235', '14,165,233', '129,140,248']],
      loss: [['253,186,116', '251,146,60', '253,224,71'], ['249,115,22', '234,88,12', '251,191,36'], ['234,88,12', '194,65,12', '245,158,11']]
    },
    neon: {
      profit: [['94,234,212', '163,230,53', '103,232,249'], ['45,212,191', '132,204,22', '34,211,238'], ['20,184,166', '163,230,53', '250,250,110']],
      loss: [['244,114,182', '232,121,249', '251,113,133'], ['236,72,153', '217,70,239', '244,63,94'], ['219,39,119', '192,38,211', '255,64,129']]
    },
    pastel: {
      profit: [['167,243,208', '153,246,228', '186,230,253'], ['110,231,183', '94,234,212', '167,243,208'], ['52,211,153', '45,212,191', '253,230,138']],
      loss: [['254,202,202', '253,186,116', '254,215,170'], ['252,165,165', '253,164,175', '253,186,116'], ['248,113,113', '251,113,133', '253,186,116']]
    }
  };
  var NEUTRAL = ['var(--ac-rgb)', 'var(--ac-i1-rgb)', 'var(--ac-p2-rgb)'];

  // Katalog: her stilin hazır seçenekleri. label: i18n anahtarı (settings.bg_p_<id>), fb: yedek metin.
  //   base: taban arka planı (koyu / açık tema), orbs: ışık topu renkleri (r,g,b) — yoksa toplar gizli,
  //   scene: sahne görseli, filter: görsele CSS filtresi, scrim: karartma (0..1, koyu tema)
  var CATALOG = {
    dynamic: [
      { id: 'classic', fb: 'Klasik', pnl: 'classic' },
      { id: 'ocean', fb: 'Okyanus & kehribar', pnl: 'ocean' },
      { id: 'neon', fb: 'Neon', pnl: 'neon' },
      { id: 'pastel', fb: 'Pastel', pnl: 'pastel' }
    ],
    gradient: [
      { id: 'wawe', fb: 'Wawe moru', base: ['radial-gradient(120% 80% at 80% -10%, rgba(var(--ac-rgb),.28), transparent 60%), radial-gradient(90% 70% at 0% 60%, rgba(var(--ac-i1-rgb),.2), transparent 60%), #07070c', 'radial-gradient(120% 80% at 80% -10%, rgba(var(--ac-rgb),.16), transparent 60%), var(--bg)'], orbs: ['var(--ac-rgb)', 'var(--ac-i1-rgb)', 'var(--ac-p2-rgb)'] },
      { id: 'aurora', fb: 'Kuzey ışıkları', base: ['linear-gradient(160deg, #04121a 0%, #062a2a 35%, #1b1640 70%, #07070c 100%)', 'linear-gradient(160deg, #e9fbf6 0%, #e7f2ff 55%, #f1ecff 100%)'], orbs: ['45,212,191', '34,197,94', '139,92,246'] },
      { id: 'ocean', fb: 'Okyanus', base: ['linear-gradient(180deg, #020b1a 0%, #062044 50%, #0a3a5c 100%)', 'linear-gradient(180deg, #eef6ff 0%, #ddefff 100%)'], orbs: ['56,189,248', '37,99,235', '34,211,238'] },
      { id: 'sunset', fb: 'Gün batımı', base: ['linear-gradient(180deg, #120a24 0%, #3d1238 45%, #7a2a2a 80%, #b4532a 100%)', 'linear-gradient(180deg, #fff1ea 0%, #ffe3d6 60%, #ffd7c2 100%)'], orbs: ['251,146,60', '236,72,153', '139,92,246'] },
      { id: 'nebula', fb: 'Nebula', base: ['radial-gradient(80% 60% at 70% 20%, #3b0d4f 0%, transparent 70%), radial-gradient(70% 60% at 10% 80%, #0d1f5c 0%, transparent 70%), #05040d', 'radial-gradient(80% 60% at 70% 20%, #f6e6ff 0%, transparent 70%), radial-gradient(70% 60% at 10% 80%, #e3ebff 0%, transparent 70%), var(--bg)'], orbs: ['217,70,239', '99,102,241', '236,72,153'] },
      { id: 'midnight', fb: 'Gece yarısı', base: ['linear-gradient(180deg, #000 0%, #050a1a 60%, #0b1530 100%)', 'linear-gradient(180deg, #f6f8fc 0%, #e8eef8 100%)'], orbs: ['59,130,246', '99,102,241', '14,165,233'] }
    ],
    solid: [
      { id: 'black', fb: 'Siyah', base: ['#000', '#ffffff'] },
      { id: 'graphite', fb: 'Grafit', base: ['#131417', '#f1f2f4'] },
      { id: 'navy', fb: 'Lacivert', base: ['#0a1022', '#eef2fb'] },
      { id: 'pine', fb: 'Çam yeşili', base: ['#0a1a13', '#eef6f1'] },
      { id: 'wine', fb: 'Bordo', base: ['#1a0a10', '#fbf0f2'] },
      { id: 'espresso', fb: 'Kahve', base: ['#16110c', '#f7f2ec'] }
    ],
    forest: [
      { id: 'pine', fb: 'Çam ormanı', scene: 'forest-pine.svg', base: ['#050d0a', 'var(--bg)'], scrim: 0.25 },
      { id: 'mist', fb: 'Sisli orman', scene: 'forest-mist.svg', base: ['#0b1214', 'var(--bg)'], scrim: 0.3 },
      { id: 'autumn', fb: 'Sonbahar', scene: 'forest-autumn.svg', base: ['#150a07', 'var(--bg)'], scrim: 0.3 },
      { id: 'night', fb: 'Gece ormanı', scene: 'forest-night.svg', base: ['#03050f', 'var(--bg)'], scrim: 0.15 },
      { id: 'moss', fb: 'Yosun', base: ['radial-gradient(90% 70% at 80% 0%, rgba(74,124,89,.35), transparent 65%), linear-gradient(180deg, #08130d 0%, #0f2418 100%)', 'linear-gradient(180deg, #f0f7f1 0%, #e2efe5 100%)'], orbs: ['74,124,89', '132,169,96', '45,106,79'] },
      { id: 'fern', fb: 'Eğrelti', base: ['radial-gradient(80% 60% at 10% 10%, rgba(101,163,13,.28), transparent 65%), linear-gradient(180deg, #0a1206 0%, #16240c 100%)', 'linear-gradient(180deg, #f4f9ec 0%, #e8f2d8 100%)'], orbs: ['101,163,13', '22,163,74', '202,138,4'] }
    ],
    mountain: [
      { id: 'peak', fb: 'Mor zirve', scene: '/images/brand/hero-peak.webp', base: ['#000', 'var(--bg)'], scrim: 0.2 },
      { id: 'glacier', fb: 'Buzul', scene: '/images/brand/hero-peak.webp', filter: 'hue-rotate(-50deg) saturate(.85)', base: ['#000', 'var(--bg)'], scrim: 0.2 },
      { id: 'range', fb: 'Sıradağlar', scene: '/images/brand/footer-range.webp', base: ['#000', 'var(--bg)'], scrim: 0.25 },
      { id: 'ember', fb: 'Kızıl sıradağ', scene: '/images/brand/footer-range.webp', filter: 'hue-rotate(125deg) saturate(1.1)', base: ['#000', 'var(--bg)'], scrim: 0.25 },
      { id: 'ridges', fb: 'Katmanlı dağlar', scene: 'mountain-ridges.svg', base: ['#060a16', 'var(--bg)'], scrim: 0.15 },
      { id: 'pnl', fb: 'K/Z zirvesi', scene: '/images/brand/hero-peak.webp', pnlHue: true, base: ['#000', 'var(--bg)'], scrim: 0.2 }
    ],
    daytime: [
      { id: 'auto', fb: 'Otomatik', auto: true },
      { id: 'dawn', fb: 'Şafak', part: 'dawn' },
      { id: 'day', fb: 'Gündüz', part: 'day' },
      { id: 'dusk', fb: 'Gün batımı', part: 'dusk' },
      { id: 'night', fb: 'Gece', part: 'night' }
    ],
    off: []
  };
  var DAYPART = {
    dawn: { scene: 'daytime-dawn.svg', base: '#141933', scrim: 0.35 },
    day: { scene: 'daytime-day.svg', base: '#2d6fb8', scrim: 0.5 },
    dusk: { scene: 'daytime-dusk.svg', base: '#1a1033', scrim: 0.35 },
    night: { scene: 'daytime-night.svg', base: '#02040c', scrim: 0.15 }
  };
  // "K/Z zirvesi": mor zirvenin tonu yöne göre döner (mor ≈ 255°: kâr yeşile, zarar kırmızıya)
  var PNL_HUE = { profit: 'hue-rotate(-110deg) saturate(1.1)', loss: 'hue-rotate(105deg) saturate(1.2)', neutral: 'none' };
  var STRENGTH = { 1: 0.6, 2: 1, 3: 1.4 };

  function sceneUrl(s) { return s.charAt(0) === '/' ? s : IMG + s; }
  function presetsOf(style) { return CATALOG[style] || []; }
  function findPreset(style, id) {
    var list = presetsOf(style);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0] || null;
  }

  // ── Tercih ─────────────────────────────────────────────────
  function defaults() { return { style: 'dynamic', presets: {}, glow: true, strength: 2 }; }
  function normalize(raw, legacyMode) {
    var p = defaults();
    if (!raw || typeof raw !== 'object') {
      if (legacyMode === 'off') p.style = 'off';
      else if (legacyMode === 'classic') { p.style = 'gradient'; p.presets.gradient = 'wawe'; }
      return p;
    }
    if (STYLES.indexOf(raw.style) >= 0) p.style = raw.style;
    if (raw.presets && typeof raw.presets === 'object') {
      STYLES.forEach(function (s) {
        var id = raw.presets[s];
        if (typeof id === 'string' && findPreset(s, id) && findPreset(s, id).id === id) p.presets[s] = id;
      });
    }
    if (typeof raw.glow === 'boolean') p.glow = raw.glow;
    if (raw.strength === 1 || raw.strength === 2 || raw.strength === 3) p.strength = raw.strength;
    return p;
  }
  function presetId(p, style) { var x = findPreset(style, p.presets[style]); return x ? x.id : ''; }

  // ── K/Z şiddeti ────────────────────────────────────────────
  // ratio: |K/Z| / (ortalama işlem büyüklüğü × 4). Ortalama bilinmiyorsa orta kademe.
  function tierOf(pnl, avgAbs) {
    if (!isFinite(pnl) || pnl === 0) return { state: 'neutral', tier: 0, k: 0.55 };
    var r = avgAbs > 0 ? Math.abs(pnl) / (avgAbs * 4) : 0.5;
    var tier = r < 0.25 ? 0 : (r < 0.75 ? 1 : 2);
    return { state: pnl > 0 ? 'profit' : 'loss', tier: tier, k: Math.round((0.45 + 0.55 * Math.min(1, r)) * 100) / 100 };
  }

  // ── Günün saati ────────────────────────────────────────────
  function daypartOf(hour) {
    if (hour >= 5 && hour < 8) return 'dawn';
    if (hour >= 8 && hour < 17) return 'day';
    if (hour >= 17 && hour < 20) return 'dusk';
    return 'night';
  }
  function currentHour(now) {
    now = now || new Date();
    try {
      var tz = global.WwTime && global.WwTime.getTz ? global.WwTime.getTz() : undefined;
      var h = parseInt(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(now), 10);
      if (isFinite(h)) return h % 24;
    } catch (e) { /* geçersiz saat dilimi: cihaz saati */ }
    return now.getHours();
  }

  // ── Çözümleme: tercih + K/Z + saat → <html> öznitelikleri ve CSS değişkenleri ──
  // ctx: { pnl, avgAbs, hour, light }
  function resolve(prefs, ctx) {
    var p = normalize(prefs), light = !!ctx.light, L = light ? 1 : 0;
    var t = tierOf(ctx.pnl, ctx.avgAbs);
    var attrs = { 'data-ww-bg': p.style, 'data-ww-bg-preset': '', 'data-ambient-state': t.state, 'data-ambient-tier': ['soft', 'mid', 'strong'][t.tier], 'data-ww-glow': 'off', 'data-ww-orbs': 'off', 'data-ww-daypart': '' };
    var vars = { '--wwbg-base': 'transparent', '--wwbg-scene': 'none', '--wwbg-scene-filter': 'none', '--wwbg-scene-o': '1', '--wwbg-scrim': '0', '--amb-k': '0' };
    if (p.style === 'off') return { attrs: attrs, vars: vars, enabled: false };

    var strength = STRENGTH[p.strength] || 1;
    var pre = findPreset(p.style, p.presets[p.style]);
    attrs['data-ww-bg-preset'] = pre ? pre.id : '';

    // K/Z ışığı renkleri (dynamic stilinde paletten; diğerlerinde klasik palet)
    var pal = PNL[(p.style === 'dynamic' && pre && pre.pnl) || 'classic'];
    var pc = t.state === 'neutral' ? NEUTRAL : pal[t.state][t.tier];
    vars['--pnl-c1'] = pc[0]; vars['--pnl-c2'] = pc[1]; vars['--pnl-c3'] = pc[2];
    var k = Math.min(1.25, t.k * strength * (light ? 0.55 : 1));
    vars['--pnl-k'] = String(Math.round(k * 100) / 100);

    if (p.style === 'dynamic') {
      attrs['data-ww-glow'] = 'on'; attrs['data-ww-orbs'] = 'on';
      vars['--amb-c1'] = pc[0]; vars['--amb-c2'] = pc[1]; vars['--amb-c3'] = pc[2]; vars['--amb-k'] = vars['--pnl-k'];
      return { attrs: attrs, vars: vars, enabled: true };
    }

    attrs['data-ww-glow'] = p.glow ? 'on' : 'off';
    var def = pre;
    if (p.style === 'daytime') {
      var part = pre && pre.part ? pre.part : daypartOf(ctx.hour);
      attrs['data-ww-daypart'] = part;
      def = { scene: DAYPART[part].scene, base: [DAYPART[part].base, 'var(--bg)'], scrim: DAYPART[part].scrim };
    }
    if (!def) return { attrs: attrs, vars: vars, enabled: true };
    if (def.base) vars['--wwbg-base'] = def.base[L];
    if (def.scene) {
      vars['--wwbg-scene'] = 'url("' + sceneUrl(def.scene) + '")';
      var filt = def.pnlHue ? PNL_HUE[t.state] : (def.filter || 'none');
      vars['--wwbg-scene-filter'] = filt;
      vars['--wwbg-scene-o'] = light ? '0.22' : '1';
      vars['--wwbg-scrim'] = String(light ? 0 : (def.scrim || 0));
    }
    if (def.orbs) {
      attrs['data-ww-orbs'] = 'on';
      vars['--amb-c1'] = def.orbs[0]; vars['--amb-c2'] = def.orbs[1]; vars['--amb-c3'] = def.orbs[2];
      vars['--amb-k'] = String(Math.round(0.8 * strength * (light ? 0.5 : 1) * 100) / 100);
    }
    return { attrs: attrs, vars: vars, enabled: true };
  }

  // Ayarlar'daki küçük önizleme kutusu için arka plan (CSS background değeri + filtre)
  function swatch(style, id, light) {
    var L = light ? 1 : 0, pre = findPreset(style, id);
    if (!pre) return { bg: 'var(--surface2)', filter: 'none' };
    if (style === 'dynamic') {
      var pal = PNL[pre.pnl];
      return { bg: 'linear-gradient(115deg, rgb(' + pal.profit[2][0] + ') 0%, rgb(' + pal.profit[0][0] + ') 30%, #0b0b12 50%, rgb(' + pal.loss[0][0] + ') 70%, rgb(' + pal.loss[2][0] + ') 100%)', filter: 'none' };
    }
    if (style === 'daytime') {
      var part = pre.part || daypartOf(currentHour());
      return { bg: 'url("' + sceneUrl(DAYPART[part].scene) + '") center bottom / cover no-repeat', filter: 'none', part: part };
    }
    if (pre.scene) return { bg: 'url("' + sceneUrl(pre.scene) + '") center bottom / cover no-repeat, ' + (pre.base ? pre.base[0] : '#000'), filter: pre.pnlHue ? PNL_HUE.profit : (pre.filter || 'none') };
    return { bg: pre.base ? pre.base[L] : 'var(--surface2)', filter: 'none' };
  }

  // ── Tarayıcı tarafı ────────────────────────────────────────
  var ls = function () { try { return global.localStorage; } catch (e) { return null; } };
  function readPrefs() {
    var s = ls(); if (!s) return defaults();
    var raw = null;
    try { raw = JSON.parse(s.getItem(KEY) || 'null'); } catch (e) { raw = null; }
    return normalize(raw, raw ? null : s.getItem('ww_ambient_mode'));
  }
  function savePrefs(p) {
    var s = ls(); if (!s) return;
    p = normalize(p);
    try {
      s.setItem(KEY, JSON.stringify(p));
      // eski anahtar: henüz güncellenmemiş açık sekmeler ve sürümler için
      s.setItem('ww_ambient_mode', p.style === 'off' ? 'off' : (p.style === 'dynamic' ? 'dynamic' : 'classic'));
    } catch (e) { /* dolu / kapalı depolama */ }
  }
  function pnlCtx() {
    var s = ls(), pnl = 0, avg = 0;
    if (s) { pnl = parseFloat(s.getItem('ww_cached_pnl')); avg = parseFloat(s.getItem('ww_cached_pnl_avg')); }
    return { pnl: isFinite(pnl) ? pnl : 0, avgAbs: isFinite(avg) ? avg : 0 };
  }
  function isLight() {
    var d = global.document;
    return !!d && (d.documentElement.classList.contains('light-theme') || (d.body && d.body.classList.contains('light-theme')));
  }

  var preview = null; // { state, tier } — Ayarlar'daki önizleme düğmeleri (kaydedilmez)
  function write(r, snap) {
    var d = global.document; if (!d) return;
    var els = [d.documentElement]; if (d.body) els.push(d.body);
    els.forEach(function (el) {
      el.classList.toggle('ambient-enabled', r.enabled);
      el.classList.toggle('ambient-disabled', !r.enabled);
      Object.keys(r.attrs).forEach(function (a) { el.setAttribute(a, r.attrs[a]); });
    });
    var st = d.documentElement.style;
    Object.keys(r.vars).forEach(function (v) { st.setProperty(v, r.vars[v]); });
    ['--pnl-c1', '--pnl-c2', '--pnl-c3', '--pnl-k', '--amb-c1', '--amb-c2', '--amb-c3'].forEach(function (v) { if (!(v in r.vars)) st.removeProperty(v); });
    if (snap) {
      var s = ls();
      try { if (s) { s.setItem(SNAP, JSON.stringify({ a: r.attrs, v: r.vars, e: r.enabled })); s.setItem('ww_ambient_state', r.attrs['data-ambient-state']); } } catch (e) { /* yok say */ }
    }
  }
  function apply(prefs) {
    var ctx = pnlCtx(), p = prefs || readPrefs();
    ctx.hour = currentHour(); ctx.light = isLight();
    if (preview) { ctx.pnl = preview.state === 'neutral' ? 0 : (preview.state === 'profit' ? 1 : -1) * [0.5, 2, 5][preview.tier]; ctx.avgAbs = 1; }
    var r = resolve(p, ctx);
    write(r, !preview);
    try { global.dispatchEvent(new CustomEvent('ww-ambient-change', { detail: { prefs: p, attrs: r.attrs } })); } catch (e) { /* eski tarayıcı */ }
    return r;
  }
  // Dashboard: seçili dönemin K/Z'si ve ortalama kapalı işlem büyüklüğü (şiddet için)
  function setPnl(pnl, avgAbs) {
    var s = ls();
    try {
      if (s) {
        s.setItem('ww_cached_pnl', String(isFinite(pnl) ? pnl : 0));
        if (avgAbs !== undefined) s.setItem('ww_cached_pnl_avg', String(isFinite(avgAbs) && avgAbs > 0 ? avgAbs : 0));
      }
    } catch (e) { /* yok say */ }
    return apply();
  }
  function setPrefs(patch) {
    var p = readPrefs();
    Object.keys(patch || {}).forEach(function (k) {
      if (k === 'presets') Object.keys(patch.presets).forEach(function (s) { p.presets[s] = patch.presets[s]; });
      else p[k] = patch[k];
    });
    savePrefs(p);
    preview = null;
    return apply(normalize(p));
  }
  function setPreview(state, tier) { preview = state ? { state: state, tier: tier || 0 } : null; return apply(); }

  var api = {
    STYLES: STYLES, CATALOG: CATALOG, PNL: PNL, DAYPART: DAYPART,
    normalize: normalize, tierOf: tierOf, daypartOf: daypartOf, resolve: resolve, swatch: swatch, presetsOf: presetsOf, presetId: presetId,
    read: readPrefs, set: setPrefs, apply: apply, setPnl: setPnl, preview: setPreview, hour: currentHour
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  global.WwAmbient = api;

  // ilk uygulama + günün saati için 5 dakikada bir, tema değişince ve başka sekmede tercih değişince yeniden
  var d = global.document;
  function boot() {
    apply();
    // yalnızca açık/koyu tema değişince (write() de sınıf yazar; her sınıf değişiminde uygulamak döngü kurardı)
    var light = isLight();
    try {
      var mo = new MutationObserver(function () { var now = isLight(); if (now !== light) { light = now; apply(); } });
      mo.observe(d.documentElement, { attributes: true, attributeFilter: ['class'] });
      if (d.body) mo.observe(d.body, { attributes: true, attributeFilter: ['class'] });
    } catch (e) { /* yok */ }
  }
  if (d) {
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }
  var lastPart = null;
  setInterval(function () {
    var p = readPrefs();
    if (p.style !== 'daytime') return;
    var part = daypartOf(currentHour());
    if (part !== lastPart) { lastPart = part; apply(p); }
  }, 5 * 60 * 1000);
  global.addEventListener('storage', function (e) {
    if (e.key === KEY || e.key === 'ww_cached_pnl' || e.key === 'ww_ambient_mode') apply();
  });
})(typeof window !== 'undefined' ? window : this);
