// Backtest v2: chart appearance (window.WwBtLook). Candle style (candles, Heikin Ashi, bars, line, hollow candles), colors,
// show/hide switches, ready-made themes and the user's own saved themes. Preferences live in localStorage (per browser).
// Free plan: the two FREE_PRESETS only; everything else needs Premium (the page checks the plan, this module only describes it).
// Pure parts (resolve, heikinAshi, sessions) are unit tested; series/primitive helpers need window.LightweightCharts.
(function (global) {
  'use strict';

  var KEY = 'ww_bt_look_v1';
  var STYLES = ['candles', 'heikin', 'bars', 'line'];
  var COLOR_KEYS = ['up', 'down', 'wickUp', 'wickDown', 'borderUp', 'borderDown', 'bg', 'grid'];
  var SWITCHES = ['showGrid', 'showVolume', 'showLastPrice', 'showSessions'];
  var FREE_PRESETS = ['wawe', 'tradingview'];
  var MAX_SAVED = 12;

  // Ready-made themes. A color of null follows the site theme (pure black / white background, the shared grid line).
  function presets(light) {
    return {
      wawe: { style: 'candles', hollow: false, up: light ? '#16a34a' : '#22c55e', down: light ? '#dc2626' : '#ef4444',
        wickUp: null, wickDown: null, borderUp: null, borderDown: null, bg: null, grid: null,
        showGrid: true, showVolume: false, showLastPrice: true, showSessions: false },
      tradingview: { style: 'candles', hollow: false, up: '#26a69a', down: '#ef5350', wickUp: '#26a69a', wickDown: '#ef5350',
        borderUp: '#26a69a', borderDown: '#ef5350', bg: null, grid: light ? 'rgba(42,46,57,0.06)' : 'rgba(42,46,57,0.6)',
        showGrid: true, showVolume: true, showLastPrice: true, showSessions: false },
      mono: { style: 'candles', hollow: true, up: light ? '#111827' : '#f5f5f5', down: light ? '#111827' : '#f5f5f5',
        wickUp: light ? '#4b5563' : '#a3a3a3', wickDown: light ? '#4b5563' : '#a3a3a3', borderUp: light ? '#111827' : '#f5f5f5', borderDown: light ? '#111827' : '#f5f5f5',
        bg: null, grid: null, showGrid: false, showVolume: false, showLastPrice: true, showSessions: false },
      night: { style: 'candles', hollow: false, up: '#38bdf8', down: '#f472b6', wickUp: '#7dd3fc', wickDown: '#f9a8d4',
        borderUp: '#38bdf8', borderDown: '#f472b6', bg: light ? '#eef4ff' : '#0b1426', grid: light ? 'rgba(30,64,175,0.08)' : 'rgba(125,211,252,0.07)',
        showGrid: true, showVolume: false, showLastPrice: true, showSessions: true }
    };
  }
  var PRESET_IDS = ['wawe', 'tradingview', 'mono', 'night'];

  function isColor(v) { return typeof v === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([0-9.,\s%]+\))$/i.test(v.trim()); }
  function clean(o) {
    var out = {};
    if (!o || typeof o !== 'object') return out;
    if (STYLES.indexOf(o.style) >= 0) out.style = o.style;
    if (typeof o.hollow === 'boolean') out.hollow = o.hollow;
    COLOR_KEYS.forEach(function (k) { if (o[k] === null || isColor(o[k])) out[k] = o[k]; });
    SWITCHES.forEach(function (k) { if (typeof o[k] === 'boolean') out[k] = o[k]; });
    return out;
  }
  // Stored state: { preset, custom (overrides on top of the preset), saved: [{ id, name, look }] }
  function normalize(s) {
    s = s && typeof s === 'object' ? s : {};
    var saved = Array.isArray(s.saved) ? s.saved.filter(function (x) { return x && typeof x.id === 'string' && typeof x.name === 'string'; })
      .slice(0, MAX_SAVED).map(function (x) { return { id: x.id, name: String(x.name).slice(0, 40), look: clean(x.look) }; }) : [];
    var preset = PRESET_IDS.indexOf(s.preset) >= 0 || (typeof s.preset === 'string' && saved.some(function (x) { return 'saved:' + x.id === s.preset; })) ? s.preset : 'wawe';
    return { preset: preset, custom: clean(s.custom), saved: saved };
  }
  function load(storage) {
    var raw = null, p = null;
    try { raw = storage ? storage.getItem(KEY) : null; } catch (e) { raw = null; }
    try { p = raw ? JSON.parse(raw) : null; } catch (e) { p = null; }
    return normalize(p);
  }
  function save(storage, s) { try { if (storage) storage.setItem(KEY, JSON.stringify(normalize(s))); return true; } catch (e) { return false; } }

  // Complete look for drawing. `pro` false: only a free preset, no overrides (a lapsed Premium keeps the choice stored but sees WaweJournal).
  function resolve(state, light, pro) {
    var P = presets(!!light), base;
    var id = state.preset;
    if (!pro && FREE_PRESETS.indexOf(id) < 0) id = 'wawe';
    if (id.indexOf('saved:') === 0) {
      var sv = null; state.saved.forEach(function (x) { if ('saved:' + x.id === id) sv = x; });
      base = Object.assign({}, P.wawe, sv ? sv.look : {});
    } else base = Object.assign({}, P[id] || P.wawe);
    var look = pro ? Object.assign(base, state.custom) : base;
    look.id = id;
    look.wickUp = look.wickUp || look.up; look.wickDown = look.wickDown || look.down;
    look.borderUp = look.borderUp || look.up; look.borderDown = look.borderDown || look.down;
    return look;
  }
  // a stored state is "premium" when it uses anything a free user cannot pick
  function needsPro(state) { return FREE_PRESETS.indexOf(state.preset) < 0 || Object.keys(state.custom || {}).length > 0; }

  // ---------------------------------------------------------------- Heikin Ashi (chart bars in prices, same times)
  // haClose = (o+h+l+c)/4; haOpen = (prev haOpen + prev haClose)/2 (first: (o+c)/2); high/low include the HA body.
  // `prev` continues an existing series: ha(bars, from, prevHa) recomputes only bars[from..] (the replay updates the tail).
  function heikinAshi(bars, from, out) {
    out = out || [];
    from = Math.max(0, from || 0);
    if (out.length > from) out.length = from;
    for (var i = from; i < bars.length; i++) {
      var b = bars[i], p = i > 0 ? out[i - 1] : null;
      var c = (b.open + b.high + b.low + b.close) / 4, o = p ? (p.open + p.close) / 2 : (b.open + b.close) / 2;
      out.push({ time: b.time, open: o, high: Math.max(b.high, o, c), low: Math.min(b.low, o, c), close: c });
    }
    return out;
  }

  // ---------------------------------------------------------------- trading sessions (UTC seconds -> sessions open at that minute)
  // Local opening hours in each centre's own time zone (DST through Intl): Tokyo 09-18, London 08-17, New York 08-17.
  var SESSIONS = [
    { id: 'asia', tz: 'Asia/Tokyo', from: 9 * 60, to: 18 * 60 },
    { id: 'london', tz: 'Europe/London', from: 8 * 60, to: 17 * 60 },
    { id: 'ny', tz: 'America/New_York', from: 8 * 60, to: 17 * 60 }
  ];
  var fmts = {}, hourCache = {};
  function localMinute(sec, tz) {
    var f = fmts[tz] || (fmts[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit', weekday: 'short' }));
    var h = 0, m = 0, wd = '';
    f.formatToParts(new Date(sec * 1000)).forEach(function (p) { if (p.type === 'hour') h = +p.value % 24; else if (p.type === 'minute') m = +p.value; else if (p.type === 'weekday') wd = p.value; });
    return { min: h * 60 + m, weekend: wd === 'Sat' || wd === 'Sun' };
  }
  // ids of the sessions open at `sec` (cached per UTC hour boundary + minute offset is exact because all offsets are whole quarter hours)
  function sessionsAt(sec) {
    var key = Math.floor(sec / 900);
    if (hourCache[key]) return hourCache[key];
    var out = [];
    SESSIONS.forEach(function (s) { var lm = localMinute(key * 900, s.tz); if (!lm.weekend && lm.min >= s.from && lm.min < s.to) out.push(s.id); });
    if (Object.keys(hourCache).length > 20000) hourCache = {};
    return (hourCache[key] = out);
  }

  // ---------------------------------------------------------------- chart helpers (browser)
  function seriesOptions(look, priceFormat) {
    // Heikin Ashi closes are not prices: the series line stays off and the page draws the real last price itself (lastPriceLine)
    var last = look.showLastPrice && look.style !== 'heikin';
    var common = { priceFormat: priceFormat, lastValueVisible: last, priceLineVisible: last };
    if (look.style === 'line') return Object.assign(common, { color: look.up, lineWidth: 2 });
    if (look.style === 'bars') return Object.assign(common, { upColor: look.up, downColor: look.down, thinBars: false, openVisible: true });
    return Object.assign(common, {
      upColor: look.hollow ? 'rgba(0,0,0,0)' : look.up, downColor: look.down,
      borderVisible: true, borderUpColor: look.borderUp, borderDownColor: look.borderDown,
      wickVisible: true, wickUpColor: look.wickUp, wickDownColor: look.wickDown
    });
  }
  function addSeries(chart, look, priceFormat) {
    var o = seriesOptions(look, priceFormat);
    if (look.style === 'line') return chart.addLineSeries(o);
    if (look.style === 'bars') return chart.addBarSeries(o);
    return chart.addCandlestickSeries(o);
  }
  // chart options of a look (merged over WwChart.lwc in the page)
  function chartOptions(look, colors) {
    return {
      layout: { background: { type: 'solid', color: look.bg || 'transparent' } },
      grid: { horzLines: { visible: look.showGrid, color: look.grid || colors.grid }, vertLines: { visible: false } }
    };
  }
  // data for the series of a look: bars (OHLC) for candles/bars, HA bars, or { time, value } for the line
  function toSeriesData(look, bars, ha) {
    if (look.style === 'line') return bars.map(function (b) { return { time: b.time, value: b.close }; });
    if (look.style === 'heikin') return ha;
    return bars;
  }

  // Background bands of the trading sessions (series primitive, drawn under the candles).
  function createSessionPrimitive(opts) {
    var api = { chart: null, series: null, requestUpdate: null }, visible = false;
    var COLORS = opts.colors || { asia: 'rgba(56,189,248,0.07)', london: 'rgba(250,204,21,0.06)', ny: 'rgba(168,85,247,0.07)' };
    var renderer = {
      draw: function () {},
      drawBackground: function (target) {
        if (!visible || !api.chart) return;
        var ts = api.chart.timeScale(), bars = opts.bars(), r = ts.getVisibleLogicalRange();
        if (!bars.length || !r || opts.tfMin() >= 240) return;
        var from = Math.max(0, Math.floor(r.from) - 1), to = Math.min(bars.length - 1, Math.ceil(r.to) + 1);
        var spacing = ts.options().barSpacing;
        target.useMediaCoordinateSpace(function (scope) {
          var ctx = scope.context, h = scope.mediaSize.height;
          for (var i = from; i <= to; i++) {
            var x = ts.logicalToCoordinate(i); if (x === null) continue;
            var ss = sessionsAt(bars[i].time);
            for (var k = 0; k < ss.length; k++) { ctx.fillStyle = COLORS[ss[k]]; ctx.fillRect(x - spacing / 2, 0, spacing + 0.5, h); }   // overlaps blend
          }
        });
      }
    };
    var view = { renderer: function () { return renderer; }, zOrder: function () { return 'bottom'; } };
    return {
      attached: function (p) { api = p; },
      detached: function () { api = { chart: null }; },
      paneViews: function () { return [view]; },
      autoscaleInfo: function () { return null; },                // background bands only, never the price range
      updateAllViews: function () {},
      setVisible: function (v) { visible = !!v; if (api.requestUpdate) api.requestUpdate(); }
    };
  }

  // '#22c55e' + 0.4 -> 'rgba(34,197,94,0.4)' (volume bars); other formats are returned unchanged
  function withAlpha(c, a) {
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '').trim());
    if (!m) return c;
    var h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
    return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
  }
  // value for <input type="color"> (#rrggbb only): rgba(...) and short hex are converted, null -> fallback
  function toHex(c, fallback) {
    var s = String(c || '').trim(), m;
    if ((m = /^#([0-9a-f]{6})/i.exec(s))) return '#' + m[1].toLowerCase();
    if ((m = /^#([0-9a-f]{3})$/i.exec(s))) return '#' + m[1].replace(/./g, '$&$&').toLowerCase();
    if ((m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s))) {
      return '#' + [m[1], m[2], m[3]].map(function (x) { var v = Math.max(0, Math.min(255, +x)).toString(16); return v.length < 2 ? '0' + v : v; }).join('');
    }
    return fallback || '#000000';
  }

  // ---------------------------------------------------------------- appearance drawer (browser)
  // opts: { box (drawer body element), t (i18n), state() -> stored state, pro() -> bool, light() -> bool,
  //         change(newState, how) (the page stores and applies it), upgrade() (opens the upgrade window), newId() }
  function mountDrawer(opts) {
    var box = opts.box, t = opts.t;
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function pro() { return !!opts.pro(); }
    function proTag(parent) { if (!pro()) parent.appendChild(el('span', 'bt-pro', 'PRO')); }
    function section(title, isPro) {
      var s = el('section', 'bt-look-sec'); if (isPro) s.setAttribute('data-pro', '1');
      var h = el('h4', 'bt-look-h'); h.appendChild(el('span', '', title)); if (isPro) proTag(h);
      s.appendChild(h); box.appendChild(s); return s;
    }
    function commit(next, how) { opts.change(normalize(next), how || 'full'); render(); }
    function preview(lk) {
      var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 60 32'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'bt-look-prev');
      var bg = document.createElementNS(ns, 'rect'); bg.setAttribute('width', '60'); bg.setAttribute('height', '32'); bg.setAttribute('rx', '5');
      bg.setAttribute('fill', lk.bg || (opts.light() ? '#ffffff' : '#000000')); svg.appendChild(bg);
      [[10, 1, 14, 24, 8], [24, 0, 10, 22, 6], [38, 1, 8, 20, 4], [50, 1, 6, 16, 3]].forEach(function (c) {
        var up = c[1] === 1, col = up ? lk.up : lk.down;
        var w = document.createElementNS(ns, 'line'); w.setAttribute('x1', c[0]); w.setAttribute('x2', c[0]); w.setAttribute('y1', c[4]); w.setAttribute('y2', c[3] + 4);
        w.setAttribute('stroke', up ? lk.wickUp : lk.wickDown); w.setAttribute('stroke-width', '1'); svg.appendChild(w);
        var b = document.createElementNS(ns, 'rect'); b.setAttribute('x', c[0] - 3); b.setAttribute('y', c[2]); b.setAttribute('width', '6'); b.setAttribute('height', Math.max(3, c[3] - c[2]));
        b.setAttribute('fill', up && lk.hollow ? 'none' : col); b.setAttribute('stroke', up ? lk.borderUp : lk.borderDown); svg.appendChild(b);
      });
      return svg;
    }
    function render() {
      var st = opts.state(), light = opts.light(), cur = resolve(st, light, pro()), P = presets(light);
      box.textContent = '';
      // themes (two free, two premium) and the user's own
      var s1 = section(t('backtest.look.themes', 'Hazır temalar'), false), grid = el('div', 'bt-look-themes');
      PRESET_IDS.forEach(function (id) {
        var free = FREE_PRESETS.indexOf(id) >= 0, b = el('button', 'bt-look-theme'); b.type = 'button';
        b.setAttribute('data-preset', id); b.setAttribute('aria-pressed', cur.id === id ? 'true' : 'false');
        if (!free) b.setAttribute('data-pro', '1');
        var lk = resolve({ preset: id, custom: {}, saved: [] }, light, true);
        b.appendChild(preview(lk));
        var name = el('span', 'bt-look-theme-name', t('backtest.look.preset.' + id, id)); if (!free) proTag(name);
        b.appendChild(name); grid.appendChild(b);
      });
      s1.appendChild(grid);
      // candle style + hollow
      var s2 = section(t('backtest.look.style', 'Mum stili'), true), seg = el('div', 'bt-seg bt-look-styles');
      STYLES.forEach(function (id) {
        var b = el('button', '', t('backtest.look.style_' + id, id)); b.type = 'button'; b.setAttribute('data-style', id);
        b.setAttribute('aria-pressed', cur.style === id ? 'true' : 'false'); seg.appendChild(b);
      });
      s2.appendChild(seg);
      s2.appendChild(toggle('hollow', t('backtest.look.hollow', 'İçi boş mum (yükselen)'), !!cur.hollow, cur.style !== 'candles' && cur.style !== 'heikin'));
      // colors
      var s3 = section(t('backtest.look.colors', 'Renkler'), true), cg = el('div', 'bt-look-colors');
      var fall = { bg: light ? '#ffffff' : '#000000', grid: light ? '#e5e7eb' : '#1f1f1f' };
      COLOR_KEYS.forEach(function (k) {
        var lab = el('label', 'bt-look-color'), inp = el('input'); inp.type = 'color'; inp.setAttribute('data-color', k);
        inp.value = toHex(cur[k], fall[k] || P.wawe.up);
        lab.appendChild(inp); lab.appendChild(el('span', '', t('backtest.look.color_' + k, k))); cg.appendChild(lab);
      });
      s3.appendChild(cg);
      var reset = el('button', 'bt-link-btn', t('backtest.look.reset', 'Temanın renklerine dön')); reset.type = 'button'; reset.setAttribute('data-act', 'reset');
      reset.hidden = !Object.keys(st.custom || {}).length; s3.appendChild(reset);
      // show / hide
      var s4 = section(t('backtest.look.show', 'Göster / gizle'), true);
      SWITCHES.forEach(function (k) { s4.appendChild(toggle(k, t('backtest.look.' + k, k), !!cur[k], false)); });
      s4.appendChild(el('p', 'bt-hint', t('backtest.look.volume_note', 'Aktivite (tahmini): veri kaynakları işlem hacmi vermez; çubuklar 1 dakikalık mum aralıklarının toplamıdır, gerçek hacim değildir.')));
      // my themes
      var s5 = section(t('backtest.look.mine', 'Temalarım'), true), row = el('div', 'bt-look-save');
      var name = el('input', 'bt-input'); name.type = 'text'; name.maxLength = 40; name.id = 'bt-look-name';
      name.placeholder = t('backtest.look.name_ph', 'Tema adı'); name.setAttribute('aria-label', t('backtest.look.name_ph', 'Tema adı'));
      var sv = el('button', 'btn btn-primary', t('backtest.look.save', 'Kaydet')); sv.type = 'button'; sv.setAttribute('data-act', 'save');
      row.appendChild(name); row.appendChild(sv); s5.appendChild(row);
      var list = el('ul', 'bt-look-mine');
      st.saved.forEach(function (x) {
        var li = el('li'), ap = el('button', 'bt-look-mine-name', x.name); ap.type = 'button'; ap.setAttribute('data-saved', x.id);
        ap.setAttribute('aria-pressed', cur.id === 'saved:' + x.id ? 'true' : 'false');
        var del = el('button', 'bt-link-btn bt-look-del', t('common.delete', 'Sil')); del.type = 'button'; del.setAttribute('data-del', x.id);
        li.appendChild(ap); li.appendChild(del); list.appendChild(li);
      });
      if (!st.saved.length) list.appendChild(el('li', 'bt-hint', t('backtest.look.mine_empty', 'Henüz kayıtlı teman yok.')));
      s5.appendChild(list);
      box.appendChild(el('p', 'bt-hint bt-look-foot', t('backtest.look.stored_note', 'Görünüm ayarları bu tarayıcıda saklanır.')));
    }
    function toggle(k, label, on, disabled) {
      var lab = el('label', 'bt-switch'), inp = el('input'); inp.type = 'checkbox'; inp.checked = on; inp.disabled = !!disabled; inp.setAttribute('data-switch', k);
      lab.appendChild(inp); lab.appendChild(el('span', 'bt-switch-ui')); lab.appendChild(el('span', '', label));
      return lab;
    }
    function set(k, v) { var st = opts.state(), next = JSON.parse(JSON.stringify(st)); next.custom[k] = v; return next; }

    function gate(e) {
      if (pro()) return false;
      var p = e.target.closest('[data-pro]'); if (!p || !box.contains(p)) return false;
      e.preventDefault(); e.stopPropagation(); opts.upgrade(); return true;
    }
    function onClick(e) {
      if (gate(e)) return;
      var b = e.target.closest('button'); if (!b || !box.contains(b)) return;
      var st = opts.state(), next = JSON.parse(JSON.stringify(st));
      if (b.hasAttribute('data-preset')) { next.preset = b.getAttribute('data-preset'); next.custom = {}; return commit(next, 'full'); }
      if (b.hasAttribute('data-style')) { next.custom.style = b.getAttribute('data-style'); return commit(next, 'full'); }
      if (b.hasAttribute('data-saved')) { next.preset = 'saved:' + b.getAttribute('data-saved'); next.custom = {}; return commit(next, 'full'); }
      if (b.hasAttribute('data-del')) {
        var id = b.getAttribute('data-del');
        next.saved = next.saved.filter(function (x) { return x.id !== id; });
        if (next.preset === 'saved:' + id) { next.preset = 'wawe'; next.custom = {}; }
        return commit(next, 'full');
      }
      var act = b.getAttribute('data-act');
      if (act === 'reset') { next.custom = {}; return commit(next, 'full'); }
      if (act === 'save') {
        var inp = box.querySelector('#bt-look-name'), nm = (inp.value || '').trim().slice(0, 40);
        if (!nm) { inp.focus(); inp.classList.add('bt-invalid'); return; }
        if (next.saved.length >= MAX_SAVED) next.saved.shift();
        var lk = resolve(st, opts.light(), true), keep = clean(lk), sid = opts.newId();
        next.saved.push({ id: sid, name: nm, look: keep });
        next.preset = 'saved:' + sid; next.custom = {};
        return commit(next, 'full');
      }
    }
    function onInput(e) {
      var k = e.target.getAttribute('data-color');
      if (k) { opts.change(normalize(set(k, e.target.value)), 'colors'); return; }      // live while the picker is open, no re-render
    }
    function onChange(e) {
      var k = e.target.getAttribute('data-color'), sw = e.target.getAttribute('data-switch');
      if (k) return commit(set(k, e.target.value), 'colors');
      if (sw) return commit(set(sw, !!e.target.checked), sw === 'showVolume' || sw === 'hollow' ? 'full' : 'colors');
    }
    box.addEventListener('click', onClick, true);
    box.addEventListener('input', onInput);
    box.addEventListener('change', onChange);
    return { render: render };
  }

  global.WwBtLook = {
    KEY: KEY, STYLES: STYLES, COLOR_KEYS: COLOR_KEYS, SWITCHES: SWITCHES, PRESET_IDS: PRESET_IDS, FREE_PRESETS: FREE_PRESETS, MAX_SAVED: MAX_SAVED,
    SESSIONS: SESSIONS, presets: presets, isColor: isColor, clean: clean, normalize: normalize, load: load, save: save,
    resolve: resolve, needsPro: needsPro, heikinAshi: heikinAshi, sessionsAt: sessionsAt,
    seriesOptions: seriesOptions, addSeries: addSeries, chartOptions: chartOptions, toSeriesData: toSeriesData,
    createSessionPrimitive: createSessionPrimitive, withAlpha: withAlpha, toHex: toHex, mountDrawer: mountDrawer
  };
})(typeof window !== 'undefined' ? window : globalThis);
