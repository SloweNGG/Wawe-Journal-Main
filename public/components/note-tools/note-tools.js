// ============================================================
// WAWE JOURNAL - NOTE TOOLS (trade notes: emotion tags + dictation)
// File: public/components/note-tools/note-tools.js  ->  window.WwNoteTools
// Adds a small bar under the trade note fields (add-trade #notes, quick add #price-notes, any textarea[data-ww-note]):
//   - emotion chips: one tap adds / removes a tag like "#fomo" in the note (the tag word is in the member's language);
//     the AI coach reads them (supabase/functions/_shared/emotions.ts) and shows what each emotion costs
//   - a microphone: the browser's speech recognition writes into the note (hidden where the browser has none)
// The forms keep working without it: it only edits the textarea's text and fires its input event.
// ============================================================
(function (global) {
  'use strict';
  if (global.WwNoteTools) return;

  var TARGETS = 'textarea#notes, textarea#price-notes, textarea[data-ww-note]';
  var EMOTIONS = ['calm', 'confident', 'fear', 'greed', 'fomo', 'revenge', 'impatient', 'tired'];
  var POSITIVE = { calm: 1, confident: 1 };
  // tag word per language (the coach recognises all of them) and the Turkish fallbacks of the labels
  var TAGS = {
    tr: { calm: 'sakin', confident: 'emin', fear: 'korku', greed: 'açgözlülük', fomo: 'fomo', revenge: 'intikam', impatient: 'sabırsız', tired: 'yorgun' },
    en: { calm: 'calm', confident: 'confident', fear: 'fear', greed: 'greed', fomo: 'fomo', revenge: 'revenge', impatient: 'impatient', tired: 'tired' },
    de: { calm: 'ruhig', confident: 'sicher', fear: 'angst', greed: 'gier', fomo: 'fomo', revenge: 'rache', impatient: 'ungeduldig', tired: 'müde' }
  };
  var LABEL_TR = { calm: 'Sakin', confident: 'Emin', fear: 'Korku', greed: 'Açgözlülük', fomo: 'FOMO', revenge: 'İntikam', impatient: 'Sabırsız', tired: 'Yorgun' };
  var DICT_LANG = { tr: 'tr-TR', en: 'en-US', de: 'de-DE' };

  function lang() { try { var l = global.i18n && global.i18n.getCurrentLanguage && global.i18n.getCurrentLanguage(); return TAGS[l] ? l : 'tr'; } catch (e) { return 'tr'; } }
  function _t(key, fb) { try { if (global.i18n && global.i18n.t) { var v = global.i18n.t(key); if (v && v !== key) return v; } } catch (e) { /* fallback */ } return fb; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tagRe(word) { return new RegExp('(^|\\s)#' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s|$|[.,;!?])', 'iu'); }
  // a tag in any language counts as that emotion (a note written in Turkish, read with the app in English)
  function has(text, emo) { return Object.keys(TAGS).some(function (l) { return tagRe(TAGS[l][emo]).test(text); }); }
  function fire(ta) { try { ta.dispatchEvent(new Event('input', { bubbles: true })); ta.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { /* old browsers */ } }

  function toggle(ta, emo) {
    var v = ta.value || '';
    if (has(v, emo)) {
      Object.keys(TAGS).forEach(function (l) { v = v.replace(tagRe(TAGS[l][emo]), '$1'); });
      v = v.replace(/[ \t]{2,}/g, ' ').replace(/^\s+|\s+$/g, '');
    } else {
      v = v.replace(/\s+$/, '') + (v.trim() ? ' ' : '') + '#' + TAGS[lang()][emo];
    }
    ta.value = v; fire(ta); paint(ta);
  }
  function paint(ta) {
    var bar = ta._wwNoteBar; if (!bar) return;
    bar.querySelectorAll('[data-emo]').forEach(function (b) {
      var on = has(ta.value || '', b.getAttribute('data-emo'));
      b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  // ---------------------------------------------------------------- dictation into the note
  var D = { rec: null, ta: null, base: '', final: '' };
  function speechApi() { return global.SpeechRecognition || global.webkitSpeechRecognition || null; }
  function join(a, b) { b = String(b || '').replace(/\s+/g, ' ').trim(); if (!b) return a; return a + (a && !/\s$/.test(a) ? ' ' : '') + b; }
  function stop(discard) {
    var rec = D.rec; if (!rec) return;
    var ta = D.ta;
    if (discard) { D.rec = null; try { rec.abort(); } catch (e) { /* ended */ } } else { try { rec.stop(); } catch (e) { D.rec = null; } }
    if (!D.rec && ta) micState(ta, false);
  }
  function micState(ta, on) {
    var b = ta._wwNoteBar && ta._wwNoteBar.querySelector('.wwn-mic'); if (!b) return;
    b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    var s = on ? _t('notes.dictate_stop', 'Dikteyi durdur') : _t('notes.dictate', 'Sesle not al');
    b.title = s; b.setAttribute('aria-label', s);
  }
  function start(ta) {
    var Api = speechApi(); if (!Api) return;
    if (D.rec) stop(true);
    var rec; try { rec = new Api(); } catch (e) { return; }
    rec.lang = DICT_LANG[lang()]; rec.interimResults = true; rec.continuous = !/Android/i.test(navigator.userAgent || '');
    D.rec = rec; D.ta = ta; D.base = ta.value || ''; D.final = '';
    rec.onresult = function (e) {
      if (D.rec !== rec) return;
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var t = e.results[i][0] ? e.results[i][0].transcript : '';
        if (e.results[i].isFinal) D.final = join(D.final, t); else interim += t;
      }
      ta.value = join(D.base, join(D.final, interim)); fire(ta); paint(ta);
    };
    rec.onerror = function (e) {
      if (D.rec !== rec) return;
      var c = e && e.error;
      if ((c === 'not-allowed' || c === 'service-not-allowed') && typeof global.showToast === 'function') global.showToast(_t('aiCoach.dictate_denied', 'Mikrofon izni verilmedi. Tarayıcının site ayarlarından izin verebilirsin.'), 'error');
    };
    rec.onend = function () { if (D.rec === rec) { D.rec = null; micState(ta, false); } };
    try { rec.start(); } catch (e) { D.rec = null; return; }
    micState(ta, true); ta.focus();
  }

  // ---------------------------------------------------------------- the bar
  function enhance(ta) {
    if (ta._wwNoteBar || !ta.parentNode) return;
    var bar = document.createElement('div');
    bar.className = 'wwn-bar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', _t('notes.emotion_label', 'Bu işlemde nasıl hissettin?'));
    var h = '<span class="wwn-label">' + esc(_t('notes.emotion_label', 'Bu işlemde nasıl hissettin?')) + '</span><span class="wwn-chips">';
    EMOTIONS.forEach(function (e) {
      h += '<button type="button" class="wwn-chip' + (POSITIVE[e] ? ' is-good' : '') + '" data-emo="' + e + '" aria-pressed="false">' + esc(_t('notes.emotion.' + e, LABEL_TR[e])) + '</button>';
    });
    h += '</span>';
    if (speechApi()) h += '<button type="button" class="wwn-mic" aria-pressed="false"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"/></svg></button>';
    bar.innerHTML = h;
    ta.parentNode.insertBefore(bar, ta.nextSibling);
    ta._wwNoteBar = bar;
    bar.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      ev.preventDefault();
      if (b.hasAttribute('data-emo')) toggle(ta, b.getAttribute('data-emo'));
      else if (b.classList.contains('wwn-mic')) { if (D.rec && D.ta === ta) stop(false); else start(ta); }
    });
    // typing while dictating stops it; any edit repaints the chips (forms also reset the note programmatically)
    ta.addEventListener('input', function (ev) { if (D.rec && D.ta === ta && ev.isTrusted) stop(true); paint(ta); });
    if (speechApi()) micState(ta, false);
    paint(ta);
  }
  function scan() { document.querySelectorAll(TARGETS).forEach(enhance); document.querySelectorAll(TARGETS).forEach(paint); }
  var pending = false;
  function schedule() { if (pending) return; pending = true; (global.requestAnimationFrame || setTimeout)(function () { pending = false; scan(); }); }
  function init() {
    scan();
    try { new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); } catch (e) { /* old browsers: forms present at load only */ }
    // forms set the note's value in code (edit, reset): repaint now and then while a note field is focused
    document.addEventListener('focusin', function (e) { if (e.target && e.target.matches && e.target.matches(TARGETS)) paint(e.target); });
    global.addEventListener('trade-saved', function () { setTimeout(scan, 50); });
    try { if (global.i18n && typeof global.i18n.onChange === 'function') global.i18n.onChange(function () { document.querySelectorAll(TARGETS).forEach(function (ta) { if (ta._wwNoteBar) { ta._wwNoteBar.remove(); ta._wwNoteBar = null; } enhance(ta); }); }); } catch (e) { /* ignore */ }
  }

  global.WwNoteTools = { scan: scan, _has: has, _toggle: toggle };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
