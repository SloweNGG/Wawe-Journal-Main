// ============================================================
// TEMA STÜDYOSU — public/settings/js/theme-studio.js (Ayarlar > Görünüm)
// ============================================================
// Tema motorunun (window.WWTheme, src/scripts/theme-engine.js) arayüzü:
//  - Etkin arayüz modunun (koyu / açık) paletini düzenler; iki modun paleti ayrı saklanır.
//  - Hazır temalar (küçük sayfa önizlemeli kartlar), 5 özel renk (arka plan, kart, kenarlık, metin, vurgu),
//    okunabilirlik (kontrast) uyarıları, yazı boyutu, tema kodu (kopyala / yapıştır).
//  - Seçilen / değiştirilen her şey anında uygulanır ve otomatik kaydedilir (kaydet butonu yok: seçili görünen tema
//    gerçekten kayıtlı olmalı). Yerel kayıt kısa gecikmeyle (renk sürüklerken her karede yazılmasın), hesaba
//    (user_profiles.theme) gönderim daha uzun gecikmeyle; panelden / sayfadan çıkarken bekleyen kayıt hemen yapılır (flush).
// Pro özelliği: Pro olmayan kullanıcı kilitli tanıtımı (#tpl-theme-locked) görür.
// Tek sefer yüklenir (SPA'da sayfa script'i değil); settings.js initAppearance → WWThemeStudio.mount().
// ============================================================
(function () {
  'use strict';
  if (window.WWThemeStudio) return;

  var T = function () { return window.WWTheme; };
  var root = null, mode = 'dark', draft = null, saved = null, savedFont = 16, font = 16;
  var commitTimer = 0, pushTimer = 0, COMMIT_DELAY = 350, PUSH_DELAY = 1500;
  var CONTRAST_TEXT = 4.5, CONTRAST_ON_ACCENT = 3, CONTRAST_ACCENT = 3, CONTRAST_BORDER = 1.12;

  function tr(key, fb, params) {
    var v = key;
    try { if (window.i18n && typeof window.i18n.t === 'function') v = window.i18n.t(key, params); } catch (e) {}
    if (!v || v === key) {
      v = fb;
      if (params) for (var k in params) v = v.replace('{' + k + '}', params[k]);
    }
    return v;
  }
  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'success');
  }
  function $(sel) { return root ? root.querySelector(sel) : null; }
  function $$(sel) { return root ? Array.prototype.slice.call(root.querySelectorAll(sel)) : []; }
  function copy(p) { var o = {}; for (var k in p) o[k] = p[k]; return o; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function cardColor(p) {
    var def = T().PRESETS.dark[0];
    return mode === 'dark' && p.surface === def.surface ? '#000000' : p.surface;
  }
  function currentFont() { return T().fontSize() || 16; }

  // ---------- kilit (Pro) ----------
  function isPro() {
    if (window.location.search.indexOf('test=1') >= 0) return Promise.resolve(true);
    if (typeof window.getUserPlanSilent !== 'function') return Promise.resolve(false);
    return window.getUserPlanSilent().then(function (r) { return !!r && r.plan === 'premium'; }, function () { return false; });
  }

  // ---------- kurulum ----------
  function mount(container) {
    if (!container) return;
    flush();
    root = null;
    isPro().then(function (pro) {
      if (!document.contains(container)) return;
      var tpl = document.getElementById(pro ? 'tpl-theme-form' : 'tpl-theme-locked');
      if (!tpl) return;
      container.innerHTML = '';
      container.appendChild(tpl.content.cloneNode(true));
      if (window.i18n && typeof window.i18n.apply === 'function') { try { window.i18n.apply(); } catch (e) {} }
      if (!pro || !T()) return;
      root = container.querySelector('.ts');
      init();
    });
  }

  function init() {
    mode = T().mode();
    var st = T().read();
    saved = st[mode] ? copy(st[mode]) : copy(T().PRESETS[mode][0]);
    saved.preset = T().matchPreset(saved, mode);
    draft = copy(saved);
    savedFont = font = st.fontSize || currentFont();

    var label = $('[data-ts-mode-label]');
    if (label) label.textContent = mode === 'light' ? tr('settings.studio_mode_light', 'Açık tema paleti.') : tr('settings.studio_mode_dark', 'Koyu tema paleti.');

    renderPresets();
    // renk alanlarının hazır renkleri: bu modun hazır temalarından
    T().FIELDS.forEach(function (f) {
      if (f === 'accent') return;
      var inp = $('[data-ts-field="' + f + '"]');
      if (!inp) return;
      var seen = {}, list = [];
      T().PRESETS[mode].forEach(function (p) { if (!seen[p[f]]) { seen[p[f]] = 1; list.push(p[f]); } });
      inp.setAttribute('data-swatches', list.slice(0, 8).join(','));
    });
    bind();
    refresh(false);
  }

  function presetThumb(p) {
    var card = mode === 'dark' && p.surface === T().PRESETS.dark[0].surface ? '#000000' : p.surface;
    var style = '--p-bg:' + p.bg + ';--p-card:' + card + ';--p-border:' + p.border + ';--p-text:' + p.text + ';--p-accent:' + p.accent;
    return '<span class="ts-thumb" style="' + style + '" aria-hidden="true">' +
      '<span class="ts-thumb-nav"><i></i><i></i><i></i></span>' +
      '<span class="ts-thumb-card">' +
        '<span class="ts-thumb-line"></span><span class="ts-thumb-line short"></span>' +
        '<svg class="ts-thumb-chart" viewBox="0 0 60 18" preserveAspectRatio="none"><polyline points="0,15 10,12 20,13 30,7 40,9 50,4 60,2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>' +
        '<span class="ts-thumb-btn"></span>' +
      '</span>' +
      '<span class="ts-thumb-check"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2"><polyline points="20 6 9 17 4 12"/></svg></span>' +
    '</span>';
  }

  function renderPresets() {
    var grid = $('[data-ts-presets]');
    if (!grid) return;
    var defTag = tr('settings.studio_default_tag', '(varsayılan)');
    grid.innerHTML = T().PRESETS[mode].map(function (p, i) {
      return '<button type="button" class="ts-preset" role="radio" aria-checked="false" data-preset="' + p.id + '">' +
        presetThumb(p) +
        '<span class="ts-preset-name">' + esc(p.name) + (i === 0 ? ' <span class="ts-preset-default">' + esc(defTag) + '</span>' : '') + '</span>' +
      '</button>';
    }).join('');
  }

  function bind() {
    var grid = $('[data-ts-presets]');
    grid.addEventListener('click', function (e) {
      var b = e.target.closest('.ts-preset');
      if (!b) return;
      var p = T().presetById(mode, b.getAttribute('data-preset'));
      if (!p) return;
      draft = copy(p); draft.preset = p.id;
      refresh(true);
    });
    // ok tuşlarıyla tema kartları arasında gezinme (radio grubu)
    grid.addEventListener('keydown', function (e) {
      var keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!keys[e.key]) return;
      var btns = $$('.ts-preset'), i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      var n = btns[(i + keys[e.key] + btns.length) % btns.length];
      n.focus(); n.click();
    });

    $$('[data-ts-field]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var f = inp.getAttribute('data-ts-field'), h = T().norm(inp.value);
        if (!h || draft[f] === h) return;
        draft[f] = h; draft.preset = T().matchPreset(draft, mode);
        refresh(true, f);
      });
    });
    // HEX metin alanı: color-picker.js geçerli 6 haneli kodu renk kutusuna aktarıp 'input' yayar; burada yalnızca
    // odaktan çıkınca geçersiz yazıyı geri alırız
    $$('[data-ts-text]').forEach(function (t) {
      t.addEventListener('blur', function () { t.value = draft[t.getAttribute('data-ts-text')].toUpperCase(); });
      t.addEventListener('keydown', function (e) { if (e.key === 'Enter') t.blur(); });
    });

    var slider = $('#custom-font-size');
    if (slider) slider.addEventListener('input', function () { font = parseInt(slider.value, 10) || 16; refresh(true); });
    $$('.font-pill').forEach(function (b) {
      b.addEventListener('click', function () { font = parseInt(b.getAttribute('data-size'), 10) || 16; refresh(true); });
    });

    $('#reset-custom-theme-btn').addEventListener('click', reset);

    $('[data-ts-copy]').addEventListener('click', copyCode);
    $('[data-ts-paste-toggle]').addEventListener('click', function () {
      var row = $('[data-ts-paste-row]'), btn = this;
      row.hidden = !row.hidden;
      btn.setAttribute('aria-expanded', String(!row.hidden));
      if (!row.hidden) $('[data-ts-paste-input]').focus();
    });
    $('[data-ts-paste-apply]').addEventListener('click', pasteCode);
    $('[data-ts-paste-input]').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); pasteCode(); } });
    $('[data-ts-paste-input]').addEventListener('input', function () { pasteError(''); });
  }

  // ---------- durum → arayüz ----------
  function refresh(live, skipTextFor) {
    if (!root) return;
    $$('.ts-preset').forEach(function (b) {
      var on = b.getAttribute('data-preset') === draft.preset;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on || (!draft.preset && b === $('.ts-preset')) ? 0 : -1;
    });
    var badge = $('[data-ts-custom]');
    if (badge) badge.hidden = !!draft.preset;

    T().FIELDS.forEach(function (f) {
      var inp = $('[data-ts-field="' + f + '"]'), txt = $('[data-ts-text="' + f + '"]'), chip = $('[data-ts-chip="' + f + '"]');
      if (inp && inp.value.toLowerCase() !== draft[f]) inp.value = draft[f];
      if (chip) chip.style.background = draft[f];
      if (txt && f !== skipTextFor && document.activeElement !== txt) txt.value = draft[f].toUpperCase();
    });

    var slider = $('#custom-font-size'), disp = $('#font-size-display');
    if (slider) slider.value = font;
    if (disp) disp.textContent = font + 'px';
    $$('.font-pill').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-size') === String(font)); });

    var code = $('[data-ts-code]');
    if (code) code.textContent = T().encode(draft, mode);

    renderContrast();

    if (live) {
      T().preview(draft, mode);
      T().applyFont(font);
      scheduleCommit();
    }
  }

  function renderContrast() {
    var ul = $('[data-ts-contrast]');
    if (!ul) return;
    var card = cardColor(draft), C = T().contrast, out = [];
    var rText = C(draft.text, card), rOn = C(T().onAccent(draft.accent) || '#ffffff', draft.accent), rAcc = C(draft.accent, card), rBorder = C(draft.border, card);
    var f = function (r) { return (Math.round(r * 10) / 10).toFixed(1); };
    if (rText < CONTRAST_TEXT) out.push(tr('settings.studio_contrast_text', 'Metin ile kart rengi arasındaki kontrast düşük ({ratio}:1); yazılar zor okunur.', { ratio: f(rText) }));
    if (rOn < CONTRAST_ON_ACCENT) out.push(tr('settings.studio_contrast_on_accent', 'Vurgu rengi orta tonda; butonlardaki yazı ne beyazla ne koyuyla iyi okunur ({ratio}:1).', { ratio: f(rOn) }));
    if (rAcc < CONTRAST_ACCENT) out.push(tr('settings.studio_contrast_accent', 'Vurgu rengi kart rengine çok yakın ({ratio}:1); seçili öğeler ve bağlantılar seçilmez.', { ratio: f(rAcc) }));
    if (rBorder < CONTRAST_BORDER) out.push(tr('settings.studio_contrast_border', 'Kenarlık kart rengiyle neredeyse aynı; kutuların sınırı görünmez.'));
    var warnIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    var okIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
    ul.innerHTML = out.length
      ? out.map(function (m) { return '<li class="warn">' + warnIcon + '<span>' + esc(m) + '</span></li>'; }).join('')
      : '<li class="ok">' + okIcon + '<span>' + esc(tr('settings.studio_contrast_ok', 'Okunabilirlik iyi · metin kontrastı {ratio}:1', { ratio: f(rText) })) + '</span></li>';
  }

  // ---------- otomatik kayıt ----------
  function status(state) {
    var el = $('[data-ts-status]');
    if (!el) return;
    el.setAttribute('data-state', state);
    var txt = el.querySelector('[data-ts-status-text]');
    if (txt) txt.textContent = state === 'saving'
      ? tr('settings.studio_saving', 'Kaydediliyor…')
      : tr('settings.studio_saved', 'Kaydedildi');
  }
  function scheduleCommit() {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(commit, COMMIT_DELAY);
    status('saving');
  }
  function commit() {
    clearTimeout(commitTimer); commitTimer = 0;
    if (!draft) return;
    var st = T().read();
    var p = copy(draft); p.preset = T().matchPreset(p, mode);
    delete p.id; delete p.name;
    st[mode] = T().isDefault(p, mode) ? null : p;
    st.fontSize = T().setFont(font);
    T().save(st, { local: true });
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, PUSH_DELAY);
    status('saved');
  }
  function pushNow() {
    clearTimeout(pushTimer); pushTimer = 0;
    T().push(T().serialize(T().read()));
  }
  // Bekleyen kaydı hemen yap (panel değişimi, sayfadan çıkış, mod değişimi)
  function flush() {
    if (commitTimer) commit();
    if (pushTimer) pushNow();
  }

  // ---------- eylemler ----------
  function reset() {
    clearTimeout(commitTimer); commitTimer = 0; clearTimeout(pushTimer); pushTimer = 0;
    var st = T().read();
    st[mode] = null; st.fontSize = T().setFont(null);
    T().save(st);
    saved = copy(T().PRESETS[mode][0]); saved.preset = saved.id; delete saved.id; delete saved.name;
    draft = copy(saved); savedFont = font = 16;
    refresh(false);
    status('saved');
    toast(tr('settings.theme_reset_done', 'Tema varsayılana döndürüldü'));
  }

  function copyCode() {
    var code = T().encode(draft, mode);
    var done = function () { toast(tr('settings.studio_share_copied', 'Tema kodu kopyalandı')); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done, function () { selectCode(); });
    } else selectCode();
  }
  function selectCode() {
    var el = $('[data-ts-code]');
    if (!el || !window.getSelection) return;
    var r = document.createRange(); r.selectNodeContents(el);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }

  function pasteCode() {
    var inp = $('[data-ts-paste-input]');
    var res = T().decode(inp ? inp.value : '');
    // hatalar alanın altında: bildirim (toast) Uygula butonunun üstüne geliyordu
    if (!res) { pasteError(tr('settings.studio_share_invalid', 'Geçersiz tema kodu')); return; }
    if (res.mode !== mode) {
      pasteError(res.mode === 'light'
        ? tr('settings.studio_share_wrong_mode_light', 'Bu kod açık tema için. Yapıştırmak için önce açık temaya geç.')
        : tr('settings.studio_share_wrong_mode_dark', 'Bu kod koyu tema için. Yapıştırmak için önce koyu temaya geç.'));
      return;
    }
    pasteError('');
    draft = copy(res.palette);
    refresh(true);
    if (inp) inp.value = '';
    var row = $('[data-ts-paste-row]'); if (row) row.hidden = true;
    var tg = $('[data-ts-paste-toggle]'); if (tg) tg.setAttribute('aria-expanded', 'false');
    toast(tr('settings.studio_share_applied', 'Tema kodu uygulandı.'));
  }

  function pasteError(msg) {
    var el = $('[data-ts-paste-msg]'), inp = $('[data-ts-paste-input]');
    if (el) { el.textContent = msg; el.hidden = !msg; }
    if (inp) { inp.setAttribute('aria-invalid', msg ? 'true' : 'false'); if (msg) inp.focus(); }
  }

  // sayfa yenilenir / kapanırsa bekleyen kayıt kaybolmasın
  window.addEventListener('pagehide', flush);

  // discard: eski ad (settings.js çağırıyor); artık geri almıyor, bekleyen kaydı tamamlıyor
  window.WWThemeStudio = { mount: mount, flush: flush, discard: flush };
})();
