// ============================================================
// WAWE AI COACH - chat panel on every app page (Layout.astro, isAppPage). Lives on <body>, outside the SPA container,
// so it stays open across page changes.
//   - questions about the member's own trading, answered by the ai-coach Edge Function (Gemini + trade summary)
//   - chart screenshots: file picker, paste or drop; resized to JPEG (max 1600 px) in the browser, sent once, never stored
//   - quick prompts for strategy / performance / mistakes / psychology analysis
//   - history: the member's conversations (ai_conversations / ai_messages, read and deleted through RLS)
// Depends on window.sb (Supabase client) and, when present, window.i18n, window.journal, window.openUpgradeModal.
// ============================================================
(function (global) {
  'use strict';
  if (global.WwAiCoach) return;

  var MAX_SIDE = 1600, JPEG_Q = 0.85, MAX_MESSAGE = 4000, SS_KEY = 'ww_ai_coach_v1';
  var FALLBACK_URL = 'https://odasapyhtdopbnlfhwde.supabase.co';
  var ICON = {
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M19 3v4M17 5h4M5 17v4M3 19h4"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
    shrink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
    brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24A2.5 2.5 0 0 0 14.5 2Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>'
  };
  // [question key, question fallback, short label key, short label fallback, icon]
  var PROMPTS = [
    ['aiCoach.prompt.strategies', 'Stratejilerimi karşılaştır. Hangisini geliştirmeli, hangisini bırakmalıyım?', 'aiCoach.chip.strategies', 'Strateji karşılaştır', 'layers'],
    ['aiCoach.prompt.month', 'Bu ayki performansımı analiz et ve önceki aylarla karşılaştır.', 'aiCoach.chip.month', 'Aylık rapor', 'calendar'],
    ['aiCoach.prompt.mistakes', 'En sık yaptığım hataları bul ve nasıl düzeltebileceğimi söyle.', 'aiCoach.chip.mistakes', 'Hatalarım', 'alert'],
    ['aiCoach.prompt.psychology', 'İşlemlerimde psikolojik zayıf noktalar görüyor musun? (intikam işlemi, aşırı işlem, stop kullanmama)', 'aiCoach.chip.psychology', 'Psikoloji', 'brain']
  ];
  var WIDE_KEY = 'ww_ai_coach_wide';

  // ---------------------------------------------------------------- helpers
  function _t(key, fallback, params) {
    var s = fallback;
    try { if (global.i18n && typeof global.i18n.t === 'function') { var v = global.i18n.t(key, params); if (v && v !== key) s = v; } } catch (e) { /* fallback */ }
    if (params) Object.keys(params).forEach(function (k) { s = String(s).split('{' + k + '}').join(params[k]); });
    return s;
  }
  function lang() { try { var l = global.i18n && global.i18n.getCurrentLanguage && global.i18n.getCurrentLanguage(); return ['tr', 'en', 'de'].indexOf(l) >= 0 ? l : 'tr'; } catch (e) { return 'tr'; } }
  function tz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function endpoint() { var c = global.WW_CONFIG || {}; return global.SUPABASE_URL || c.SUPABASE_URL || FALLBACK_URL; }
  function anonKey() { var c = global.WW_CONFIG || {}; return global.SUPABASE_ANON_KEY || c.SUPABASE_ANON_KEY || ''; }
  function session() {
    if (!global.sb || !global.sb.auth) return Promise.resolve(null);
    return global.sb.auth.getSession().then(function (r) { return r && r.data && r.data.session ? r.data.session : null; }, function () { return null; });
  }
  function load() { try { return JSON.parse(sessionStorage.getItem(SS_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function save(v) { try { sessionStorage.setItem(SS_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ } }

  // Small, safe markdown subset: the text is escaped first, then **bold**, *italic*, `code`, ### headings, - / 1. lists.
  function md(text) {
    var lines = esc(text).split(/\r?\n/), html = [], list = null;
    function inline(s) {
      return s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
    }
    function close() { if (list) { html.push('</' + list + '>'); list = null; } }
    lines.forEach(function (ln) {
      var m;
      if ((m = /^\s*[-*•]\s+(.*)$/.exec(ln))) { if (list !== 'ul') { close(); html.push('<ul>'); list = 'ul'; } html.push('<li>' + inline(m[1]) + '</li>'); return; }
      if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(ln))) { if (list !== 'ol') { close(); html.push('<ol>'); list = 'ol'; } html.push('<li>' + inline(m[1]) + '</li>'); return; }
      close();
      if ((m = /^#{1,6}\s+(.*)$/.exec(ln))) { html.push('<p class="wwai-h">' + inline(m[1]) + '</p>'); return; }
      if (!ln.trim()) return;
      html.push('<p>' + inline(ln) + '</p>');
    });
    close();
    return html.join('');
  }

  // image File -> { mimeType, data (base64), url (object URL for the bubble) }, longest side <= MAX_SIDE, JPEG
  function prepareImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('type'));
      if (file.size > 25 * 1024 * 1024) return reject(new Error('size'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, MAX_SIDE / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
        var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
        var dataUrl = c.toDataURL('image/jpeg', JPEG_Q);
        resolve({ mimeType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1), url: url });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  // ---------------------------------------------------------------- state + DOM
  // journalId: the journal a NEW chat analyses ('' = all journals; undefined = the active journal); convJournal: the open chat's
  var S = { open: false, view: 'chat', conversationId: null, messages: [], pending: false, image: null, usage: null, mounted: false,
    journalId: undefined, convJournal: undefined, journals: null, snap: {} };
  var R = {};

  function mount() {
    if (S.mounted) return;
    S.mounted = true;
    var fab = el('button', 'wwai-fab', ICON.spark);
    fab.type = 'button'; fab.id = 'wwai-fab';
    R.fab = fab;
    var panel = el('section', 'wwai-panel');
    panel.id = 'wwai-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog');
    panel.innerHTML =
      '<header class="wwai-head">' +
        '<button type="button" class="wwai-icon wwai-back" data-act="back" hidden>' + ICON.back + '</button>' +
        '<div class="wwai-title-wrap"><div class="wwai-title"><span class="wwai-title-icon">' + ICON.spark + '</span><span class="wwai-title-text"></span></div>' +
          '<label class="wwai-journal" hidden><span class="wwai-journal-label"></span><select class="wwai-journal-sel"></select></label></div>' +
        '<span class="wwai-usage" hidden></span>' +
        '<button type="button" class="wwai-icon wwai-wide-btn" data-act="wide">' + ICON.expand + '</button>' +
        '<button type="button" class="wwai-icon" data-act="history">' + ICON.list + '</button>' +
        '<button type="button" class="wwai-icon" data-act="new">' + ICON.plus + '</button>' +
        '<button type="button" class="wwai-icon" data-act="close">' + ICON.close + '</button>' +
      '</header>' +
      '<div class="wwai-body"><div class="wwai-msgs" aria-live="polite"></div><div class="wwai-history" hidden></div></div>' +
      '<footer class="wwai-foot">' +
        '<div class="wwai-attach" hidden><img alt=""><span class="wwai-attach-name"></span><button type="button" class="wwai-icon" data-act="unattach">' + ICON.close + '</button></div>' +
        '<div class="wwai-compose">' +
          '<button type="button" class="wwai-icon wwai-img-btn" data-act="pick">' + ICON.image + '</button>' +
          '<textarea class="wwai-input" rows="1" maxlength="' + MAX_MESSAGE + '"></textarea>' +
          '<button type="button" class="wwai-send" data-act="send">' + ICON.send + '</button>' +
        '</div>' +
        '<p class="wwai-note"></p>' +
        '<input type="file" class="wwai-file" accept="image/png,image/jpeg,image/webp" hidden>' +
      '</footer>' +
      '<div class="wwai-drop" hidden></div>';
    document.body.appendChild(fab);
    document.body.appendChild(panel);
    R.panel = panel; R.msgs = panel.querySelector('.wwai-msgs'); R.history = panel.querySelector('.wwai-history');
    R.input = panel.querySelector('.wwai-input'); R.file = panel.querySelector('.wwai-file'); R.attach = panel.querySelector('.wwai-attach');
    R.usage = panel.querySelector('.wwai-usage'); R.send = panel.querySelector('.wwai-send'); R.drop = panel.querySelector('.wwai-drop');
    R.journal = panel.querySelector('.wwai-journal'); R.journalSel = panel.querySelector('.wwai-journal-sel');
    R.journalSel.addEventListener('change', function () { S.journalId = R.journalSel.value; renderJournal(); if (!S.messages.length && S.view === 'chat') renderMessages(); });
    try { if (localStorage.getItem(WIDE_KEY) === '1') panel.classList.add('is-wide'); } catch (e) { /* ignore */ }

    fab.addEventListener('click', function () { setOpen(!S.open); });
    panel.addEventListener('click', onClick);
    R.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
      if (e.key === 'Escape') setOpen(false);
    });
    R.input.addEventListener('input', autosize);
    R.input.addEventListener('paste', function (e) {
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { e.preventDefault(); attach(items[i].getAsFile()); return; }
    });
    R.file.addEventListener('change', function () { if (R.file.files && R.file.files[0]) attach(R.file.files[0]); R.file.value = ''; });
    panel.addEventListener('dragover', function (e) { if (hasFile(e)) { e.preventDefault(); R.drop.hidden = false; } });
    panel.addEventListener('dragleave', function (e) { if (e.target === R.drop) R.drop.hidden = true; });
    panel.addEventListener('drop', function (e) { R.drop.hidden = true; if (hasFile(e)) { e.preventDefault(); attach(e.dataTransfer.files[0]); } });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && S.open && document.activeElement && R.panel.contains(document.activeElement)) setOpen(false);
      // Ctrl/Cmd+K opens or closes the coach from anywhere
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && String(e.key).toLowerCase() === 'k') { e.preventDefault(); setOpen(!S.open); }
    });
    try { if (global.i18n && typeof global.i18n.onChange === 'function') global.i18n.onChange(texts); } catch (e) { /* ignore */ }
    texts();
    var st = load();
    if (st.conversationId) S.conversationId = st.conversationId;
    if (st.open) setOpen(true);
  }
  function hasFile(e) { var t = e.dataTransfer && e.dataTransfer.types; return !!t && Array.prototype.indexOf.call(t, 'Files') >= 0; }
  function autosize() { R.input.style.height = 'auto'; R.input.style.height = Math.min(R.input.scrollHeight, 140) + 'px'; }

  function texts() {
    if (!R.panel) return;
    var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
    R.fab.setAttribute('aria-label', _t('aiCoach.open', 'AI Koç'));
    R.fab.title = _t('aiCoach.open', 'AI Koç') + ' (' + (mac ? '⌘' : 'Ctrl+') + 'K)';
    R.fab.setAttribute('aria-keyshortcuts', 'Control+K Meta+K');
    var wide = R.panel.classList.contains('is-wide'), wb = R.panel.querySelector('[data-act="wide"]');
    wb.innerHTML = wide ? ICON.shrink : ICON.expand; wb.title = wide ? _t('aiCoach.shrink', 'Küçült') : _t('aiCoach.expand', 'Büyüt'); wb.setAttribute('aria-label', wb.title);
    R.panel.querySelector('.wwai-journal-label').textContent = _t('aiCoach.journal', 'Defter') + ':';
    R.panel.setAttribute('aria-label', _t('aiCoach.title', 'AI Koç'));
    R.panel.querySelector('.wwai-title-text').textContent = S.view === 'history' ? _t('aiCoach.history', 'Geçmiş sohbetler') : _t('aiCoach.title', 'AI Koç');
    [['history', 'aiCoach.history', 'Geçmiş sohbetler'], ['new', 'aiCoach.new', 'Yeni sohbet'], ['close', 'aiCoach.close', 'Kapat'], ['back', 'aiCoach.back', 'Geri'],
      ['pick', 'aiCoach.attach', 'Grafik görüntüsü ekle'], ['send', 'aiCoach.send', 'Gönder'], ['unattach', 'aiCoach.remove_image', 'Görseli kaldır']].forEach(function (x) {
      var b = R.panel.querySelector('[data-act="' + x[0] + '"]'); if (b) { var s = _t(x[1], x[2]); b.title = s; b.setAttribute('aria-label', s); }
    });
    R.input.placeholder = _t('aiCoach.placeholder', 'Bir soru sor ya da grafik ekle…');
    autosize();
    R.panel.querySelector('.wwai-note').textContent = _t('aiCoach.note', 'AI hata yapabilir. Yatırım tavsiyesi değildir.');
    R.drop.textContent = _t('aiCoach.drop', 'Görseli buraya bırak');
    renderUsage();
    renderJournal();
    if (S.view === 'chat' && !S.messages.length) renderMessages();
  }

  function setOpen(on) {
    S.open = !!on;
    R.panel.hidden = !S.open;
    R.fab.classList.toggle('is-open', S.open);
    R.fab.setAttribute('aria-expanded', S.open ? 'true' : 'false');
    save({ open: S.open, conversationId: S.conversationId });
    if (S.open) {
      loadJournals();
      if (S.conversationId && !S.messages.length) openConversation(S.conversationId);
      else renderMessages();
      loadUsage();
      setTimeout(function () { R.input.focus(); }, 30);
    }
  }

  function onClick(e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'close') setOpen(false);
    else if (act === 'new') newChat();
    else if (act === 'history') showHistory();
    else if (act === 'back') showChat();
    else if (act === 'pick') R.file.click();
    else if (act === 'unattach') clearImage();
    else if (act === 'send') send();
    else if (act === 'prompt') { R.input.value = b.getAttribute('data-text'); send(); }
    else if (act === 'prompt-image') R.file.click();
    else if (act === 'wide') {
      var on = !R.panel.classList.contains('is-wide'); R.panel.classList.toggle('is-wide', on);
      try { localStorage.setItem(WIDE_KEY, on ? '1' : '0'); } catch (e2) { /* ignore */ }
      texts();
    }
    else if (act === 'open-conv') openConversation(b.getAttribute('data-id'));
    else if (act === 'del-conv') { e.stopPropagation(); deleteConversation(b.getAttribute('data-id')); }
    else if (act === 'upgrade') { if (typeof global.openUpgradeModal === 'function') global.openUpgradeModal({ feature: 'aiCoach' }); else global.location.href = '/settings'; }
  }

  // ---------------------------------------------------------------- chat
  function newChat() {
    S.conversationId = null; S.convJournal = undefined; S.messages = []; clearImage();
    save({ open: S.open, conversationId: null });
    showChat();
    R.input.focus();
  }
  function showChat() { S.view = 'chat'; R.history.hidden = true; R.msgs.hidden = false; R.panel.querySelector('.wwai-foot').hidden = false; R.panel.querySelector('.wwai-back').hidden = true; texts(); renderMessages(); }

  function renderMessages() {
    var box = R.msgs; box.innerHTML = '';
    if (!S.messages.length) { box.appendChild(renderEmpty()); return; }
    S.messages.forEach(function (m) { box.appendChild(bubble(m)); });
    if (S.pending === true) box.appendChild(el('div', 'wwai-msg wwai-model wwai-typing', '<span></span><span></span><span></span>'));
    box.scrollTop = box.scrollHeight;
  }
  // model text: markdown chunks with charts in place of their [[viz:...]] lines (data from the server, never the model).
  // While streaming, a directive line shows a placeholder and a half-written one at the end is hidden.
  var VIZ_LINE = /^\s*\[\[viz:([a-z_:]+)\]\]\s*$/;
  function fillModel(body, m) {
    body.innerHTML = '';
    var lines = String(m.content || '').split('\n'), chunk = [];
    if (m.streaming && lines.length && /^\s*\[\[/.test(lines[lines.length - 1])) lines.pop();
    function flush() { if (chunk.length) { var d = el('div', 'wwai-md', md(chunk.join('\n'))); body.appendChild(d); chunk = []; } }
    lines.forEach(function (ln) {
      var v = VIZ_LINE.exec(ln);
      if (!v) { chunk.push(ln); return; }
      flush();
      var data = m.visuals && m.visuals[v[1]];
      if (data) body.appendChild(renderViz(data));
      else if (m.streaming) body.appendChild(el('div', 'wwai-viz wwai-viz-wait'));
    });
    flush();
  }

  function bubble(m) {
    var b = el('div', 'wwai-msg ' + (m.role === 'user' ? 'wwai-user' : 'wwai-model') + (m.error ? ' wwai-error' : ''));
    if (m.imageUrl) { var im = el('img', 'wwai-msg-img'); im.src = m.imageUrl; im.alt = ''; b.appendChild(im); }
    else if (m.hadImage) b.appendChild(el('span', 'wwai-msg-imgnote', esc(_t('aiCoach.image_sent', 'Görsel gönderildi'))));
    var body = el('div', 'wwai-msg-text');
    if (m.role === 'user' || m.error) body.textContent = m.content; else fillModel(body, m);
    b.appendChild(body);
    if (m.note) b.appendChild(el('p', 'wwai-msg-note', esc(m.note)));
    if (m.upgrade) {
      var u = el('button', 'wwai-upgrade'); u.type = 'button'; u.setAttribute('data-act', 'upgrade'); u.textContent = _t('aiCoach.upgrade', "Premium'a geç"); b.appendChild(u);
    }
    return b;
  }

  function attach(file) {
    prepareImage(file).then(function (img) {
      clearImage();
      S.image = img;
      R.attach.hidden = false; R.attach.querySelector('img').src = img.url;
      R.attach.querySelector('.wwai-attach-name').textContent = (file && file.name) || _t('aiCoach.pasted_image', 'Yapıştırılan görsel');
      if (!R.input.value.trim()) R.input.value = _t('aiCoach.prompt.chart_text', 'Bu grafikteki kurulum hakkında ne düşünüyorsun?');
      R.input.focus(); autosize();
    }, function () { toast(_t('aiCoach.err.image', 'Bu görsel kullanılamıyor. PNG, JPEG ya da WEBP dene.'), 'error'); });
  }
  function clearImage() { S.image = null; if (R.attach) { R.attach.hidden = true; R.attach.querySelector('img').removeAttribute('src'); } }
  function toast(msg, type) { if (typeof global.showToast === 'function') global.showToast(msg, type || 'info'); }

  function errorText(code, j) {
    if (code === 'LIMIT') return j && j.usage && !j.usage.premium
      ? _t('aiCoach.err.limit_free', 'Bugünkü {limit} ücretsiz mesaj hakkını kullandın. Yarın yenilenir; Premium ile daha fazla mesaj gönderebilirsin.', { limit: j.usage.limit })
      : _t('aiCoach.err.limit', 'Bugünkü mesaj hakkın doldu ({limit}). Yarın yenilenir.', { limit: (j && j.usage && j.usage.limit) || '' });
    if (code === 'BUSY') return _t('aiCoach.err.busy', 'AI şu an çok yoğun. Bir dakika sonra tekrar dene.');
    if (code === 'UNAUTHORIZED') return _t('aiCoach.err.session', 'Oturumun sona ermiş. Sayfayı yenileyip tekrar giriş yap.');
    if (code === 'BAD_IMAGE' || code === 'TOO_LARGE') return _t('aiCoach.err.image', 'Bu görsel kullanılamıyor. PNG, JPEG ya da WEBP dene.');
    if (code === 'NOT_CONFIGURED') return _t('aiCoach.err.off', 'AI Koç şu an kullanılamıyor.');
    if (code === 'NETWORK') return _t('aiCoach.err.network', 'Bağlantı hatası. İnternetini kontrol edip tekrar dene.');
    return _t('aiCoach.err.generic', 'AI şu an cevap veremedi. Birazdan tekrar dene.');
  }

  function send() {
    if (S.pending) return;
    var text = R.input.value.trim();
    if (!text && S.image) text = _t('aiCoach.prompt.chart_text', 'Bu grafikteki kurulum hakkında ne düşünüyorsun?');
    if (!text) return;
    if (S.view !== 'chat') showChat();
    var img = S.image;
    S.messages.push({ role: 'user', content: text, imageUrl: img ? img.url : null });
    R.input.value = ''; autosize(); clearImage();
    S.pending = true; R.send.disabled = true;
    renderMessages();
    var reply = null;                                       // the streaming answer, once the first word arrived
    function live() {                                       // redraw only the streaming bubble, once per frame
      if (!reply || reply._raf) return;
      reply._raf = (global.requestAnimationFrame || setTimeout)(function () {
        reply._raf = 0;
        if (!reply.el || !reply.el.isConnected) return;
        var near = R.msgs.scrollHeight - R.msgs.scrollTop - R.msgs.clientHeight < 80;
        fillModel(reply.el.querySelector('.wwai-msg-text'), reply);
        if (near) R.msgs.scrollTop = R.msgs.scrollHeight;
      });
    }
    function onDelta(t) {
      if (!reply) {
        reply = { role: 'model', content: '', streaming: true };
        S.messages.push(reply);
        S.pending = 'streaming';
        renderMessages();
        reply.el = R.msgs.lastElementChild && R.msgs.lastElementChild.classList.contains('wwai-model') ? R.msgs.lastElementChild : null;
      }
      reply.content += t; live();
    }
    function onReset() {                                    // the server retries a broken answer: back to "typing…"
      if (!reply) return;
      var i = S.messages.indexOf(reply); if (i >= 0) S.messages.splice(i, 1);
      reply = null; S.pending = true; renderMessages();
    }
    function failWith(code, j) {
      var msg = errorText(code, j);
      if (reply) { reply.streaming = false; reply.note = msg; }          // keep the part already shown, say it stopped
      else S.messages.push({ role: 'model', content: msg, error: true, upgrade: code === 'LIMIT' && j && j.usage && !j.usage.premium });
    }
    session().then(function (s) {
      if (!s) throw Object.assign(new Error('session'), { code: 'UNAUTHORIZED' });
      var body = { message: text, lang: lang(), tz: tz(), stream: true };
      if (S.conversationId) body.conversationId = S.conversationId;
      else { var jid = currentJournal(); if (jid) body.journalId = jid; S.convJournal = jid || null; }
      if (img) body.image = { mimeType: img.mimeType, data: img.data };
      return fetch(endpoint() + '/functions/v1/ai-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.access_token, 'apikey': anonKey() },
        body: JSON.stringify(body)
      }).catch(function () { throw Object.assign(new Error('network'), { code: 'NETWORK' }); });
    }).then(function (res) {
      var ct = res.headers.get('content-type') || '';
      if (res.ok && ct.indexOf('text/event-stream') >= 0 && res.body && res.body.getReader) return readStream(res.body, onDelta, onReset);
      return res.json().then(function (j) { return { status: res.status, j: j || {} }; }, function () { return { status: res.status, j: {} }; })
        .then(function (r) { return r.j && r.j.ok ? { done: r.j } : { error: r.j, code: r.j.code || (r.status === 401 ? 'UNAUTHORIZED' : 'UPSTREAM') }; });
    }).then(function (out) {
      var j = out.done || out.error || {};
      if (j.usage) { S.usage = j.usage; renderUsage(); }
      if (out.error || !out.done) { failWith(out.code || 'UPSTREAM', out.error); return; }
      if (j.conversationId) { S.conversationId = j.conversationId; save({ open: S.open, conversationId: S.conversationId }); renderJournal(); }
      if (!reply) { reply = { role: 'model', content: '' }; S.messages.push(reply); }
      reply.content = j.reply; reply.visuals = j.visuals || null; reply.streaming = false;
    }).catch(function (e) {
      failWith((e && e.code) || 'NETWORK');
    }).then(function () {
      if (reply) reply.streaming = false;
      S.pending = false; R.send.disabled = false;
      if (S.view === 'chat') renderMessages();
    });
  }

  // reads the ai-coach event stream: "delta" {text} ..., then "done" {...} or "error" {code}
  function readStream(stream, onDelta, onReset) {
    var reader = stream.getReader(), dec = new TextDecoder(), buf = '', result = null;
    function handle(block) {
      var ev = 'message', data = '';
      block.split('\n').forEach(function (l) { if (l.indexOf('event:') === 0) ev = l.slice(6).trim(); else if (l.indexOf('data:') === 0) data += l.slice(5).trim(); });
      if (!data) return;
      var j; try { j = JSON.parse(data); } catch (e) { return; }
      if (ev === 'delta' && j.text) onDelta(j.text);
      else if (ev === 'done') result = { done: Object.assign({ ok: true }, j) };
      else if (ev === 'error') result = { error: j, code: j.code || 'UPSTREAM' };
      else if (ev === 'start' && j.usage) { S.usage = j.usage; renderUsage(); }
      else if (ev === 'reset' && onReset) onReset();
    }
    function pump() {
      return reader.read().then(function (r) {
        if (r.value) buf += dec.decode(r.value, { stream: !r.done });
        var parts = buf.replace(/\r\n/g, '\n').split('\n\n'); buf = parts.pop();
        parts.forEach(handle);
        if (r.done) { if (buf.trim()) handle(buf); return result || { error: {}, code: 'UPSTREAM' }; }
        return pump();
      });
    }
    return pump().catch(function () { return result || { error: {}, code: 'NETWORK' }; });
  }

  // ---------------------------------------------------------------- charts (drawn from the server's numbers)
  var DAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
  // Turkish fallbacks of the dynamic chart keys (aiCoach.viz.<group>.<id>), used when the locale is not loaded
  var VIZ_TR = {
    kpi: { win_rate: 'Kazanma oranı', net: 'Net sonuç', profit_factor: 'Kâr faktörü', max_drawdown: 'Maks. düşüş' },
    metric: { net: 'Net kâr/zarar', win_rate: 'Kazanma oranı', trades: 'İşlem sayısı', profit_factor: 'Kâr faktörü', avg_win: 'Ortalama kazanç', avg_loss: 'Ortalama kayıp' },
    dataset: { by_strategy: 'Strateji', by_symbol: 'Sembol', by_direction: 'Yön', by_weekday: 'Gün', by_session_utc: 'Seans', by_entry_hour_local: 'Giriş saati',
      by_month_last_12: 'Ay', by_trade_number_of_day: 'Günün kaçıncı işlemi', after_consecutive_losses: 'Art arda kayıp sonrası' },
    session: { asia: 'Asya', london: 'Londra', london_ny_overlap: 'Londra–NY', new_york: 'New York', late: 'Geç saat' }
  };
  function vt(group, id) { return _t('aiCoach.viz.' + group + '.' + id, (VIZ_TR[group] && VIZ_TR[group][id]) || id); }
  function nf(v, opts) { try { return new Intl.NumberFormat(lang(), opts).format(v); } catch (e) { return String(v); } }
  function money(v, signed) {
    var cur = (typeof global.getCurrencySymbol === 'function' && global.getCurrencySymbol()) || '$';
    var a = Math.abs(v), s = nf(a, { maximumFractionDigits: a < 100 ? 2 : 0 });
    return (v < 0 ? '−' : signed && v > 0 ? '+' : '') + cur + s;
  }
  function fmt(v, unit, signed) {
    if (v == null || !isFinite(v)) return '—';
    if (unit === 'pct') return nf(v, { maximumFractionDigits: 1 }) + '%';
    if (unit === 'ratio') return nf(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (unit === 'count') return nf(v, { maximumFractionDigits: 0 });
    return money(v, signed);
  }
  function bucketLabel(dataset, key) {
    if (dataset === 'by_weekday' && key in DAYS) {
      try { return new Intl.DateTimeFormat(lang(), { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + DAYS[key]))); } catch (e) { return key; }
    }
    if (dataset === 'by_entry_hour_local') return key + ':00';
    if (dataset === 'by_month_last_12' && /^\d{4}-\d{2}$/.test(key)) {
      try { return new Intl.DateTimeFormat(lang(), { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(+key.slice(0, 4), +key.slice(5) - 1, 1))); } catch (e) { return key; }
    }
    if (dataset === 'by_session_utc') { var sk = key.split(' ')[0]; return vt('session', sk) + ' ' + (key.slice(sk.length).trim()); }
    if (dataset === 'after_consecutive_losses') return _t('aiCoach.viz.after_losses', '{n} kayıp sonrası', { n: key });
    if (dataset === 'by_trade_number_of_day') return _t('aiCoach.viz.nth_trade', 'Günün {n}. işlemi', { n: key.replace(/\D+$/, '').replace(/[a-z]+/, '') + (/\+/.test(key) ? '+' : '') });
    if (key === '(no strategy)') return _t('aiCoach.viz.no_strategy', 'Stratejisiz');
    return key;
  }
  function vizTitle(v) {
    if (v.kind === 'kpis') return _t('aiCoach.viz.kpis', 'Genel performans');
    if (v.kind === 'equity') return _t('aiCoach.viz.equity', 'Bakiye eğrisi (kümülatif sonuç)');
    return vt('metric', v.metric) + ' · ' + vt('dataset', v.dataset);
  }
  function tipFor(box) {
    var tip = box.querySelector('.wwai-tip');
    if (!tip) { tip = el('div', 'wwai-tip'); tip.hidden = true; box.appendChild(tip); }
    return tip;
  }
  function showTip(box, html, x, y) {
    var tip = tipFor(box); tip.innerHTML = html; tip.hidden = false;
    var bw = box.clientWidth, tw = tip.offsetWidth;
    tip.style.left = Math.max(4, Math.min(bw - tw - 4, x - tw / 2)) + 'px'; tip.style.top = Math.max(4, y - tip.offsetHeight - 10) + 'px';
  }
  function hideTip(box) { var t = box.querySelector('.wwai-tip'); if (t) t.hidden = true; }

  function renderViz(v) {
    var box = el('figure', 'wwai-viz wwai-viz-' + v.kind);
    var cap = el('figcaption', 'wwai-viz-head');
    cap.appendChild(el('span', 'wwai-viz-title', esc(vizTitle(v))));
    if (v.kind === 'equity' && v.points.length) {
      var lastV = v.points[v.points.length - 1].v, hv = el('span', 'wwai-viz-value ' + (lastV > 0 ? 'is-pos' : lastV < 0 ? 'is-neg' : ''), esc(fmt(lastV, 'money', true)));
      cap.appendChild(hv);
    }
    if (v.kind !== 'kpis') {
      var tb = el('button', 'wwai-viz-table-btn'); tb.type = 'button'; tb.textContent = _t('aiCoach.viz.table', 'Tablo');
      tb.setAttribute('aria-expanded', 'false');
      tb.addEventListener('click', function () { var t = box.querySelector('.wwai-viz-table'); t.hidden = !t.hidden; tb.setAttribute('aria-expanded', t.hidden ? 'false' : 'true'); });
      cap.appendChild(tb);
    }
    box.appendChild(cap);
    if (v.kind === 'kpis') box.appendChild(kpis(v));
    else if (v.kind === 'bar') box.appendChild(bars(v, box));
    else if (v.kind === 'equity') box.appendChild(equity(v, box));
    if (v.kind !== 'kpis') box.appendChild(table(v));
    return box;
  }
  function kpis(v) {
    var g = el('div', 'wwai-kpis');
    v.items.forEach(function (it) {
      var t = el('div', 'wwai-kpi');
      t.appendChild(el('span', 'wwai-kpi-label', esc(vt('kpi', it.id))));
      var val = el('span', 'wwai-kpi-value', esc(it.id === 'max_drawdown' && it.value ? money(-it.value) : fmt(it.value, it.unit, it.id === 'net')));
      if (it.id === 'net' && isFinite(it.value) && it.value !== 0) val.classList.add(it.value > 0 ? 'is-pos' : 'is-neg');
      t.appendChild(val);
      if (it.sub) t.appendChild(el('span', 'wwai-kpi-sub', esc(it.id === 'net' ? _t('aiCoach.viz.trades_n', '{n} işlem', { n: it.sub }) : _t('aiCoach.viz.wins_of', '{w} kazanç / {t}', { w: it.sub.split('/')[0], t: it.sub.split('/')[1] }))));
      g.appendChild(t);
    });
    return g;
  }
  function bars(v, box) {
    var wrap = el('div', 'wwai-bars'), pol = v.unit === 'money';
    var max = 0, min = 0;
    v.items.forEach(function (it) { max = Math.max(max, it.value); min = Math.min(min, it.value); });
    var span = (max - min) || 1, zero = pol ? (-min / span) * 100 : 0;
    v.items.forEach(function (it) {
      var row = el('div', 'wwai-bar-row'); row.tabIndex = 0;
      row.appendChild(el('span', 'wwai-bar-label', esc(bucketLabel(v.dataset, it.label))));
      var track = el('span', 'wwai-bar-track'), bar = el('span', 'wwai-bar');
      var w = Math.abs(it.value) / (pol ? span : (max || 1)) * 100;
      if (pol && it.value < 0) { bar.classList.add('is-neg'); bar.style.right = (100 - zero) + '%'; }
      else { if (pol) bar.classList.add('is-pos'); bar.style.left = zero + '%'; }
      bar.style.width = Math.max(w, it.value === 0 ? 0 : 1.5) + '%';
      track.appendChild(bar);
      if (pol && min < 0) { var z = el('span', 'wwai-bar-zero'); z.style.left = zero + '%'; track.appendChild(z); }
      row.appendChild(track);
      row.appendChild(el('span', 'wwai-bar-value', esc(fmt(it.value, v.unit, pol))));
      var tipHtml = '<strong>' + esc(bucketLabel(v.dataset, it.label)) + '</strong><br>' + esc(fmt(it.value, v.unit, pol)) + ' · ' + esc(_t('aiCoach.viz.trades_n', '{n} işlem', { n: it.trades }));
      function show() { var r = row.getBoundingClientRect(), b = box.getBoundingClientRect(); showTip(box, tipHtml, r.left - b.left + r.width / 2, r.top - b.top); }
      row.addEventListener('mouseenter', show); row.addEventListener('focus', show);
      row.addEventListener('mouseleave', function () { hideTip(box); }); row.addEventListener('blur', function () { hideTip(box); });
      wrap.appendChild(row);
    });
    return wrap;
  }
  function equity(v, box) {
    var W = 360, H = 140, PL = 4, PR = 6, PT = 8, PB = 20, pts = v.points;
    var vs = pts.map(function (p) { return p.v; }), lo = Math.min(0, Math.min.apply(null, vs)), hi = Math.max(0, Math.max.apply(null, vs));
    if (hi === lo) hi = lo + 1;
    function X(i) { return PL + (W - PL - PR) * (pts.length === 1 ? 0.5 : i / (pts.length - 1)); }
    function Y(val) { return PT + (H - PT - PB) * (1 - (val - lo) / (hi - lo)); }
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.v).toFixed(1); }).join(' ');
    var area = line + ' L' + X(pts.length - 1).toFixed(1) + ' ' + Y(Math.max(lo, 0)).toFixed(1) + ' L' + X(0).toFixed(1) + ' ' + Y(Math.max(lo, 0)).toFixed(1) + ' Z';
    var last = pts[pts.length - 1], up = last.v >= 0;
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'wwai-eq ' + (up ? 'is-pos' : 'is-neg')); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', vizTitle(v) + ': ' + fmt(last.v, 'money', true));
    svg.innerHTML =
      (lo < 0 && hi > 0 ? '<line class="wwai-eq-zero" x1="' + PL + '" x2="' + (W - PR) + '" y1="' + Y(0).toFixed(1) + '" y2="' + Y(0).toFixed(1) + '"/>' : '') +
      '<path class="wwai-eq-area" d="' + area + '"/><path class="wwai-eq-line" d="' + line + '"/>' +
      '<circle class="wwai-eq-dot" r="4" cx="' + X(pts.length - 1).toFixed(1) + '" cy="' + Y(last.v).toFixed(1) + '"/>' +
      '<text class="wwai-eq-axis" x="' + PL + '" y="' + (H - 4) + '">' + esc(pts[0].t) + '</text>' +
      '<text class="wwai-eq-axis" x="' + (W - PR) + '" y="' + (H - 4) + '" text-anchor="end">' + esc(last.t) + '</text>' +
      '<line class="wwai-eq-cross" y1="' + PT + '" y2="' + (H - PB) + '" visibility="hidden"/><circle class="wwai-eq-hover" r="4" visibility="hidden"/>';
    var cross = svg.querySelector('.wwai-eq-cross'), hov = svg.querySelector('.wwai-eq-hover');
    svg.addEventListener('mousemove', function (e) {
      var r = svg.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width * W;
      var i = Math.max(0, Math.min(pts.length - 1, Math.round((fx - PL) / (W - PL - PR) * (pts.length - 1))));
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
      hov.setAttribute('cx', X(i)); hov.setAttribute('cy', Y(pts[i].v)); hov.setAttribute('visibility', 'visible');
      var b = box.getBoundingClientRect();
      showTip(box, esc(pts[i].t) + '<br><strong>' + esc(fmt(pts[i].v, 'money', true)) + '</strong>', r.left - b.left + X(i) / W * r.width, r.top - b.top + Y(pts[i].v) / H * r.height);
    });
    svg.addEventListener('mouseleave', function () { cross.setAttribute('visibility', 'hidden'); hov.setAttribute('visibility', 'hidden'); hideTip(box); });
    return svg;
  }
  function table(v) {
    var t = el('table', 'wwai-viz-table'); t.hidden = true;
    var head = v.kind === 'equity' ? [_t('aiCoach.viz.date', 'Tarih'), _t('aiCoach.viz.cumulative', 'Kümülatif')]
      : [vt('dataset', v.dataset), vt('metric', v.metric), _t('aiCoach.viz.trades', 'İşlem')];
    var rows = v.kind === 'equity' ? v.points.map(function (p) { return [p.t, fmt(p.v, 'money', true)]; })
      : v.items.map(function (it) { return [bucketLabel(v.dataset, it.label), fmt(it.value, v.unit, v.unit === 'money'), String(it.trades)]; });
    t.innerHTML = '<thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody>';
    return t;
  }


  // ---------------------------------------------------------------- journal of the analysis
  function currentJournal() {
    if (S.journalId !== undefined) return S.journalId;
    try { return (global.journal && global.journal.getActiveJournalId && global.journal.getActiveJournalId()) || ''; } catch (e) { return ''; }
  }
  function loadJournals() {
    if (S.journals || !global.journal || typeof global.journal.listJournals !== 'function') { renderJournal(); return; }
    Promise.resolve().then(function () { return global.journal.listJournals(); }).then(function (list) {
      S.journals = (list || []).filter(function (j) { return j && j.id; }).map(function (j) { return { id: j.id, name: j.name || '—' }; });
      renderJournal();
    }, function () { S.journals = []; renderJournal(); });
  }
  // a new chat picks its journal; an open chat shows the journal it was started on (fixed)
  function renderJournal() {
    if (!R.journalSel) return;
    var list = S.journals || [];
    if (!list.length || S.view !== 'chat') { R.journal.hidden = true; return; }
    R.journal.hidden = false;
    var locked = !!S.conversationId, cur = locked ? (S.convJournal == null ? '' : S.convJournal) : currentJournal();
    if (locked && S.convJournal === undefined) cur = currentJournal();
    var opts = [{ id: '', name: _t('aiCoach.journal_all', 'Tüm defterler') }].concat(list);
    R.journalSel.innerHTML = opts.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.name) + '</option>'; }).join('');
    R.journalSel.value = opts.some(function (o) { return o.id === cur; }) ? cur : '';
    R.journalSel.disabled = locked;
    R.journal.title = locked ? _t('aiCoach.journal_locked', 'Defter yeni sohbette değiştirilebilir.') : '';
  }

  // ---------------------------------------------------------------- opening screen: numbers + personal findings (no quota)
  function loadSnapshot(jid) {
    var k = jid || '*', c = S.snap[k];
    if (c && (c.data || c.loading) && Date.now() - c.at < 120000) return;
    S.snap[k] = { loading: true, at: Date.now() };
    session().then(function (s) {
      if (!s) throw new Error('session');
      var body = { action: 'snapshot', tz: tz() }; if (jid) body.journalId = jid;
      return fetch(endpoint() + '/functions/v1/ai-coach', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.access_token, 'apikey': anonKey() }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); });
    }).then(function (j) { S.snap[k] = { data: j && j.ok ? j.snapshot : null, at: Date.now() }; }, function () { S.snap[k] = { data: null, at: Date.now() }; })
      .then(function () { if (S.view === 'chat' && !S.messages.length && (currentJournal() || '*') === k) renderMessages(); });
  }
  function insightText(ins) {
    var p = {}, q = ins.params || {};
    Object.keys(q).forEach(function (key) { p[key] = q[key]; });
    ['net'].forEach(function (key) { if (key in q) p[key] = money(Number(q[key]), true); });
    ['win_rate', 'base', 'first', 'pct'].forEach(function (key) { if (key in q) p[key] = nf(Number(q[key]), { maximumFractionDigits: 1 }); });
    if ('day' in q && q.day in DAYS) { try { p.day = new Intl.DateTimeFormat(lang(), { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + DAYS[q.day]))); } catch (e) { /* key */ } }
    if ('session' in q) p.session = vt('session', q.session);
    var T = INSIGHT_TR[ins.id] || INSIGHT_TR.general;
    return { text: _t('aiCoach.insight.' + ins.id, T[0], p), question: _t('aiCoach.insight_q.' + ins.id, T[1], p) };
  }
  var INSIGHT_TR = {
    revenge: ['Art arda 2 kayıptan sonra kazanma oranın %{win_rate} (normalde %{base}).', '2 kayıptan sonra neden daha çok kaybediyorum? Bunu nasıl önlerim?'],
    overtrading: ['Gün ilerledikçe sonuçların kötüleşiyor: geç işlemlerde kazanma oranın %{win_rate}, ilk işlemde %{first}.', 'Gün içinde fazla mı işlem açıyorum? Bana bir günlük limit önerir misin?'],
    no_stop: ['Stop-loss kullanılmayan işlemler: %{pct}.', 'Stop-loss kullanmadığım işlemler sonuçlarımı nasıl etkiliyor?'],
    holding_losers: ['Kaybeden işlemleri kazananlardan daha uzun tutuyorsun ({losers} dk / {winners} dk).', 'Kaybeden işlemleri neden uzun tutuyorum, ne yapmalıyım?'],
    weak_strategy: ['{name} stratejisi zararda ({net}, {trades} işlem).', '{name} stratejimi analiz et: bırakmalı mıyım, nasıl geliştiririm?'],
    weak_weekday: ['{day} günleri kazanma oranın %{win_rate} ({trades} işlem).', '{day} günleri neden kötü gidiyor?'],
    weak_session: ['{session} seansında zarardasın ({net}, {trades} işlem).', '{session} seansında neden zarar ediyorum?'],
    weak_symbol: ['{symbol} işlemlerinde zarardasın ({net}, {trades} işlem).', '{symbol} işlemlerimi analiz et.'],
    best_strategy: ['En iyi stratejin {name} ({net}, {trades} işlem).', '{name} stratejimden daha fazla nasıl yararlanırım?'],
    general: ['{trades} kapanmış işlemin var, kazanma oranın %{win_rate}.', 'Genel performansımı analiz et.'],
    no_trades: ['Henüz kapanmış işlemin yok. İşlem ekledikçe sana özel analiz yaparım.', 'Trading günlüğümü nasıl kullanmalıyım? Nereden başlamalıyım?']
  };
  function renderEmpty() {
    var wrap = el('div', 'wwai-start'), jid = currentJournal(), k = jid || '*';
    if (S.open) loadSnapshot(jid);                         // only when the member opens the panel, not on every page view
    var c = S.snap[k], snap = c && c.data;
    var head = el('div', 'wwai-start-head');
    head.appendChild(el('span', 'wwai-start-icon', ICON.spark));
    head.appendChild(el('p', 'wwai-start-text', esc(_t('aiCoach.intro_short', 'Defterindeki verilere göre analiz yaparım. Bir grafik görüntüsü de gönderebilirsin.'))));
    wrap.appendChild(head);
    // numbers
    var card = el('div', 'wwai-snap' + (snap ? '' : ' is-loading'));
    if (snap) {
      var m = snap.month, o = snap.overall;
      function cell(label, value, cls, sub) { var d = el('div', 'wwai-snap-cell'); d.appendChild(el('span', 'wwai-snap-label', esc(label))); d.appendChild(el('span', 'wwai-snap-value' + (cls ? ' ' + cls : ''), esc(value))); if (sub) d.appendChild(el('span', 'wwai-snap-sub', esc(sub))); return d; }
      card.appendChild(cell(_t('aiCoach.snap.month', 'Bu ay'), m.trades ? money(m.net, true) : '—', m.trades ? (m.net > 0 ? 'is-pos' : m.net < 0 ? 'is-neg' : '') : '', _t('aiCoach.viz.trades_n', '{n} işlem', { n: m.trades })));
      card.appendChild(cell(_t('aiCoach.viz.kpi.win_rate', 'Kazanma oranı'), o.win_rate == null ? '—' : fmt(o.win_rate, 'pct'), '', _t('aiCoach.snap.all_time', 'tüm zamanlar')));
      card.appendChild(cell(_t('aiCoach.viz.kpi.net', 'Net sonuç'), o.trades ? money(o.net, true) : '—', o.net > 0 ? 'is-pos' : o.net < 0 ? 'is-neg' : '', _t('aiCoach.viz.trades_n', '{n} işlem', { n: o.trades })));
    } else if (c && !c.loading) card.hidden = true;
    else for (var i = 0; i < 3; i++) card.appendChild(el('div', 'wwai-snap-cell wwai-skel'));
    wrap.appendChild(card);
    // personal findings
    if (snap && snap.insights && snap.insights.length) {
      wrap.appendChild(el('p', 'wwai-start-label', esc(_t('aiCoach.for_you', 'Senin için'))));
      var list = el('div', 'wwai-insights');
      snap.insights.forEach(function (ins) {
        var t = insightText(ins), b = el('button', 'wwai-insight wwai-insight-' + ins.id); b.type = 'button';
        b.setAttribute('data-act', 'prompt'); b.setAttribute('data-text', t.question);
        b.appendChild(el('span', 'wwai-insight-text', esc(t.text)));
        b.appendChild(el('span', 'wwai-insight-ask', esc(_t('aiCoach.ask', 'Sor') + ' →')));
        list.appendChild(b);
      });
      wrap.appendChild(list);
    }
    // quick analyses
    wrap.appendChild(el('p', 'wwai-start-label', esc(_t('aiCoach.quick', 'Hızlı analiz'))));
    var chips = el('div', 'wwai-chips');
    PROMPTS.forEach(function (p) {
      var b = el('button', 'wwai-chip', ICON[p[4]] + '<span></span>'); b.type = 'button'; b.setAttribute('data-act', 'prompt');
      b.setAttribute('data-text', _t(p[0], p[1])); b.title = _t(p[0], p[1]); b.querySelector('span').textContent = _t(p[2], p[3]); chips.appendChild(b);
    });
    var ib = el('button', 'wwai-chip', ICON.image + '<span></span>'); ib.type = 'button'; ib.setAttribute('data-act', 'prompt-image');
    ib.querySelector('span').textContent = _t('aiCoach.chip.chart', 'Grafik yorumla'); chips.appendChild(ib);
    wrap.appendChild(chips);
    return wrap;
  }

  // ---------------------------------------------------------------- usage
  function loadUsage() {
    if (!global.sb || !global.sb.rpc) return;
    global.sb.rpc('get_ai_usage').then(function (r) { if (r && !r.error && r.data) { S.usage = r.data; renderUsage(); } }, function () { /* hidden */ });
  }
  function renderUsage() {
    if (!R.usage) return;
    var u = S.usage;
    if (!u || !(u.limit > 0)) { R.usage.hidden = true; return; }
    R.usage.hidden = false;
    var left = Math.max(0, u.limit - u.used);
    R.usage.textContent = _t('aiCoach.usage', '{left} kaldı', { left: left, limit: u.limit });
    R.usage.title = _t('aiCoach.usage_title', 'Bugün kalan mesaj hakkı: {left} / {limit}', { left: left, limit: u.limit });
    R.usage.classList.toggle('is-low', left <= 1);
  }

  // ---------------------------------------------------------------- history
  function showHistory() {
    S.view = 'history'; R.msgs.hidden = true; R.history.hidden = false;
    R.panel.querySelector('.wwai-foot').hidden = true; R.panel.querySelector('.wwai-back').hidden = false; texts();
    R.history.innerHTML = '<p class="wwai-muted">' + esc(_t('aiCoach.loading', 'Yükleniyor…')) + '</p>';
    if (!global.sb) return;
    global.sb.from('ai_conversations').select('id,title,updated_at').order('updated_at', { ascending: false }).limit(50).then(function (r) {
      if (S.view !== 'history') return;
      var rows = (r && !r.error && r.data) || [];
      if (r && r.error) { R.history.innerHTML = '<p class="wwai-muted">' + esc(_t('aiCoach.err.generic', 'AI şu an cevap veremedi. Birazdan tekrar dene.')) + '</p>'; return; }
      if (!rows.length) { R.history.innerHTML = '<p class="wwai-muted">' + esc(_t('aiCoach.history_empty', 'Henüz sohbet yok.')) + '</p>'; return; }
      R.history.innerHTML = '';
      rows.forEach(function (c) {
        var row = el('div', 'wwai-conv' + (c.id === S.conversationId ? ' is-active' : ''));
        row.setAttribute('data-act', 'open-conv'); row.setAttribute('data-id', c.id); row.setAttribute('role', 'button'); row.tabIndex = 0;
        var t = el('div', 'wwai-conv-text');
        t.appendChild(el('span', 'wwai-conv-title', esc(c.title)));
        var d = new Date(c.updated_at); t.appendChild(el('span', 'wwai-conv-date', esc(isNaN(d) ? '' : d.toLocaleString(lang(), { dateStyle: 'medium', timeStyle: 'short' }))));
        row.appendChild(t);
        var del = el('button', 'wwai-icon wwai-conv-del', ICON.trash); del.type = 'button'; del.setAttribute('data-act', 'del-conv'); del.setAttribute('data-id', c.id);
        del.title = _t('aiCoach.delete', 'Sohbeti sil'); del.setAttribute('aria-label', del.title);
        row.appendChild(del);
        row.addEventListener('keydown', function (e) { if (e.key === 'Enter') openConversation(c.id); });
        R.history.appendChild(row);
      });
    });
  }
  function openConversation(id) {
    if (!id || !global.sb) return;
    S.conversationId = id; S.messages = []; S.convJournal = undefined; save({ open: S.open, conversationId: id });
    showChat();
    global.sb.from('ai_conversations').select('journal_id').eq('id', id).maybeSingle().then(function (r) {
      if (S.conversationId === id && r && !r.error && r.data) { S.convJournal = r.data.journal_id || null; renderJournal(); }
    }, function () { /* the selector just stays as it is */ });
    R.msgs.innerHTML = '<p class="wwai-muted">' + esc(_t('aiCoach.loading', 'Yükleniyor…')) + '</p>';
    global.sb.from('ai_messages').select('role,content,had_image,visuals,created_at').eq('conversation_id', id).order('created_at', { ascending: true }).limit(200).then(function (r) {
      if (S.conversationId !== id) return;
      var rows = (r && !r.error && r.data) || [];
      if (!rows.length) { S.conversationId = null; save({ open: S.open, conversationId: null }); }
      S.messages = rows.map(function (m) { return { role: m.role, content: m.content, hadImage: !!m.had_image, visuals: m.visuals || null }; });
      renderMessages();
    });
  }
  function deleteConversation(id) {
    if (!global.sb || !global.confirm(_t('aiCoach.delete_confirm', 'Bu sohbet silinsin mi?'))) return;
    global.sb.from('ai_conversations').delete().eq('id', id).then(function (r) {
      if (r && r.error) { toast(_t('aiCoach.err.generic', 'AI şu an cevap veremedi. Birazdan tekrar dene.'), 'error'); return; }
      if (S.conversationId === id) { S.conversationId = null; S.messages = []; save({ open: S.open, conversationId: null }); }
      showHistory();
    });
  }

  // ---------------------------------------------------------------- start: only for a signed-in member
  function start(tries) {
    if (!global.sb || !global.sb.auth) { if (tries < 40) setTimeout(function () { start(tries + 1); }, 250); return; }
    session().then(function (s) { if (s) mount(); });
    try {
      global.sb.auth.onAuthStateChange(function (ev, s) {
        if (s && !S.mounted) mount();
        if (!s && S.mounted) { setOpen(false); R.fab.remove(); R.panel.remove(); S.mounted = false; S.messages = []; S.conversationId = null; save({}); }
      });
    } catch (e) { /* ignore */ }
  }

  global.WwAiCoach = { open: function () { if (S.mounted) setOpen(true); }, close: function () { if (S.mounted) setOpen(false); }, _md: md };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { start(0); }); else start(0);
})(typeof window !== 'undefined' ? window : globalThis);
