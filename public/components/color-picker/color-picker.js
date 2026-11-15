// ============================================================
// WAWE RENK SEÇİCİ — public/components/color-picker/color-picker.js
// ============================================================
// Tarayıcının kendi renk penceresi (input[type=color]) CSS ile biçimlendirilemiyor; Tema stüdyosundaki
// renk kutuları ve Stratejiler modalındaki renk alanı bunun yerine bu paneli açar (görünüm: color-picker.css).
// Kullanan sayfa hem bu dosyayı hem color-picker.css'i yükler.
//
// Kapsam: input[type=color].color-input-picker ve input[type=color][data-ww-color].
// Panel, renk değerini yine aynı <input type=color>'a yazar ve 'input' olayı yayar (kapanırken 'change');
// tema kodu (settings.js / bundle theme.js) bu input'ları dinlediği için başka bir değişiklik gerekmez.
// Yanındaki .color-input-text alanı da güncellenir; o alana elle yazılan geçerli HEX de renk kutusuna aktarılır.
// Hazır renkler: input'un data-swatches="#000000,#111111,..." özniteliği.
// Belgeye tek sefer bağlanır (SPA'da sayfa script'i değil), olay yetkilendirmesiyle çalışır.
// ============================================================
(function () {
  'use strict';
  if (window.WWColorPicker) return;

  var SEL = 'input[type="color"].color-input-picker, input[type="color"][data-ww-color]';
  var HEX6 = /^#?([0-9a-f]{6})$/i;
  var HEX3 = /^#?([0-9a-f]{3})$/i;

  function tr(key, fb) {
    try {
      if (window.i18n && typeof window.i18n.t === 'function') {
        var v = window.i18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fb;
  }

  // ---------- renk dönüşümleri ----------
  function normHex(s) {
    s = String(s || '').trim();
    var m = s.match(HEX6);
    if (m) return '#' + m[1].toLowerCase();
    m = s.match(HEX3);
    if (m) return '#' + m[1].split('').map(function (c) { return c + c; }).join('').toLowerCase();
    return null;
  }
  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) {
      var s = Math.round(Math.max(0, Math.min(255, v))).toString(16);
      return s.length < 2 ? '0' + s : s;
    }).join('');
  }
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: h, s: max ? d / max : 0, v: max };
  }
  function hsvToRgb(h, s, v) {
    var c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

  var PIPETTE = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>';

  // ---------- durum ----------
  var panel = null, els = {}, input = null, anchor = null;
  var hsv = { h: 0, s: 0, v: 0 }, hex = '#000000', startHex = null;
  var raf = 0, pendingEmit = false;

  function build() {
    panel = document.createElement('div');
    panel.className = 'ww-cp';
    panel.setAttribute('role', 'dialog');
    panel.hidden = true;
    panel.innerHTML =
      '<div class="ww-cp-sv" tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="100">' +
        '<span class="ww-cp-sv-thumb"></span>' +
      '</div>' +
      '<div class="ww-cp-hue" tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="360">' +
        '<span class="ww-cp-hue-thumb"></span>' +
      '</div>' +
      '<div class="ww-cp-row">' +
        '<span class="ww-cp-preview" aria-hidden="true"></span>' +
        '<input type="text" class="ww-cp-hex" maxlength="7" spellcheck="false" autocomplete="off">' +
        '<button type="button" class="ww-cp-eye">' + PIPETTE + '</button>' +
      '</div>' +
      '<div class="ww-cp-swatches" role="group"></div>';
    document.body.appendChild(panel);
    els.sv = panel.querySelector('.ww-cp-sv');
    els.svThumb = panel.querySelector('.ww-cp-sv-thumb');
    els.hue = panel.querySelector('.ww-cp-hue');
    els.hueThumb = panel.querySelector('.ww-cp-hue-thumb');
    els.preview = panel.querySelector('.ww-cp-preview');
    els.hex = panel.querySelector('.ww-cp-hex');
    els.eye = panel.querySelector('.ww-cp-eye');
    els.swatches = panel.querySelector('.ww-cp-swatches');
    if (!('EyeDropper' in window)) els.eye.hidden = true;

    drag(els.sv, function (x, y) { hsv.s = x; hsv.v = 1 - y; fromHsv(); });
    drag(els.hue, function (x) { hsv.h = Math.min(359.9, x * 360); fromHsv(); });

    els.sv.addEventListener('keydown', function (e) {
      var st = e.shiftKey ? 0.1 : 0.02;
      if (e.key === 'ArrowLeft') hsv.s = clamp01(hsv.s - st);
      else if (e.key === 'ArrowRight') hsv.s = clamp01(hsv.s + st);
      else if (e.key === 'ArrowUp') hsv.v = clamp01(hsv.v + st);
      else if (e.key === 'ArrowDown') hsv.v = clamp01(hsv.v - st);
      else return;
      e.preventDefault(); fromHsv();
    });
    els.hue.addEventListener('keydown', function (e) {
      var st = e.shiftKey ? 15 : 2;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') hsv.h = Math.max(0, hsv.h - st);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') hsv.h = Math.min(359.9, hsv.h + st);
      else return;
      e.preventDefault(); fromHsv();
    });

    els.hex.addEventListener('input', function () {
      // yalnızca 6 haneli kod: "#abc" yazılırken erkenden #aabbcc'ye atlamasın
      if (HEX6.test(els.hex.value.trim())) setHex(els.hex.value, true, true);
    });
    els.hex.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); close(true); }
    });
    els.hex.addEventListener('blur', function () { els.hex.value = hex.toUpperCase(); });

    els.eye.addEventListener('click', function () {
      try {
        new window.EyeDropper().open().then(function (r) {
          var h = r && normHex(r.sRGBHex);
          if (h && panel && !panel.hidden) setHex(h, true);
        }).catch(function () {});
      } catch (e) {}
    });

    els.swatches.addEventListener('click', function (e) {
      var b = e.target.closest('.ww-cp-swatch');
      if (b) setHex(b.getAttribute('data-hex'), true);
    });
  }

  // Sürükleme: işaretçi yakalama ile alan dışına taşsa da sürer; x/y 0..1
  function drag(el, onMove) {
    function at(e) {
      var r = el.getBoundingClientRect();
      onMove(clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height));
    }
    el.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      el.focus({ preventScroll: true });
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      at(e);
      function move(ev) { at(ev); }
      function up() {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
      }
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  }

  function fromHsv() {
    var rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
    hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
    render(false);
    emit();
  }

  // keepHue: gri tonlarda (s=0) ya da siyahta tonu kaybetmemek için mevcut tonu koru
  function setHex(h, doEmit, fromTyping) {
    h = normHex(h);
    if (!h) return;
    var next = rgbToHsv.apply(null, hexToRgb(h));
    if (next.s === 0 || next.v === 0) next.h = hsv.h;
    if (next.v === 0) next.s = hsv.s;
    hsv = next;
    hex = h;
    render(!!fromTyping);
    if (doEmit) emit();
  }

  function render(skipHexField) {
    var hueRgb = hsvToRgb(hsv.h, 1, 1);
    var hueHex = rgbToHex(hueRgb[0], hueRgb[1], hueRgb[2]);
    els.sv.style.backgroundColor = hueHex;
    els.svThumb.style.left = (hsv.s * 100) + '%';
    els.svThumb.style.top = ((1 - hsv.v) * 100) + '%';
    els.svThumb.style.backgroundColor = hex;
    els.hueThumb.style.left = (hsv.h / 360 * 100) + '%';
    els.hueThumb.style.backgroundColor = hueHex;
    els.preview.style.backgroundColor = hex;
    if (!skipHexField) els.hex.value = hex.toUpperCase();
    els.sv.setAttribute('aria-valuenow', String(Math.round(hsv.s * 100)));
    els.sv.setAttribute('aria-valuetext', hex.toUpperCase());
    els.hue.setAttribute('aria-valuenow', String(Math.round(hsv.h)));
    var cur = hex;
    Array.prototype.forEach.call(els.swatches.children, function (b) {
      b.classList.toggle('active', b.getAttribute('data-hex') === cur);
    });
  }

  // Değeri kaynak input'a yaz; sürüklerken kare başına bir kez 'input' olayı
  function emit() {
    pendingEmit = true;
    if (raf) return;
    raf = requestAnimationFrame(flush);
  }
  function flush() {
    raf = 0;
    if (!pendingEmit || !input) return;
    pendingEmit = false;
    writeTo(input, hex, 'input');
  }
  function writeTo(inp, h, type) {
    if (inp.value.toLowerCase() !== h) inp.value = h;
    var group = inp.closest('.color-input-group');
    var txt = group && group.querySelector('.color-input-text');
    if (txt && document.activeElement !== txt) txt.value = h;
    var chip = inp.closest('.color-chip');
    if (chip) chip.style.background = h;
    inp.dispatchEvent(new Event(type, { bubbles: true }));
  }

  function swatchesFor(inp) {
    var raw = inp.getAttribute('data-swatches');
    if (!raw) return [];
    return raw.split(',').map(normHex).filter(Boolean);
  }

  function labelFor(inp) {
    var field = inp.closest('.color-field, .modal-field');
    var lab = field && field.querySelector('label');
    return lab ? lab.textContent.trim() : tr('settings.cp_title', 'Renk seç');
  }

  function open(inp) {
    if (!panel) build();
    if (input === inp && !panel.hidden) { close(true); return; }
    if (input) close(true);
    input = inp;
    anchor = inp.closest('.color-chip') || inp;
    startHex = normHex(inp.value) || '#000000';

    panel.setAttribute('aria-label', labelFor(inp));
    els.sv.setAttribute('aria-label', tr('settings.cp_sv', 'Doygunluk ve parlaklık'));
    els.hue.setAttribute('aria-label', tr('settings.cp_hue', 'Ton'));
    els.hex.setAttribute('aria-label', tr('settings.cp_hex', 'HEX renk kodu'));
    els.eye.setAttribute('aria-label', tr('settings.cp_eyedropper', 'Ekrandan renk al'));
    els.eye.title = els.eye.getAttribute('aria-label');
    els.swatches.setAttribute('aria-label', tr('settings.cp_swatches', 'Hazır renkler'));

    var list = swatchesFor(inp);
    els.swatches.innerHTML = list.map(function (h) {
      return '<button type="button" class="ww-cp-swatch" data-hex="' + h + '" style="background:' + h + '" title="' + h.toUpperCase() + '" aria-label="' + h.toUpperCase() + '"></button>';
    }).join('');
    els.swatches.hidden = !list.length;

    hsv = { h: 0, s: 0, v: 0 };
    setHex(startHex, false);
    panel.hidden = false;
    panel.classList.remove('ww-cp-in');
    void panel.offsetWidth;
    panel.classList.add('ww-cp-in');
    anchor.classList.add('ww-cp-open');
    inp.setAttribute('aria-expanded', 'true');
    place();
    els.sv.focus({ preventScroll: true });

    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('keydown', onKey, true); // pencere yakalaması: Esc modalı değil yalnızca paneli kapatsın
    document.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
  }

  function close(commit) {
    if (!panel || panel.hidden) return;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    var inp = input;
    if (inp && pendingEmit) { pendingEmit = false; writeTo(inp, hex, 'input'); }
    if (inp && commit === false && startHex && normHex(inp.value) !== startHex) {
      writeTo(inp, startHex, 'input'); // Esc: açılıştaki renge dön
    }
    panel.hidden = true;
    if (anchor) anchor.classList.remove('ww-cp-open');
    if (inp) {
      inp.setAttribute('aria-expanded', 'false');
      if (normHex(inp.value) !== startHex) inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
    input = null; anchor = null;
    document.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('keydown', onKey, true);
    document.removeEventListener('scroll', place, true);
    window.removeEventListener('resize', place);
    return inp;
  }

  function onOutside(e) {
    if (panel.contains(e.target)) return;
    if (anchor && anchor.contains(e.target)) return; // aynı kutuya tıklama: click işleyicisi kapatır
    close(true);
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      var inp = close(false);
      if (inp && document.contains(inp)) inp.focus({ preventScroll: true });
    } else if (e.key === 'Tab' && panel.contains(document.activeElement)) {
      // odak panel içinde döner
      var f = Array.prototype.filter.call(panel.querySelectorAll('[tabindex="0"], input, button'), function (el) { return !el.hidden && el.offsetParent !== null; });
      if (!f.length) return;
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  }

  function place() {
    if (!panel || panel.hidden || !anchor) return;
    if (!document.contains(anchor)) { close(true); return; }
    var r = anchor.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight, gap = 8, pad = 8;
    if (r.bottom < 0 || r.top > vh) { close(true); return; }
    var w = panel.offsetWidth, h = panel.offsetHeight;
    var top = r.bottom + gap;
    if (top + h > vh - pad && r.top - gap - h >= pad) top = r.top - gap - h;
    top = Math.max(pad, Math.min(top, vh - h - pad));
    var left = Math.max(pad, Math.min(r.left, vw - w - pad));
    panel.style.top = Math.round(top) + 'px';
    panel.style.left = Math.round(left) + 'px';
  }

  // Yerel pencereyi engelle, bizimkini aç (fare, dokunma ve klavyeyle Enter/Boşluk → click)
  document.addEventListener('click', function (e) {
    var inp = e.target && e.target.closest ? e.target.closest(SEL) : null;
    if (!inp || inp.disabled) return;
    e.preventDefault();
    open(inp);
  }, true);

  // Metin alanına yazılan geçerli HEX → renk kutusu (tema kodu zaten yaptıysa tekrar etmez)
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains('color-input-text')) return;
    var group = t.closest('.color-input-group');
    var inp = group && group.querySelector(SEL);
    if (!inp || !HEX6.test(t.value.trim())) return;
    var h = normHex(t.value);
    if (inp.value.toLowerCase() !== h) {
      inp.value = h;
      var chip = inp.closest('.color-chip');
      if (chip) chip.style.background = h;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (input === inp && panel && !panel.hidden) setHex(h, false);
  });

  window.WWColorPicker = { open: open, close: close, _hex: { norm: normHex, toHsv: function (h) { return rgbToHsv.apply(null, hexToRgb(h)); }, fromHsv: function (a, b, c) { var x = hsvToRgb(a, b, c); return rgbToHex(x[0], x[1], x[2]); } } };
})();
