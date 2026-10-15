/**
 * WwJournalMark — bir hesabın (defterin) küçük "işareti": hesabın renginde bir NOKTA.
 *
 * Hesap bir prop firmaya veya brokera (cTrader) BAĞLIYSA nokta yanıp söner (canlı/bağlı göstergesi);
 * bağlı değilse sabit durur. Logo gösterilmez (prop/broker adı ve logosu ayrı rozetlerde zaten var).
 *
 * Kullanım:
 *   WwJournalMark.html({ color, prop: <getPropFirmInfo sonucu|null>, broker: true, dotSize: 10 })
 *   WwJournalMark.forJournal(journal, { propMap, ctraderMap, dotSize })   // bağlantıları önbellekten çözer
 *
 * Stil bu dosyanın içindedir (tek yerde dursun; navbar/hesaplar sayfası/geçiş animasyonu ortak kullansın).
 */
(function (global) {
  'use strict';

  var DEFAULT_COLOR = '#7c6dfa';
  var CUSTOM_PROP_NAME = 'Prop';

  var CSS =
    '.ww-mark{position:relative;display:inline-flex;align-items:center;justify-content:center;' +
      'width:var(--mk-size,10px);height:var(--mk-size,10px);flex-shrink:0;vertical-align:middle;line-height:0}' +
    '.ww-mark-host{display:inline-flex;align-items:center;justify-content:center;line-height:0}' +
    '.ww-mark-dot{width:100%;height:100%;border-radius:50%;background:var(--mk,#7c6dfa);' +
      'box-shadow:0 0 0 3px var(--mk-ring,rgba(124,109,250,.25)),0 0 10px var(--mk-ring,rgba(124,109,250,.25))}' +
    // Bağlı hesap: yanıp sönen nokta (opaklık düşer, halka büyüyüp söner)
    '.ww-mark--live .ww-mark-dot{animation:ww-mark-blink 1.7s ease-in-out infinite}' +
    '@keyframes ww-mark-blink{' +
      '0%,100%{opacity:1;box-shadow:0 0 0 3px var(--mk-ring,rgba(124,109,250,.25)),0 0 10px var(--mk-ring,rgba(124,109,250,.25))}' +
      '50%{opacity:.3;box-shadow:0 0 0 6px transparent,0 0 2px transparent}}' +
    '@media (prefers-reduced-motion:reduce){.ww-mark--live .ww-mark-dot{animation:none}}';

  var styleInjected = false;
  function injectStyle() {
    if (styleInjected || typeof document === 'undefined') return;
    styleInjected = true;
    var st = document.createElement('style');
    st.id = 'ww-journal-mark-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function safeColor(c) {
    return (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c)) ? c : DEFAULT_COLOR;
  }

  // Hex rengin yarı saydam halkası (#rgb -> #rrggbb, sonuna alfa)
  function ringOf(color) {
    var h = color.slice(1);
    if (h.length === 3) h = h.split('').map(function (x) { return x + x; }).join('');
    return '#' + h.slice(0, 6) + '40';
  }

  function html(o) {
    injectStyle();
    o = o || {};
    var size = o.dotSize || 10;
    var color = safeColor(o.color);
    var live = !!(o.prop || o.broker);

    // Üzerine gelince neden yandığını söyleyen ipucu
    var parts = [];
    if (o.prop) parts.push((o.prop && o.prop.name) || CUSTOM_PROP_NAME);
    if (o.broker) parts.push('cTrader');
    var title = parts.length ? ' title="' + esc(parts.join(' · ')) + '"' : '';

    return '<span class="ww-mark ww-mark--dot' + (live ? ' ww-mark--live' : '') + '"' + title +
      ' style="--mk-size:' + size + 'px;--mk:' + color + ';--mk-ring:' + ringOf(color) + '">' +
      '<span class="ww-mark-dot"></span></span>';
  }

  function readMap(key) {
    try {
      var m = JSON.parse(localStorage.getItem(key) || 'null');
      return (m && typeof m === 'object') ? m : {};
    } catch (e) { return {}; }
  }

  // prop_accounts satırından firma bilgisi (navbar'daki çözümleyiciyle aynı mantık)
  function propInfoOf(propAcc) {
    if (!propAcc) return null;
    var resolver = global.getPropFirmInfo || (global.PropTemplates && global.PropTemplates.getPropFirmInfo);
    var firm = (propAcc.rules && propAcc.rules.firm) || null;
    if (!firm && global.PropTemplates && typeof global.PropTemplates.getPropTemplate === 'function') {
      var tmpl = global.PropTemplates.getPropTemplate(propAcc.template_key);
      firm = tmpl && tmpl.firm;
    }
    var info = typeof resolver === 'function' ? resolver(firm || propAcc.template_key) : null;
    // Çözülemeyen (özel) prop hesabı da "bağlı" sayılır
    return info || { name: firm || CUSTOM_PROP_NAME };
  }

  function forJournal(j, o) {
    o = o || {};
    if (!j) return html(o);
    var propMap = o.propMap || readMap('ww_cached_props_map');
    var ctraderMap = o.ctraderMap || readMap('ww_cached_ctrader_map');
    return html({
      color: j.color,
      prop: propInfoOf(propMap[j.id]),
      broker: !!ctraderMap[j.id],
      dotSize: o.dotSize
    });
  }

  injectStyle();

  global.WwJournalMark = { html: html, forJournal: forJournal, propInfoOf: propInfoOf, safeColor: safeColor };
})(typeof window !== 'undefined' ? window : globalThis);
