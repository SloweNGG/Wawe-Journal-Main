// ============================================================
// WAWE TEMA MOTORU — src/scripts/theme-engine.js
// ============================================================
// BaseHead.astro bu dosyayı derlemede <head>'e satır içi gömer (ekstra istek yok, sayfa çizilmeden çalışır).
// Testler: tests/theme-engine.test.js (vm içinde window nesnesiyle yüklenir).
//
// Ne yapar:
//  - Kayıtlı temayı (localStorage ww_custom_theme) okur; eski düz biçimi (backgroundColor/surfaceColor/...) de anlar.
//  - Etkin moda (koyu/açık) göre CSS değişkenlerini tek bir <style id="ww-theme-vars"> ile yazar:
//      html:root, html:root body { --bg: ...; --surface: ...; --ac: ...; ... }
//    "html:root body" seçicisi body.light-theme'deki açık tema değişkenlerini de geçer; değişkenler hem kökte
//    (:root'ta tanımlı bileşik değişkenler, ör. --modal-bg = var(--card-bg)) hem body'de güncellenir.
//  - Vurgu rengi: uygulamadaki sabit mor tonları --ac, --ac-l1 ... (BaseHead #ww-accent-defaults) değişkenlerine
//    çevrildi. Seçilen vurgu renginden her ton, varsayılan morla arasındaki ton/doygunluk/açıklık farkı korunarak
//    türetilir; varsayılan mor seçiliyse hiçbir şey yazılmaz (görünüm birebir aynı kalır).
//  - Paletin tamamı moda ait varsayılanla aynıysa palet değişkenleri de yazılmaz.
//  - Hesaba kaydetme: user_profiles.theme (jsonb). Oturum başına bir kez okunur; yeni olan (ts) kazanır.
//
// Kayıt biçimi (v2):
//   { v: 2, ts, dark: Palette|null, light: Palette|null, fontSize?,
//     backgroundColor, surfaceColor, borderColor, textColor }   ← dark paletinin eski adlarla kopyası:
//                                                                 sayfalardaki eski tema kodu bunları okur
//   Palette = { bg, surface, border, text, accent, preset: id|null }
// ============================================================
(function (window) {
  'use strict';
  if (window.WWTheme) return;
  var document = window.document;
  var KEY = 'ww_custom_theme';

  // Varsayılan değerleri BaseHead #ww-accent-defaults ile birebir aynı (test kontrol eder)
  var BASE = '#8b5cf6';
  var RAMP = [
    ['ac', '#8b5cf6'], ['ac-l1', '#a78bfa'], ['ac-l2', '#c4b5fd'], ['ac-l3', '#ddd6fe'], ['ac-l4', '#e9d5ff'],
    ['ac-d1', '#7c3aed'], ['ac-d2', '#6d28d9'], ['ac-d3', '#5b21b6'], ['ac-d4', '#4c1d95'], ['ac-d5', '#3b0764'],
    ['ac-b1', '#7c6dfa'], ['ac-b2', '#7b6ef6'], ['ac-b3', '#9b8bfa'], ['ac-b4', '#6d5ce0'], ['ac-b5', '#6c5ce7'], ['ac-b6', '#6b5bd6'],
    ['ac-p1', '#c084fc'], ['ac-p2', '#a855f7'], ['ac-p3', '#d946ef'], ['ac-p4', '#9333ea'],
    ['ac-i1', '#6366f1'], ['ac-i2', '#4f46e5'], ['ac-i3', '#4338ca']
  ];

  // Hazır temalar. İlk eleman o modun varsayılanıdır (seçilince sitenin standart görünümü).
  // Yeşil / kırmızı vurgu yok: kâr / zarar renkleriyle karışır.
  var PRESETS = {
    dark: [
      { id: 'obsidian', name: 'Obsidian', bg: '#07070c', surface: '#0e0e16', border: '#1a1a28', text: '#f0f0f8', accent: '#8b5cf6' },
      { id: 'violet', name: 'Deep Violet', bg: '#080612', surface: '#120e24', border: '#261e47', text: '#f0f0f8', accent: '#a855f7' },
      { id: 'indigo', name: 'Indigo Night', bg: '#06070f', surface: '#0d0f1e', border: '#1c2040', text: '#eef0fb', accent: '#6366f1' },
      { id: 'slate', name: 'Midnight Slate', bg: '#090d14', surface: '#0f172a', border: '#1e293b', text: '#f1f5f9', accent: '#3b82f6' },
      { id: 'arctic', name: 'Arctic', bg: '#0b0f14', surface: '#111820', border: '#223040', text: '#e8f0f8', accent: '#5b8def' },
      { id: 'ocean', name: 'Ocean', bg: '#03090c', surface: '#071318', border: '#12303a', text: '#e6f6fa', accent: '#0891b2' },
      { id: 'amber', name: 'Amber', bg: '#0b0906', surface: '#15110a', border: '#2d2414', text: '#f7f1e6', accent: '#d97706' },
      { id: 'sakura', name: 'Sakura', bg: '#0c0709', surface: '#170d12', border: '#33192a', text: '#fbeef4', accent: '#db2777' },
      { id: 'graphite', name: 'Graphite', bg: '#0b0c0e', surface: '#131417', border: '#24262b', text: '#e7e9ee', accent: '#64748b' },
      { id: 'stealth', name: 'Pure Stealth', bg: '#000000', surface: '#0c0c0e', border: '#242428', text: '#ffffff', accent: '#71717a' }
    ],
    light: [
      { id: 'lavender', name: 'Lavender', bg: '#f4f4f9', surface: '#ffffff', border: '#e2e2ea', text: '#0f172a', accent: '#8b5cf6' },
      { id: 'ice', name: 'Ice', bg: '#eef3f8', surface: '#ffffff', border: '#d8e1ec', text: '#0f172a', accent: '#2563eb' },
      { id: 'paper', name: 'Paper', bg: '#f5f1e8', surface: '#fffdf8', border: '#e6dfcf', text: '#1f1a14', accent: '#b45309' },
      { id: 'rose', name: 'Rose', bg: '#fbf5f7', surface: '#ffffff', border: '#f0dde4', text: '#2a1520', accent: '#db2777' },
      { id: 'fog', name: 'Fog', bg: '#f3f4f6', surface: '#ffffff', border: '#e5e7eb', text: '#111827', accent: '#475569' }
    ]
  };
  var FIELDS = ['bg', 'surface', 'border', 'text', 'accent'];
  var LEGACY_INLINE = ['--bg', '--surface', '--surface2', '--border', '--text', '--card-bg', '--accent', '--accent2'];

  // ---------- renk yardımcıları ----------
  function norm(h) {
    if (typeof h !== 'string') return null;
    var m = h.trim().match(/^#?([0-9a-f]{6})$/i);
    if (m) return '#' + m[1].toLowerCase();
    m = h.trim().match(/^#?([0-9a-f]{3})$/i);
    if (m) return '#' + m[1].replace(/./g, function (c) { return c + c; }).toLowerCase();
    return null;
  }
  function rgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hex(r, g, b) {
    return '#' + [r, g, b].map(function (v) {
      v = Math.round(Math.max(0, Math.min(255, v))).toString(16); return v.length < 2 ? '0' + v : v;
    }).join('');
  }
  function mix(a, b, t) { // t: a'nın ağırlığı (0..1)
    var x = rgb(a), y = rgb(b);
    return hex(x[0] * t + y[0] * (1 - t), x[1] * t + y[1] * (1 - t), x[2] * t + y[2] * (1 - t));
  }
  function toHsl(h) {
    var c = rgb(h), r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min, hh = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === r) hh = ((g - b) / d) % 6; else if (max === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4;
      hh *= 60; if (hh < 0) hh += 360;
    }
    return [hh, s, l];
  }
  function fromHsl(h, s, l) {
    h = ((h % 360) + 360) % 360;
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return hex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function luminance(h) {
    var c = rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    var x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  // Varsayılan morun tonlarını yeni vurgu rengine taşı: ton farkı, doygunluk oranı, açıklık farkı korunur
  function ramp(accent) {
    accent = norm(accent);
    var out = {};
    if (!accent || accent === BASE) return out;
    var b = toHsl(BASE), a = toHsl(accent);
    for (var i = 0; i < RAMP.length; i++) {
      var d = toHsl(RAMP[i][1]);
      var col = i === 0 ? accent : fromHsl(a[0] + (d[0] - b[0]), clamp(a[1] * (d[1] / b[1]), 0, 1), clamp(a[2] + (d[2] - b[2]), 0.02, 0.98));
      var c = rgb(col);
      out['--' + RAMP[i][0]] = col;
      out['--' + RAMP[i][0] + '-rgb'] = c.join(',');
    }
    return out;
  }

  // ---------- kayıt ----------
  function cleanPalette(p, mode) {
    if (!p || typeof p !== 'object') return null;
    var def = PRESETS[mode][0], out = {};
    for (var i = 0; i < FIELDS.length; i++) out[FIELDS[i]] = norm(p[FIELDS[i]]) || def[FIELDS[i]];
    out.preset = typeof p.preset === 'string' && presetById(mode, p.preset) ? p.preset : null;
    return out;
  }
  function presetById(mode, id) {
    var list = PRESETS[mode] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function normalize(raw) {
    var st = { v: 2, ts: 0, dark: null, light: null, fontSize: null };
    if (!raw || typeof raw !== 'object') return st;
    st.ts = typeof raw.ts === 'number' ? raw.ts : 0;
    var fs = parseInt(raw.fontSize, 10);
    if (fs >= 12 && fs <= 22) st.fontSize = fs;
    if (raw.v === 2) {
      st.dark = cleanPalette(raw.dark, 'dark');
      st.light = cleanPalette(raw.light, 'light');
    } else if (raw.backgroundColor || raw.surfaceColor || raw.borderColor || raw.textColor || raw.bg || raw.surface) {
      // v1: yalnızca koyu tema renkleri (eski stüdyo)
      st.dark = cleanPalette({
        bg: raw.backgroundColor || raw.bg, surface: raw.surfaceColor || raw.surface,
        border: raw.borderColor || raw.border, text: raw.textColor, accent: raw.accentColor || raw.accent
      }, 'dark');
    }
    return st;
  }
  function serialize(st) {
    var o = { v: 2, ts: st.ts || Date.now(), dark: st.dark || null, light: st.light || null };
    if (st.fontSize) o.fontSize = st.fontSize;
    if (st.dark) { // eski okuyucular için
      o.backgroundColor = st.dark.bg; o.surfaceColor = st.dark.surface;
      o.borderColor = st.dark.border; o.textColor = st.dark.text;
    }
    return o;
  }
  function read() {
    try { return normalize(JSON.parse(window.localStorage.getItem(KEY) || 'null')); } catch (e) { return normalize(null); }
  }
  function mode() {
    try { return window.localStorage.getItem('ww_theme') === 'light' ? 'light' : 'dark'; } catch (e) { return 'dark'; }
  }
  function samePalette(a, b) {
    for (var i = 0; i < FIELDS.length; i++) if (norm(a[FIELDS[i]]) !== norm(b[FIELDS[i]])) return false;
    return true;
  }
  function isDefault(p, m) { return !p || samePalette(p, PRESETS[m][0]); }
  function matchPreset(p, m) {
    if (!p) return PRESETS[m][0].id;
    var list = PRESETS[m];
    for (var i = 0; i < list.length; i++) if (samePalette(p, list[i])) return list[i].id;
    return null;
  }

  // ---------- CSS değişkenleri ----------
  function vars(p, m) {
    var out = {};
    if (!p) return out;
    var def = PRESETS[m][0];
    var colorsDefault = p.bg === def.bg && p.surface === def.surface && p.border === def.border && p.text === def.text;
    if (!colorsDefault) {
      out['--bg'] = p.bg;
      out['--surface'] = p.surface;
      out['--border'] = p.border;
      out['--text'] = p.text;
      if (m === 'dark') {
        out['--bg2'] = mix(p.bg, p.surface, 0.5);
        out['--surface2'] = mix(p.text, p.surface, 0.035);
        out['--muted'] = out['--text-muted'] = mix(p.text, p.surface, 0.64);
        // kutular varsayılan kutu renginde saf siyah kalır (koyu tema tasarımı)
        out['--card-bg'] = p.surface === def.surface ? '#000' : p.surface;
      } else {
        out['--bg2'] = mix(p.bg, p.border, 0.5);
        out['--surface2'] = mix(p.bg, p.border, 0.75);
        out['--muted'] = mix(p.text, p.surface, 0.65);
        out['--text-muted'] = mix(p.text, p.surface, 0.88);
      }
    }
    var r = ramp(p.accent);
    for (var k in r) out[k] = r[k];
    return out;
  }
  function cssFor(p, m) {
    var v = vars(p, m), body = '';
    for (var k in v) body += k + ':' + v[k] + ';';
    return body ? 'html:root,html:root body{' + body + '}' : '';
  }

  var styleEl = null;
  function writeCss(css) {
    if (!styleEl) styleEl = document.getElementById('ww-theme-vars');
    if (!styleEl) {
      if (!css) return;
      styleEl = document.createElement('style');
      styleEl.id = 'ww-theme-vars';
      (document.head || document.documentElement).appendChild(styleEl);
    }
    if (styleEl.textContent !== css) styleEl.textContent = css;
  }

  // Kayıtlı (ya da verilen) temayı etkin moda uygula. Sayfalardaki eski kodun <html>'e yazdığı satır içi
  // değişkenler temizlenir (yoksa tema sıfırlanınca eski renkler body'ye miras kalırdı).
  function apply(st, m) {
    st = st || read();
    m = m || mode();
    var root = document.documentElement;
    try {
      for (var i = 0; i < LEGACY_INLINE.length; i++) root.style.removeProperty(LEGACY_INLINE[i]);
      root.classList.toggle('light-theme', m === 'light');
      if (document.body) document.body.classList.toggle('light-theme', m === 'light');
    } catch (e) {}
    writeCss(cssFor(st[m], m));
    return st;
  }
  // Kaydetmeden önizleme (Tema stüdyosu)
  function preview(p, m) {
    m = m || mode();
    writeCss(cssFor(cleanPalette(p, m), m));
  }

  function emit(st) {
    try { window.dispatchEvent(new CustomEvent('ww-theme-change', { detail: st })); } catch (e) {}
    // eski dinleyiciler (dashboard grafik yenileme vb.)
    try {
      var ev = { detail: { settings: serialize(st) } };
      window.dispatchEvent(new CustomEvent('themeChanged', ev));
      document.dispatchEvent(new CustomEvent('themeChanged', ev));
      window.dispatchEvent(new CustomEvent('chartsReset', { detail: { source: 'theme' } }));
    } catch (e) {}
  }

  function store(st) {
    var o = serialize(st);
    try {
      if (!o.dark && !o.light && !o.fontSize) window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, JSON.stringify(o));
    } catch (e) {}
    return o;
  }

  // Kaydet: yerel + uygula + hesaba gönder
  function save(st, opts) {
    st = normalize(serialize(st));
    st.ts = Date.now();
    var o = store(st);
    apply(st);
    emit(st);
    if (!(opts && opts.local)) push(o);
    return st;
  }

  // ---------- paylaşım kodu: WAWE-D-<bg><surface><border><text><accent> ----------
  function encode(p, m) {
    p = cleanPalette(p, m);
    return 'WAWE-' + (m === 'light' ? 'L' : 'D') + '-' + FIELDS.map(function (f) { return p[f].slice(1); }).join('').toUpperCase();
  }
  function decode(code) {
    var mm = String(code || '').trim().match(/^WAWE-([DL])-([0-9a-f]{30})$/i);
    if (!mm) return null;
    var hx = mm[2].toLowerCase(), p = {};
    for (var i = 0; i < FIELDS.length; i++) p[FIELDS[i]] = '#' + hx.slice(i * 6, i * 6 + 6);
    var m = mm[1].toUpperCase() === 'L' ? 'light' : 'dark';
    p.preset = matchPreset(p, m);
    return { mode: m, palette: p };
  }

  // ---------- hesapla eşitleme (user_profiles.theme) ----------
  function client() { return window.sb || null; }
  function session() {
    var c = client();
    if (!c || !c.auth || typeof c.auth.getSession !== 'function') return Promise.resolve(null);
    return c.auth.getSession().then(function (r) { return r && r.data && r.data.session; }).catch(function () { return null; });
  }
  function push(o) {
    return session().then(function (s) {
      if (!s) return false;
      return client().from('user_profiles').update({ theme: o }).eq('id', s.user.id)
        .then(function (r) { return !(r && r.error); }, function () { return false; });
    });
  }
  // Oturum başına bir kez: hesaptaki tema daha yeniyse onu al, yereldeki daha yeniyse hesaba yaz
  function pull() {
    try { if (window.sessionStorage.getItem('ww_theme_synced') === '1') return Promise.resolve(false); } catch (e) {}
    return session().then(function (s) {
      if (!s) return false;
      return client().from('user_profiles').select('theme').eq('id', s.user.id).maybeSingle().then(function (r) {
        try { window.sessionStorage.setItem('ww_theme_synced', '1'); } catch (e) {}
        if (!r || r.error || !r.data) return false; // sütun henüz yoksa sessizce geç
        var remote = r.data.theme && typeof r.data.theme === 'object' ? normalize(r.data.theme) : null;
        var local = read();
        if (remote && remote.ts > (local.ts || 0)) {
          store(remote); apply(remote); emit(remote);
          if (remote.fontSize) { try { window.localStorage.setItem('ww_font_size', String(remote.fontSize)); document.body.style.fontSize = remote.fontSize + 'px'; } catch (e) {} }
          return 'pulled';
        }
        if (local.ts && (!remote || local.ts > remote.ts)) { push(serialize(local)); return 'pushed'; }
        return false;
      }, function () { return false; });
    });
  }
  // Supabase istemcisi sayfada sonradan yüklenir; hazır olunca bir kez dene
  function syncSoon() {
    var tries = 0;
    function tick() {
      if (client()) { pull(); return; }
      if (++tries < 40) setTimeout(tick, 500);
    }
    if (document.readyState === 'complete') setTimeout(tick, 800);
    else window.addEventListener('load', function () { setTimeout(tick, 800); });
  }

  // Grafikler (canvas) CSS değişkeni okuyamaz: çizerken o anki vurgu rengini buradan alırlar
  function accent() {
    try {
      var v = window.getComputedStyle(document.body || document.documentElement).getPropertyValue('--ac').trim();
      return norm(v) || BASE;
    } catch (e) { return BASE; }
  }

  // başka sekmede tema ya da mod değişirse
  window.addEventListener('storage', function (e) {
    if (e.key === KEY || e.key === 'ww_theme') apply();
  });

  window.WWTheme = {
    KEY: KEY, BASE: BASE, RAMP: RAMP, PRESETS: PRESETS, FIELDS: FIELDS,
    read: read, normalize: normalize, serialize: serialize, mode: mode,
    apply: apply, preview: preview, save: save, vars: vars, cssFor: cssFor, ramp: ramp,
    isDefault: isDefault, matchPreset: matchPreset, presetById: presetById, cleanPalette: cleanPalette,
    encode: encode, decode: decode, contrast: contrast, mix: mix, norm: norm,
    pull: pull, push: push, syncSoon: syncSoon, accent: accent
  };

  apply();
})(window);
