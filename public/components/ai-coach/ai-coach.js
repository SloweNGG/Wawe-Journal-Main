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
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>'
  };
  var PROMPTS = [
    ['aiCoach.prompt.strategies', 'Stratejilerimi karşılaştır. Hangisini geliştirmeli, hangisini bırakmalıyım?'],
    ['aiCoach.prompt.month', 'Bu ayki performansımı analiz et ve önceki aylarla karşılaştır.'],
    ['aiCoach.prompt.mistakes', 'En sık yaptığım hataları bul ve nasıl düzeltebileceğimi söyle.'],
    ['aiCoach.prompt.psychology', 'İşlemlerimde psikolojik zayıf noktalar görüyor musun? (intikam işlemi, aşırı işlem, stop kullanmama)']
  ];

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
  var S = { open: false, view: 'chat', conversationId: null, messages: [], pending: false, image: null, usage: null, mounted: false };
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
        '<div class="wwai-title"><span class="wwai-title-icon">' + ICON.spark + '</span><span class="wwai-title-text"></span></div>' +
        '<span class="wwai-usage" hidden></span>' +
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
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.open && document.activeElement && R.panel.contains(document.activeElement)) setOpen(false); });
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
    R.fab.setAttribute('aria-label', _t('aiCoach.open', 'AI Koç'));
    R.fab.title = _t('aiCoach.open', 'AI Koç');
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
    if (S.view === 'chat' && !S.messages.length) renderMessages();
  }

  function setOpen(on) {
    S.open = !!on;
    R.panel.hidden = !S.open;
    R.fab.classList.toggle('is-open', S.open);
    R.fab.setAttribute('aria-expanded', S.open ? 'true' : 'false');
    save({ open: S.open, conversationId: S.conversationId });
    if (S.open) {
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
    else if (act === 'open-conv') openConversation(b.getAttribute('data-id'));
    else if (act === 'del-conv') { e.stopPropagation(); deleteConversation(b.getAttribute('data-id')); }
    else if (act === 'upgrade') { if (typeof global.openUpgradeModal === 'function') global.openUpgradeModal({ feature: 'aiCoach' }); else global.location.href = '/settings'; }
  }

  // ---------------------------------------------------------------- chat
  function newChat() {
    S.conversationId = null; S.messages = []; clearImage();
    save({ open: S.open, conversationId: null });
    showChat();
    R.input.focus();
  }
  function showChat() { S.view = 'chat'; R.history.hidden = true; R.msgs.hidden = false; R.panel.querySelector('.wwai-foot').hidden = false; R.panel.querySelector('.wwai-back').hidden = true; texts(); renderMessages(); }

  function renderMessages() {
    var box = R.msgs; box.innerHTML = '';
    if (!S.messages.length) {
      var intro = el('div', 'wwai-empty');
      intro.appendChild(el('div', 'wwai-empty-icon', ICON.spark));
      intro.appendChild(el('p', 'wwai-empty-title', esc(_t('aiCoach.intro_title', 'Merhaba! Ben işlem koçun.'))));
      intro.appendChild(el('p', 'wwai-empty-text', esc(_t('aiCoach.intro_text', 'Defterindeki işlemlere ve stratejilere bakarak sorularını yanıtlarım. Bir grafik görüntüsü de gönderebilirsin.'))));
      var chips = el('div', 'wwai-chips');
      PROMPTS.forEach(function (p) {
        var b = el('button', 'wwai-chip'); b.type = 'button'; b.setAttribute('data-act', 'prompt');
        var txt = _t(p[0], p[1]); b.setAttribute('data-text', txt); b.textContent = txt; chips.appendChild(b);
      });
      var ib = el('button', 'wwai-chip wwai-chip-img', ICON.image + '<span></span>'); ib.type = 'button'; ib.setAttribute('data-act', 'prompt-image');
      ib.querySelector('span').textContent = _t('aiCoach.prompt.chart', 'Grafik yükle ve yorumlat'); chips.appendChild(ib);
      intro.appendChild(chips);
      box.appendChild(intro);
      return;
    }
    S.messages.forEach(function (m) { box.appendChild(bubble(m)); });
    if (S.pending) box.appendChild(el('div', 'wwai-msg wwai-model wwai-typing', '<span></span><span></span><span></span>'));
    box.scrollTop = box.scrollHeight;
  }
  function bubble(m) {
    var b = el('div', 'wwai-msg ' + (m.role === 'user' ? 'wwai-user' : 'wwai-model') + (m.error ? ' wwai-error' : ''));
    if (m.imageUrl) { var im = el('img', 'wwai-msg-img'); im.src = m.imageUrl; im.alt = ''; b.appendChild(im); }
    else if (m.hadImage) b.appendChild(el('span', 'wwai-msg-imgnote', esc(_t('aiCoach.image_sent', 'Görsel gönderildi'))));
    var body = el('div', 'wwai-msg-text');
    if (m.role === 'user' || m.error) body.textContent = m.content; else body.innerHTML = md(m.content);
    b.appendChild(body);
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
    session().then(function (s) {
      if (!s) throw Object.assign(new Error('session'), { code: 'UNAUTHORIZED' });
      var body = { message: text, lang: lang(), tz: tz() };
      if (S.conversationId) body.conversationId = S.conversationId;
      else { try { var jid = global.journal && global.journal.getActiveJournalId && global.journal.getActiveJournalId(); if (jid) body.journalId = jid; } catch (e) { /* all journals */ } }
      if (img) body.image = { mimeType: img.mimeType, data: img.data };
      return fetch(endpoint() + '/functions/v1/ai-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.access_token, 'apikey': anonKey() },
        body: JSON.stringify(body)
      }).then(function (res) {
        return res.json().then(function (j) { return { res: res, j: j }; }, function () { return { res: res, j: null }; });
      }, function () { throw Object.assign(new Error('network'), { code: 'NETWORK' }); });
    }).then(function (r) {
      var j = r.j || {};
      if (j.usage) { S.usage = j.usage; renderUsage(); }
      if (!r.res.ok || !j.ok) {
        var code = j.code || (r.res.status === 401 ? 'UNAUTHORIZED' : 'UPSTREAM');
        S.messages.push({ role: 'model', content: errorText(code, j), error: true, upgrade: code === 'LIMIT' && j.usage && !j.usage.premium });
        return;
      }
      if (j.conversationId) { S.conversationId = j.conversationId; save({ open: S.open, conversationId: S.conversationId }); }
      S.messages.push({ role: 'model', content: j.reply });
    }).catch(function (e) {
      S.messages.push({ role: 'model', content: errorText((e && e.code) || 'UPSTREAM'), error: true });
    }).then(function () {
      S.pending = false; R.send.disabled = false;
      if (S.view === 'chat') renderMessages();
    });
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
    R.usage.textContent = _t('aiCoach.usage', '{left}/{limit}', { left: left, limit: u.limit });
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
    S.conversationId = id; S.messages = []; save({ open: S.open, conversationId: id });
    showChat();
    R.msgs.innerHTML = '<p class="wwai-muted">' + esc(_t('aiCoach.loading', 'Yükleniyor…')) + '</p>';
    global.sb.from('ai_messages').select('role,content,had_image,created_at').eq('conversation_id', id).order('created_at', { ascending: true }).limit(200).then(function (r) {
      if (S.conversationId !== id) return;
      var rows = (r && !r.error && r.data) || [];
      if (!rows.length) { S.conversationId = null; save({ open: S.open, conversationId: null }); }
      S.messages = rows.map(function (m) { return { role: m.role, content: m.content, hadImage: !!m.had_image }; });
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
