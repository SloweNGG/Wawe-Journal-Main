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
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M19 3v4M17 5h4M5 17v4M3 19h4"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
    brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24A2.5 2.5 0 0 0 14.5 2Z"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    gauge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>'
  };
  // [question key, question fallback, short label key, short label fallback, icon]
  var PROMPTS = [
    ['aiCoach.prompt.strategies', 'Stratejilerimi karşılaştır. Hangisini geliştirmeli, hangisini bırakmalıyım?', 'aiCoach.chip.strategies', 'Strateji karşılaştır', 'layers'],
    ['aiCoach.prompt.month', 'Bu ayki performansımı analiz et ve önceki aylarla karşılaştır.', 'aiCoach.chip.month', 'Aylık rapor', 'calendar'],
    ['aiCoach.prompt.mistakes', 'En sık yaptığım hataları bul ve nasıl düzeltebileceğimi söyle.', 'aiCoach.chip.mistakes', 'Hatalarım', 'alert'],
    ['aiCoach.prompt.psychology', 'İşlemlerimde psikolojik zayıf noktalar görüyor musun? (intikam işlemi, aşırı işlem, stop kullanmama)', 'aiCoach.chip.psychology', 'Psikoloji', 'brain']
  ];
  // The coach the member picks by what they struggle with most (supabase/functions/_shared/coach-personas.ts: focus and tone
  // of the answers). Names are the same in every language. Kai = general, the default. chip: [label, question] of its quick prompt.
  var COACHES = [
    { id: 'mira', name: 'Mira', icon: 'brain', tone: 'soft', problem: 'Psikoloji', desc: 'Korku, FOMO, intikam işlemi, tilt',
      intro: 'Merhaba, ben Mira. İşlemlerinin arkasındaki duygulara bakarım: korku, FOMO, kayıptan sonra intikam işlemi.',
      chip: ['Duygularım', 'Hangi duygular bana para kaybettiriyor? Kayıplardan sonra nasıl davranıyorum?'] },
    { id: 'rex', name: 'Rex', icon: 'gauge', tone: 'strict', problem: 'Açgözlülük ve overtrade', desc: 'Fazla işlem, "bir tane daha", kârlı günü geri verme',
      intro: 'Ben Rex. Fazla işleme ve açgözlülüğe odaklanırım: günün kaçıncı işleminden sonra kaybetmeye başladığını bulur, seni orada durdururum.',
      chip: ['Fazla işlem', 'Günün kaçıncı işleminden sonra sonuçlarım bozuluyor? Bana bir günlük işlem sınırı koy.'] },
    { id: 'atlas', name: 'Atlas', icon: 'shield', tone: 'strict', problem: 'Disiplinsizlik', desc: 'Plana uymama, stopsuz işlem, kural çiğneme',
      intro: 'Ben Atlas. Kendi kurallarına uyup uymadığına bakarım: plan, stop, işlem saatleri. Kural çiğnemenin sana kaça mal olduğunu gösteririm.',
      chip: ['Planıma uyuyor muyum?', 'Planıma ve kurallarıma ne kadar uyuyorum? Kuralları çiğnemek bana kaça mal oluyor?'] },
    { id: 'nova', name: 'Nova', icon: 'target', tone: 'balanced', problem: 'Risk yönetimi', desc: 'Lot tutarsızlığı, stop kaydırma, büyük düşüşler',
      intro: 'Ben Nova. Riskine bakarım: lot büyüklüğü, stop, düşüşler ve prop limitleri. Rakamlarla konuşurum.',
      chip: ['Riskim', 'Riskimi analiz et: işlem başına ne kadar risk almalıyım, lotum tutarlı mı?'] },
    { id: 'kai', name: 'Kai', icon: 'spark', tone: 'balanced', problem: 'Emin değilim / genel', desc: 'Her konuda dengeli analiz',
      intro: 'Merhaba, ben Kai. Defterindeki verilere göre analiz yaparım; bir grafik görüntüsü de gönderebilirsin.', chip: null }
  ];
  var TONES = [['soft', 'Yumuşak', 'Cesaretlendirir, önce iyi gideni söyler.'], ['balanced', 'Dengeli', 'Doğrudan ama dostça.'], ['strict', 'Sert', 'Lafı dolandırmaz, net kurallar koyar.']];
  var WIDE_KEY = 'ww_ai_coach_wide', DETAIL_KEY = 'ww_ai_coach_detail', JOURNAL_KEY = 'ww_ai_coach_journal', DESKTOP_KEY = 'ww_ai_coach_desktop';
  var ASKED_KEY = 'ww_ai_coach_asked';              // the picker opened by itself once in this browser
  var COACH_KEY = 'ww_ai_coach_persona';            // the last choice in this browser (names before the settings load); the truth is coach_settings.plan.coach
  function pref(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function setPref(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function detail() { var v = pref(DETAIL_KEY, 'normal'); return v === 'short' || v === 'detailed' ? v : 'normal'; }
  function coachDef(id) { for (var i = 0; i < COACHES.length; i++) if (COACHES[i].id === id) return COACHES[i]; return COACHES[COACHES.length - 1]; }
  function storedCoach() {
    var c = S.prefs && S.prefs.plan && S.prefs.plan.coach;
    if (!c) { try { c = JSON.parse(pref(COACH_KEY, 'null')); } catch (e) { c = null; } }
    return c && typeof c === 'object' ? c : null;
  }
  // -> { id, tone, def }; nothing chosen yet: Kai
  function coach() {
    var c = storedCoach(), d = coachDef(c && c.id);
    var t = c && c.id === d.id && TONES.some(function (x) { return x[0] === c.tone; }) ? c.tone : d.tone;
    return { id: d.id, tone: t, def: d };
  }
  function coachName() { return coach().def.name; }
  function coachText(d, part) { return _t('aiCoach.coach.' + d.id + '.' + part, d[part]); }
  // the coach's avatar: a glossy orb with blinking eyes in its colour (CSS .wwc-av in ai-coach.css); px = diameter
  function coachAv(d, px) {
    return '<span class="wwc-av wwc-av-' + d.id + '" style="--av:' + (px || 48) + 'px" aria-hidden="true"><span class="wwc-av-eyes"><i></i><i></i></span></span>';
  }

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
        '<div class="wwai-title-wrap"><div class="wwai-title"><span class="wwai-title-icon">' + ICON.spark + '</span><span class="wwai-title-text"></span><span class="wwai-title-sub"></span></div>' +
          '<label class="wwai-journal" hidden><span class="wwai-journal-label"></span><select class="wwai-journal-sel"></select></label></div>' +
        '<button type="button" class="wwai-icon" data-act="history">' + ICON.list + '</button>' +
        '<button type="button" class="wwai-icon wwai-gear" data-act="settings">' + ICON.gear + '</button>' +
        '<button type="button" class="wwai-icon" data-act="new">' + ICON.plus + '</button>' +
        '<button type="button" class="wwai-icon" data-act="close">' + ICON.close + '</button>' +
      '</header>' +
      '<div class="wwai-body"><div class="wwai-msgs" aria-live="polite"></div><div class="wwai-history" hidden></div><div class="wwai-settings" hidden></div><div class="wwai-coach" hidden></div></div>' +
      '<footer class="wwai-foot">' +
        '<div class="wwai-attach" hidden><img alt=""><span class="wwai-attach-name"></span><button type="button" class="wwai-icon" data-act="unattach">' + ICON.close + '</button></div>' +
        '<div class="wwai-orb" hidden aria-hidden="true"><div class="wwai-orb-gl"></div><span class="wwai-orb-face"></span></div>' +   // while dictating
        '<div class="wwai-compose">' +                                   // one box: text on top, tools left + send right below
          '<textarea class="wwai-input" rows="1" maxlength="' + MAX_MESSAGE + '"></textarea>' +
          '<div class="wwai-compose-bar">' +
            '<button type="button" class="wwai-icon wwai-img-btn" data-act="pick">' + ICON.image + '</button>' +
            '<button type="button" class="wwai-icon wwai-mic" data-act="mic" aria-pressed="false" hidden>' + ICON.mic + '</button>' +
            '<button type="button" class="wwai-send" data-act="send">' + ICON.send + '</button>' +
          '</div>' +
        '</div>' +
        '<input type="file" class="wwai-file" accept="image/png,image/jpeg,image/webp" hidden>' +
      '</footer>' +
      '<div class="wwai-drop" hidden></div>';
    document.body.appendChild(fab);
    document.body.appendChild(panel);
    R.panel = panel; R.msgs = panel.querySelector('.wwai-msgs'); R.history = panel.querySelector('.wwai-history');
    R.input = panel.querySelector('.wwai-input'); R.file = panel.querySelector('.wwai-file'); R.attach = panel.querySelector('.wwai-attach');
    R.settings = panel.querySelector('.wwai-settings'); R.coach = panel.querySelector('.wwai-coach'); R.gear = panel.querySelector('.wwai-gear'); R.send = panel.querySelector('.wwai-send'); R.drop = panel.querySelector('.wwai-drop');
    R.journal = panel.querySelector('.wwai-journal'); R.journalSel = panel.querySelector('.wwai-journal-sel');
    R.orb = panel.querySelector('.wwai-orb');
    R.mic = panel.querySelector('.wwai-mic'); R.mic.hidden = !speechApi();          // no Web Speech API (Firefox): no button
    R.journalSel.addEventListener('change', function () { S.journalId = R.journalSel.value; renderJournal(); if (!S.messages.length && S.view === 'chat') renderMessages(); });
    try { if (localStorage.getItem(WIDE_KEY) === '1') panel.classList.add('is-wide'); } catch (e) { /* ignore */ }
    var dj = pref(JOURNAL_KEY, 'active'); if (dj !== 'active') S.journalId = dj;        // default journal for new chats (settings)
    R.settings.addEventListener('change', function (e) {
      if (e.target.getAttribute('data-pref') !== 'journal') return;
      var v = e.target.value; setPref(JOURNAL_KEY, v); S.journalId = v === 'active' ? undefined : v;
    });

    fab.addEventListener('click', function () { setOpen(!S.open); });
    panel.addEventListener('click', onClick);
    R.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
      if (e.key === 'Escape') setOpen(false);
    });
    R.input.addEventListener('input', function () { if (D.on) stopDictation(true); autosize(); });
    panel.querySelector('.wwai-compose').addEventListener('mousedown', function (e) {   // a click on the box's empty space types
      if (e.target === e.currentTarget || e.target.classList.contains('wwai-compose-bar')) { e.preventDefault(); R.input.focus(); }
    });
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
    global.addEventListener('ww:coach-alert', function (e) { if (e && e.detail) showAlert(e.detail); });
    global.addEventListener('trade-saved', onTradeSaved);
    texts();
    var st = load();
    if (st.conversationId) S.conversationId = st.conversationId;
    if (st.open) setOpen(true);
  }
  function hasFile(e) { var t = e.dataTransfer && e.dataTransfer.types; return !!t && Array.prototype.indexOf.call(t, 'Files') >= 0; }
  function autosize() { R.input.style.height = 'auto'; R.input.style.height = Math.min(R.input.scrollHeight, 140) + 'px'; }

  function isMac() { return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || ''); }
  function texts() {
    if (!R.panel) return;
    var mac = isMac();
    var cur = coach(), open = _t('aiCoach.open', '{coach} · AI Koç', { coach: cur.def.name });
    R.fab.setAttribute('aria-label', open);
    R.fab.title = open + ' (' + (mac ? '⌘' : 'Ctrl+') + 'K)';
    R.fab.setAttribute('aria-keyshortcuts', 'Control+K Meta+K');
    R.panel.querySelector('.wwai-journal-label').textContent = _t('aiCoach.journal', 'Defter') + ':';
    R.panel.setAttribute('aria-label', open);
    R.panel.querySelector('.wwai-title-text').textContent = S.view === 'history' ? _t('aiCoach.history', 'Geçmiş sohbetler')
      : S.view === 'settings' ? _t('aiCoach.settings', 'Ayarlar') : S.view === 'coach' ? _t('aiCoach.coach.title', 'Koçunu seç') : cur.def.name;
    R.panel.querySelector('.wwai-title-icon').innerHTML = coachAv(cur.def, 24);
    COACHES.forEach(function (d) { R.panel.classList.toggle('wwai-c-' + d.id, d.id === cur.id); });
    var sub = R.panel.querySelector('.wwai-title-sub');                    // "AI Koç" next to the name, only on the chat view
    sub.textContent = _t('aiCoach.title', 'AI Koç'); sub.hidden = S.view !== 'chat';
    [['history', 'aiCoach.history', 'Geçmiş sohbetler'], ['settings', 'aiCoach.settings', 'Ayarlar'], ['new', 'aiCoach.new', 'Yeni sohbet'], ['close', 'aiCoach.close', 'Kapat'], ['back', 'aiCoach.back', 'Geri'],
      ['pick', 'aiCoach.attach', 'Grafik görüntüsü ekle'], ['send', 'aiCoach.send', 'Gönder'], ['unattach', 'aiCoach.remove_image', 'Görseli kaldır']].forEach(function (x) {
      var b = R.panel.querySelector('[data-act="' + x[0] + '"]'); if (b) { var s = _t(x[1], x[2]); b.title = s; b.setAttribute('aria-label', s); }
    });
    R.input.placeholder = _t('aiCoach.placeholder', 'Bir soru sor ya da grafik ekle…');
    autosize();
    R.drop.textContent = _t('aiCoach.drop', 'Görseli buraya bırak');
    renderUsage();
    renderJournal();
    renderMic();
    if (S.view === 'chat' && !S.messages.length) renderMessages();
  }

  function setOpen(on) {
    S.open = !!on;
    if (!S.open) stopDictation(true);
    R.panel.hidden = !S.open;
    R.fab.classList.toggle('is-open', S.open);
    R.fab.setAttribute('aria-expanded', S.open ? 'true' : 'false');
    save({ open: S.open, conversationId: S.conversationId });
    if (S.open) {
      loadJournals();
      if (S.conversationId && !S.messages.length) openConversation(S.conversationId);
      else renderMessages();
      loadUsage();
      loadPrefs();
      setTimeout(function () { R.input.focus(); }, 30);
    }
  }

  function onClick(e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'close') setOpen(false);
    else if (act === 'new') newChat();
    else if (act === 'history') showHistory();
    else if (act === 'detail') {
      setPref(DETAIL_KEY, b.getAttribute('data-v')); renderSettings();
      var sel = R.settings.querySelector('[data-act="detail"][aria-checked="true"]'); if (sel) sel.focus();
    }
    else if (act === 'coach-open') showCoach();
    else if (act === 'coach-pick') setCoach(b.getAttribute('data-id'));
    else if (act === 'coach-tone') { setCoach(coach().id, b.getAttribute('data-v')); var ts = R.panel.querySelector('[data-act="coach-tone"][aria-checked="true"]'); if (ts) ts.focus(); }
    else if (act === 'coach-done') showChat();
    else if (act === 'delete-all') deleteAll();
    else if (act === 'alerts') setAlerts(b.getAttribute('aria-checked') !== 'true');
    else if (act === 'plan-stop') { b.setAttribute('aria-checked', b.getAttribute('aria-checked') === 'true' ? 'false' : 'true'); }
    else if (act === 'plan-save') savePlan();
    else if (act === 'goal-take') setGoal({ kind: b.getAttribute('data-kind'), target: Number(b.getAttribute('data-target')) });
    else if (act === 'goal-drop') setGoal(null);
    else if (act === 'commit-take') setCommit({ kind: b.getAttribute('data-kind'), target: Number(b.getAttribute('data-target')), day: b.getAttribute('data-day') });
    else if (act === 'commit-drop') setCommit(null);
    else if (act === 'action-apply') applyAction(b);
    else if (act === 'desktop') setDesktop(b.getAttribute('aria-checked') !== 'true');
    else if (act === 'settings') { if (S.view === 'settings') showChat(); else showSettings(); }
    else if (act === 'back') showChat();
    else if (act === 'pick') R.file.click();
    else if (act === 'unattach') clearImage();
    else if (act === 'send') send();
    else if (act === 'mic') { if (D.on) stopDictation(); else startDictation(); }
    else if (act === 'prompt') { R.input.value = b.getAttribute('data-text'); send(); }
    else if (act === 'prompt-image') R.file.click();
    else if (act === 'wide') {
      var on = !R.panel.classList.contains('is-wide'); R.panel.classList.toggle('is-wide', on);
      try { localStorage.setItem(WIDE_KEY, on ? '1' : '0'); } catch (e2) { /* ignore */ }
      texts();
      if (S.view === 'settings') { var sw = R.settings.querySelector('.wwai-switch'); if (sw) sw.focus(); }
    }
    else if (act === 'open-conv') openConversation(b.getAttribute('data-id'));
    else if (act === 'del-conv') { e.stopPropagation(); deleteConversation(b.getAttribute('data-id')); }
    else if (act === 'upgrade') { if (typeof global.openUpgradeModal === 'function') global.openUpgradeModal({ feature: 'aiCoach' }); else global.location.href = '/settings'; }
  }

  // ---------------------------------------------------------------- dictation (Web Speech API in the browser; no quota)
  // Chrome / Edge / Samsung send the audio to Google's speech service, Safari to Apple's (or on-device); Firefox has no API,
  // so the button stays hidden there. Spoken text lands in the box for the member to check and send; nothing is sent by itself.
  var DICT_LANG = { tr: 'tr-TR', en: 'en-US', de: 'de-DE' };
  var D = { rec: null, on: false, base: '', final: '' };
  function speechApi() { return global.SpeechRecognition || global.webkitSpeechRecognition || null; }
  // the text typed before dictation + what was said, one space between them
  function joinDictation(base, said) {
    said = String(said || '').replace(/\s+/g, ' ').trim();
    base = String(base || '');
    if (!said) return base;
    return base + (base && !/\s$/.test(base) ? ' ' : '') + said;
  }
  function startDictation() {
    var Api = speechApi(); if (!Api || D.on) return;
    var rec;
    try { rec = new Api(); } catch (e) { toast(_t('aiCoach.dictate_failed', 'Dikte şu an çalışmıyor. Birazdan tekrar dene.'), 'error'); return; }
    rec.lang = DICT_LANG[lang()] || 'tr-TR';
    rec.interimResults = true; rec.maxAlternatives = 1;
    // Android Chrome repeats earlier text in continuous mode: one utterance at a time there (it stops after a pause)
    rec.continuous = !/Android/i.test(navigator.userAgent || '');
    D.rec = rec; D.on = true; D.base = R.input.value; D.final = '';
    rec.onresult = function (e) {
      if (D.rec !== rec) return;
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var t = e.results[i][0] ? e.results[i][0].transcript : '';
        if (e.results[i].isFinal) D.final = joinDictation(D.final, t); else interim += t;
      }
      R.input.value = joinDictation(D.base, joinDictation(D.final, interim)).slice(0, MAX_MESSAGE);
      autosize(); R.input.scrollTop = R.input.scrollHeight;
    };
    rec.onerror = function (e) {
      if (D.rec !== rec) return;
      var c = e && e.error;
      if (c === 'not-allowed' || c === 'service-not-allowed') toast(_t('aiCoach.dictate_denied', 'Mikrofon izni verilmedi. Tarayıcının site ayarlarından izin verebilirsin.'), 'error');
      else if (c === 'audio-capture') toast(_t('aiCoach.dictate_nomic', 'Mikrofon bulunamadı.'), 'error');
      else if (c === 'network') toast(_t('aiCoach.dictate_network', 'Dikte bu tarayıcıda çalışmıyor ya da internet bağlantısı yok.'), 'error');
      else if (c !== 'no-speech' && c !== 'aborted') toast(_t('aiCoach.dictate_failed', 'Dikte şu an çalışmıyor. Birazdan tekrar dene.'), 'error');
    };
    rec.onend = function () { if (D.rec === rec) { D.rec = null; D.on = false; renderMic(); } };
    try { rec.start(); } catch (e) { D.rec = null; D.on = false; }
    renderMic();
    R.input.focus();
  }
  // discard: stop at once and ignore results still on the way (send, typing, closing); otherwise the last words still arrive
  function stopDictation(discard) {
    var rec = D.rec; if (!rec) return;
    if (discard) { D.rec = null; D.on = false; try { rec.abort(); } catch (e) { /* ended */ } renderMic(); return; }
    try { rec.stop(); } catch (e) { D.rec = null; D.on = false; renderMic(); }
  }
  function renderMic() {
    if (!R.mic) return;
    R.mic.classList.toggle('is-on', D.on);
    R.mic.setAttribute('aria-pressed', D.on ? 'true' : 'false');
    var s = D.on ? _t('aiCoach.dictate_stop', 'Dikteyi durdur') : _t('aiCoach.dictate', 'Sesle yaz');
    R.mic.title = s; R.mic.setAttribute('aria-label', s);
    R.input.placeholder = D.on ? _t('aiCoach.listening', 'Dinliyorum… konuşabilirsin') : _t('aiCoach.placeholder', 'Bir soru sor ya da grafik ekle…');
    renderOrb();
  }
  // voice-orb.js (window.WwVoiceOrb), loaded once on first need: the dictation orb and the coach avatars.
  // cb(true) once it is there, cb(false) when it cannot load.
  var ORB_LIB = { state: '', waiting: [] };               // state: '' | 'loading' | 'ready' | 'off'
  function withOrbLib(cb) {
    if (ORB_LIB.state === 'ready' || ORB_LIB.state === 'off') return cb(ORB_LIB.state === 'ready');
    ORB_LIB.waiting.push(cb);
    if (ORB_LIB.state === 'loading') return;
    ORB_LIB.state = 'loading';
    var url = '/components/ai-coach/voice-orb.js?v=__WW_BUILD_ID__';
    function fin(ok) {
      ORB_LIB.state = ok && global.WwVoiceOrb ? 'ready' : 'off';
      var w = ORB_LIB.waiting; ORB_LIB.waiting = [];
      w.forEach(function (f) { f(ORB_LIB.state === 'ready'); });
    }
    if (global.WwVoiceOrb) return fin(true);
    if (global.WwLazy && global.WwLazy.loadScriptOnce) { global.WwLazy.loadScriptOnce(url, { test: function () { return !!global.WwVoiceOrb; } }).then(function () { fin(true); }, function () { fin(false); }); return; }
    var sc = document.createElement('script'); sc.src = url; sc.async = true;
    sc.onload = function () { fin(true); }; sc.onerror = function () { fin(false); }; document.head.appendChild(sc);
  }
  function orbHue(id) { return (global.WwVoiceOrb && global.WwVoiceOrb.HUES && global.WwVoiceOrb.HUES[id]) || 0; }

  // The dictation orb: a glow in the coach's colour that follows the member's voice, the coach's avatar in the middle. No WebGL: no orb, dictation as before.
  var O = { orb: null, state: '' };                       // state: '' | 'loading' | 'ready' | 'off'
  function renderOrb() {
    if (!R.orb) return;
    if (D.on && !O.state) {
      O.state = 'loading';
      withOrbLib(function (ok) {
        O.orb = ok ? global.WwVoiceOrb.create(R.orb.querySelector('.wwai-orb-gl')) : null;
        O.state = O.orb ? 'ready' : 'off';
        renderOrb();
      });
    }
    var show = D.on && O.state === 'ready';
    if (show) {
      var cd = coach().def;
      R.orb.querySelector('.wwai-orb-face').innerHTML = coachAv(cd, 52);
      O.orb.setHue(orbHue(cd.id));
      if (R.orb.hidden) { R.orb.hidden = false; O.orb.start(); }
    } else if (!R.orb.hidden) {
      R.orb.hidden = true;
      if (O.orb) O.orb.stop();                            // releases the microphone
    }
  }

  // the coach's avatar in the start screen and the coach picker (cls: wwai-ava-md | wwai-ava-lg)
  function avaHtml(d, cls) { return coachAv(d, cls === 'wwai-ava-lg' ? 64 : 48); }

  // ---------------------------------------------------------------- live alerts (_shared/coach-alerts.ts on the server)
  // The server writes alerts to public.notifications after a sync, or after action "alerts" (a manual trade, below); the
  // navbar's realtime listener passes each new one here (event ww:coach-alert): a toast, plus a desktop notification when
  // the member turned it on and the tab is in the background. S.prefs: the member's coach_settings row (null = not loaded,
  // {} = no row yet: alerts on).
  function loadPrefs() {
    if (!global.sb || S.prefsLoading) return;
    S.prefsLoading = true;
    session().then(function (s) {
      if (!s || !s.user) return null;
      return global.sb.from('coach_settings').select('alerts_enabled, time_zone, plan').eq('user_id', s.user.id).maybeSingle().then(function (r) {
        if (r && r.error) { S.prefs = S.prefs || {}; return; }          // table missing (before the migration): defaults
        S.prefs = (r && r.data) || {};
        var pc = S.prefs.plan && S.prefs.plan.coach;
        if (pc) setPref(COACH_KEY, JSON.stringify(pc)); else if (storedCoach()) syncCoach(storedCoach());   // chosen before the row existed
        // the alerts raised by the sync functions use this zone for "today"
        if (S.prefs.time_zone !== tz()) global.sb.from('coach_settings').upsert({ user_id: s.user.id, time_zone: tz() }, { onConflict: 'user_id' }).then(function () {}, function () {});
      });
    }).then(function () {
      S.prefsLoading = false; texts();
      if (S.view === 'settings') renderSettings();
      // first time: "what do you struggle with most?" before the first chat
      if (S.open && S.view === 'chat' && !S.messages.length && !S.conversationId && !storedCoach() && pref(ASKED_KEY, '0') !== '1') { setPref(ASKED_KEY, '1'); showCoach(); }
    }, function () { S.prefsLoading = false; });
  }
  // the coach choice: applied at once (this browser), then merged into coach_settings.plan (read first: never drops the rules)
  function setCoach(id, t) {
    var d = coachDef(id), cur = coach();
    var tone = TONES.some(function (x) { return x[0] === t; }) ? t : (d.id === cur.id ? cur.tone : d.tone);
    var c = { id: d.id, tone: tone };
    setPref(COACH_KEY, JSON.stringify(c));
    if (S.prefs) { S.prefs = Object.assign({}, S.prefs); S.prefs.plan = Object.assign({}, S.prefs.plan || {}, { coach: c }); }
    texts();
    if (S.view === 'coach') renderCoach(); else if (S.view === 'settings') renderSettings();
    syncCoach(c);
  }
  function syncCoach(c) {
    if (!global.sb) return;
    session().then(function (s) {
      if (!s || !s.user) return;
      return global.sb.from('coach_settings').select('plan').eq('user_id', s.user.id).maybeSingle().then(function (r) {
        if (r && r.error) return;                                     // no table: the choice stays in this browser
        var plan = Object.assign({}, (r && r.data && r.data.plan) || {}, { coach: c });
        return global.sb.from('coach_settings').upsert({ user_id: s.user.id, plan: plan, time_zone: tz() }, { onConflict: 'user_id' }).then(function (u) {
          if (u && !u.error && S.prefs) S.prefs = Object.assign({}, S.prefs, { plan: plan });
        });
      });
    }).catch(function () { /* kept in this browser */ });
  }
  function toneSeg(cur) {
    return '<div class="wwai-seg" role="radiogroup" aria-label="' + esc(_t('aiCoach.coach.tone', 'Üslup')) + '">' + TONES.map(function (o) {
      return '<button type="button" role="radio" data-act="coach-tone" data-v="' + o[0] + '" aria-checked="' + (cur === o[0] ? 'true' : 'false') + '">' + esc(_t('aiCoach.coach.tone_' + o[0], o[1])) + '</button>';
    }).join('') + '</div>';
  }
  function toneHint(cur) { var o = TONES.filter(function (x) { return x[0] === cur; })[0] || TONES[1]; return _t('aiCoach.coach.tone_' + o[0] + '_hint', o[2]); }
  function showCoach() { setView('coach'); texts(); renderCoach(); loadSnapshot(currentJournal()); }
  // "what do you struggle with most?": one card per problem, the data's suggestion on top, the tone below
  function renderCoach() {
    var cur = coach(), c = S.snap[currentJournal() || '*'], sg = c && c.data && c.data.coach_suggestion, h = '';
    h += '<p class="wwai-coach-q">' + esc(_t('aiCoach.coach.question', 'Seni en çok ne zorluyor?')) + '</p>';
    h += '<p class="wwai-coach-hint">' + esc(_t('aiCoach.coach.hint', 'Seçtiğin koç bu konuya odaklanır. İstediğin zaman ayarlardan değiştirebilirsin.')) + '</p>';
    if (sg && sg.insight && coachDef(sg.coach).id === sg.coach) {
      var sd = coachDef(sg.coach);
      h += '<div class="wwai-coach-sug wwai-c-' + sd.id + '">' + avaHtml(sd, 'wwai-ava-md') + '<div class="wwai-coach-text">' +
        '<span class="wwai-coach-sug-label">' + esc(_t('aiCoach.coach.suggest', 'Verilerine göre önerim')) + '</span>' +
        '<strong>' + esc(sd.name) + ' · ' + esc(coachText(sd, 'problem')) + '</strong><span>' + esc(insightText(sg.insight).text) + '</span></div>' +
        (sd.id !== cur.id ? '<button type="button" class="wwai-upgrade" data-act="coach-pick" data-id="' + sd.id + '">' + esc(_t('aiCoach.coach.take', 'Bunu seç')) + '</button>' : '') + '</div>';
    }
    h += '<div class="wwai-coach-list" role="radiogroup" aria-label="' + esc(_t('aiCoach.coach.question', 'Seni en çok ne zorluyor?')) + '">';
    COACHES.forEach(function (d) {
      h += '<button type="button" role="radio" class="wwai-coach-card wwai-c-' + d.id + '" data-act="coach-pick" data-id="' + d.id + '" aria-checked="' + (d.id === cur.id ? 'true' : 'false') + '">' +
        avaHtml(d, 'wwai-ava-md') + '<span class="wwai-coach-text"><strong>' + esc(coachText(d, 'problem')) + '</strong><span>' + esc(coachText(d, 'desc')) + '</span></span>' +
        '<span class="wwai-coach-name">' + esc(d.name) + '</span></button>';
    });
    h += '</div>';
    h += '<div class="wwai-group">' + row(_t('aiCoach.coach.tone', 'Üslup'), toneHint(cur.tone), toneSeg(cur.tone), 'is-stack') + '</div>';
    h += '<button type="button" class="wwai-upgrade wwai-coach-done" data-act="coach-done">' + esc(_t('aiCoach.coach.done', '{coach} ile başla', { coach: cur.def.name })) + '</button>';
    R.coach.innerHTML = h;
  }
  var RULE_TR = { max_trades_per_day: 'günlük işlem sınırı', max_daily_loss: 'günlük zarar sınırı', max_loss_per_trade: 'işlem başına zarar sınırı', require_stop: 'stop zorunluluğu', no_trading_after: 'işlem saati' };
  // the plan form; empty plan: suggested from the old overtrade settings of this browser (saved only on "save")
  function planEditor() {
    var p = (S.prefs && S.prefs.plan) || {}, sug = {};
    if (!Object.keys(p).filter(function (k) { return k !== 'goal' && k !== 'coach'; }).length) { try { var ot = JSON.parse(localStorage.getItem('ww_overtrade_settings') || 'null'); if (ot && ot.enabled !== false) sug = { max_trades_per_day: ot.dailyLimit, max_daily_loss: ot.dailyLossLimit }; } catch (e) { /* none */ } }
    function num(key, label, step) {
      var v = p[key] != null ? p[key] : (sug[key] != null ? sug[key] : '');
      return '<label class="wwai-plan-field"><span>' + esc(label) + '</span><input type="text" inputmode="' + (step === 1 ? 'numeric' : 'decimal') + '" autocomplete="off" data-plan="' + key + '" value="' + esc(v) + '" placeholder="—"></label>';
    }
    var hours = '<option value="">—</option>';
    for (var i = 0; i < 24; i++) hours += '<option value="' + i + '"' + (p.no_trading_after === i ? ' selected' : '') + '>' + (i < 10 ? '0' : '') + i + ':00</option>';
    return '<div class="wwai-group wwai-plan">' +
      '<div class="wwai-row is-stack"><div class="wwai-row-text"><strong>' + esc(_t('aiCoach.plan.title', 'İşlem planım')) + '</strong><span>' +
        esc(_t('aiCoach.plan.hint', 'Kendi kurallarını yaz. İşlemlerini bunlara göre puanlar, kuralı çiğnediğinde seni uyarırım. Boş bıraktığın kural kullanılmaz.')) + '</span></div>' +
      '<div class="wwai-plan-grid">' +
        num('max_trades_per_day', _t('aiCoach.plan.max_trades', 'Günlük en fazla işlem'), 1) +
        num('max_daily_loss', _t('aiCoach.plan.max_daily_loss', 'Günlük en fazla zarar'), 'any') +
        num('max_loss_per_trade', _t('aiCoach.plan.max_trade_loss', 'İşlem başına en fazla zarar'), 'any') +
        '<label class="wwai-plan-field"><span>' + esc(_t('aiCoach.plan.no_after', 'Bu saatten sonra işlem yok')) + '</span><select data-plan="no_trading_after">' + hours + '</select></label>' +
      '</div>' +
      '<div class="wwai-plan-foot"><label class="wwai-plan-check"><button type="button" class="wwai-switch" role="switch" data-act="plan-stop" data-plan="require_stop" aria-checked="' + (p.require_stop ? 'true' : 'false') + '"><span></span></button>' +
        '<span>' + esc(_t('aiCoach.plan.require_stop', 'Her işlemde stop zorunlu')) + '</span></label>' +
        '<button type="button" class="wwai-upgrade" data-act="plan-save">' + esc(_t('aiCoach.plan.save', 'Planı kaydet')) + '</button></div>' +
      '</div></div>';
  }
  var GOAL_TR = { stop_every_trade: 'Her işlemde stop kullan', max_trades_per_day: 'Günde en fazla {target} işlem', stop_after_losses: 'Art arda {target} kayıptan sonra o gün dur',
    max_daily_loss: 'Günlük zarar {target} olunca dur', no_size_up_after_loss: 'Kayıptan sonra lot büyütme', no_trading: 'Hiç işlem açma' };
  function goalText(g) { return _t('aiCoach.goal.' + g.kind, GOAL_TR[g.kind] || g.kind, { target: g.kind === 'max_daily_loss' ? money(g.target) : g.target }); }
  // start screen: last week in one line, the goal's result, and this week's goal (taken: progress; else a suggestion to take)
  function weeklyCard(w) {
    var box = el('div', 'wwai-week'), r = w.review, g = w.goal;
    if (r) {
      box.appendChild(el('div', 'wwai-week-head', esc(_t('aiCoach.week.last', 'Geçen hafta')) + ' <b class="' + (r.net > 0 ? 'is-pos' : r.net < 0 ? 'is-neg' : '') + '">' + esc(money(r.net, true)) + '</b>' +
        '<span>' + esc(_t('aiCoach.viz.trades_n', '{n} işlem', { n: r.trades })) + (r.win_rate != null ? ' · ' + esc(fmt(r.win_rate, 'pct')) : '') + (r.plan_score != null ? ' · ' + esc(_t('aiCoach.week.plan', 'plan {score}', { score: fmt(r.plan_score, 'pct') })) : '') + '</span>'));
      if (r.goal) box.appendChild(el('p', 'wwai-week-goal ' + (r.goal.met ? 'is-pos' : 'is-neg'), esc(r.goal.met
        ? _t('aiCoach.week.goal_met', 'Hedef tuttu: {goal}', { goal: goalText(r.goal) })
        : _t('aiCoach.week.goal_missed', 'Hedef tutmadı ({n} ihlal): {goal}', { goal: goalText(r.goal), n: r.goal.breaks }))));
    }
    if (g) {
      var row = el('div', 'wwai-week-now');
      row.appendChild(el('span', '', esc(_t('aiCoach.week.this', 'Bu haftanın hedefi')) + ': <b>' + esc(goalText(g)) + '</b> · ' + esc(g.breaks ? _t('aiCoach.week.breaks', '{n} ihlal', { n: g.breaks }) : _t('aiCoach.week.clean', 'şimdilik temiz'))));
      row.appendChild(el('button', 'wwai-link', esc(_t('aiCoach.week.drop', 'Bırak')))).setAttribute('data-act', 'goal-drop');
      box.appendChild(row);
    } else if (r && r.next_goal) {
      var sug = el('div', 'wwai-week-now');
      sug.appendChild(el('span', '', esc(_t('aiCoach.week.suggest', 'Bu hafta için önerim')) + ': <b>' + esc(goalText(r.next_goal)) + '</b>'));
      var take = el('button', 'wwai-upgrade', esc(_t('aiCoach.week.take', 'Hedef olarak al')));
      take.setAttribute('data-act', 'goal-take'); take.setAttribute('data-kind', r.next_goal.kind); take.setAttribute('data-target', String(r.next_goal.target));
      sug.appendChild(take); box.appendChild(sug);
    }
    return box;
  }
  function setGoal(goal) {
    session().then(function (s) {
      if (!s) throw new Error('session');
      return fetch(endpoint() + '/functions/v1/ai-coach', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.access_token, 'apikey': anonKey() },
        body: JSON.stringify({ action: 'goal', goal: goal, tz: tz() }) }).then(function (r) { return r.json(); });
    }).then(function (j) {
      if (!j || !j.ok) throw new Error('goal');
      S.prefs = S.prefs || {}; S.prefs.plan = Object.assign({}, S.prefs.plan || {}); if (j.goal) S.prefs.plan.goal = j.goal; else delete S.prefs.plan.goal;
      S.snap = {}; toast(j.goal ? _t('aiCoach.week.taken', 'Hedefin kaydedildi. Hafta boyunca takip edeceğim.') : _t('aiCoach.week.dropped', 'Hedef bırakıldı.'), 'success');
      if (S.view === 'chat' && !S.messages.length) renderMessages();
    }).catch(function () { toast(_t('aiCoach.set.save_error', 'Ayar kaydedilemedi. Birazdan tekrar dene.'), 'error'); });
  }
  // ---------------------------------------------------------------- daily promises (_shared/commitments.ts)
  // The coach ends an answer with a [[commit:KIND:TARGET:WHEN]] line; the server resolves it to { kind:'commit', commit:
  // { kind, target, day } } in visuals and the line becomes a card with an "I promise" button. Taken: coach_settings.plan.commitment.
  var COMMIT_LINE = /^\s*\[\[(commit:[a-z_]+:[0-9.]+:(?:today|tomorrow))\]\]\s*$/;
  function localDay(offset) {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + (offset || 0) * 864e5)); }
    catch (e) { return new Date(Date.now() + (offset || 0) * 864e5).toISOString().slice(0, 10); }
  }
  function dayLabel(day) {
    if (day === localDay(0)) return _t('aiCoach.commit.today', 'Bugün');
    if (day === localDay(1)) return _t('aiCoach.commit.tomorrow', 'Yarın');
    if (day === localDay(-1)) return _t('aiCoach.commit.yesterday', 'Dün');
    try { return new Intl.DateTimeFormat(lang(), { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(day + 'T12:00:00Z')); } catch (e) { return day; }
  }
  function sameCommit(a, b) { return !!a && !!b && a.kind === b.kind && Number(a.target) === Number(b.target) && a.day === b.day; }
  function renderCommit(v) {
    var c = v.commit, box = el('div', 'wwai-commit');
    var taken = sameCommit(S.prefs && S.prefs.plan && S.prefs.plan.commitment, c), past = c.day < localDay(0);
    box.appendChild(el('span', 'wwai-commit-label', esc(_t('aiCoach.commit.offer', 'Söz')) + ' · ' + esc(dayLabel(c.day))));
    box.appendChild(el('b', 'wwai-commit-text', esc(goalText(c))));
    if (taken) box.appendChild(el('span', 'wwai-commit-state is-pos', esc(_t('aiCoach.commit.taken_short', 'Söz verdin. Gün bitince bakacağım.'))));
    else if (past) box.appendChild(el('span', 'wwai-commit-state', esc(_t('aiCoach.commit.expired', 'Bu sözün günü geçti.'))));
    else {
      var b = el('button', 'wwai-upgrade', esc(_t('aiCoach.commit.take', 'Söz veriyorum'))); b.type = 'button';
      b.setAttribute('data-act', 'commit-take'); b.setAttribute('data-kind', c.kind); b.setAttribute('data-target', String(c.target)); b.setAttribute('data-day', c.day);
      box.appendChild(b);
    }
    return box;
  }
  // start screen: the open promise and how the day goes, the latest result, the record of the last 30 days
  function commitCard(st) {
    var box = el('div', 'wwai-week wwai-commit-card'), cur = st.current, last = st.last;
    if (last && !(cur && cur.day === last.day)) {
      box.appendChild(el('p', 'wwai-week-goal ' + (last.kept ? 'is-pos' : 'is-neg'), esc(last.kept
        ? _t('aiCoach.commit.kept', '{day} sözünü tuttun: {goal}', { day: dayLabel(last.day), goal: goalText(last) })
        : _t('aiCoach.commit.missed', '{day} sözün tutmadı ({n} ihlal): {goal}', { day: dayLabel(last.day), goal: goalText(last), n: last.breaks }))));
    }
    if (cur) {
      var row = el('div', 'wwai-week-now');
      var state = cur.status === 'upcoming' ? '' : ' · ' + esc(cur.breaks ? _t('aiCoach.week.breaks', '{n} ihlal', { n: cur.breaks }) : _t('aiCoach.week.clean', 'şimdilik temiz'));
      row.appendChild(el('span', '', esc(_t('aiCoach.commit.current', '{day} için sözün', { day: dayLabel(cur.day) })) + ': <b>' + esc(goalText(cur)) + '</b>' + state));
      row.appendChild(el('button', 'wwai-link', esc(_t('aiCoach.week.drop', 'Bırak')))).setAttribute('data-act', 'commit-drop');
      box.appendChild(row);
    }
    if (st.record && st.record.total) box.appendChild(el('p', 'wwai-commit-record', esc(_t('aiCoach.commit.record', 'Son 30 günde {total} sözün {kept} tanesini tuttun.', { kept: st.record.kept, total: st.record.total }))));
    return box;
  }
  function setCommit(c) {
    session().then(function (s) {
      if (!s) throw new Error('session');
      return fetch(endpoint() + '/functions/v1/ai-coach', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.access_token, 'apikey': anonKey() },
        body: JSON.stringify({ action: 'commit', commit: c, tz: tz() }) }).then(function (r) { return r.json(); });
    }).then(function (j) {
      if (!j || !j.ok) throw new Error('commit');
      S.prefs = S.prefs || {}; S.prefs.plan = Object.assign({}, S.prefs.plan || {}); if (j.commitment) S.prefs.plan.commitment = j.commitment; else delete S.prefs.plan.commitment;
      S.snap = {};
      toast(j.commitment ? _t('aiCoach.commit.taken', 'Sözün kaydedildi. Gün bitince sonucuna birlikte bakacağız.') : _t('aiCoach.commit.dropped', 'Söz bırakıldı.'), 'success');
      if (S.view === 'chat') renderMessages();
    }).catch(function () { toast(_t('aiCoach.set.save_error', 'Ayar kaydedilemedi. Birazdan tekrar dene.'), 'error'); });
  }
  // ---------------------------------------------------------------- action cards (_shared/actions.ts)
  // The coach prepares a change ([[action:aN]] line, the clean action in visuals); nothing happens until the member taps
  // "Apply". The server validates it again; the monthly profit target lives in this browser (dashboard), so it is set here.
  var ACTION_LINE = /^\s*\[\[(action:a[1-3])\]\]\s*$/;
  var APPLIED_KEY = 'ww_ai_coach_applied';
  function appliedSet() { try { return JSON.parse(sessionStorage.getItem(APPLIED_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function actionKey(a) { return JSON.stringify(a) + '|' + (a.type === 'add_strategy' || a.type === 'set_monthly_target' ? actionJournal() : ''); }
  function markApplied(a, v) { var m = appliedSet(); m[actionKey(a)] = v; try { sessionStorage.setItem(APPLIED_KEY, JSON.stringify(m)); } catch (e) { /* ignore */ } }
  // the journal a strategy / monthly target goes to: the chat's journal, else the one in view, else the active one
  function actionJournal() {
    var j = S.convJournal || currentJournal();
    if (!j) { try { j = (global.journal && global.journal.getActiveJournalId && global.journal.getActiveJournalId()) || ''; } catch (e) { j = ''; } }
    return j || '';
  }
  function journalName(id) { var l = S.journals || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i].name; return ''; }
  function monthlyTarget(jid) { try { var v = Number(localStorage.getItem('ww_monthly_target_' + (jid || ''))); return v > 0 ? v : null; } catch (e) { return null; } }
  var PLAN_LABEL = { max_trades_per_day: ['aiCoach.plan.max_trades', 'Günlük en fazla işlem'], max_daily_loss: ['aiCoach.plan.max_daily_loss', 'Günlük en fazla zarar'],
    max_loss_per_trade: ['aiCoach.plan.max_trade_loss', 'İşlem başına en fazla zarar'], require_stop: ['aiCoach.plan.require_stop', 'Her işlemde stop zorunlu'], no_trading_after: ['aiCoach.plan.no_after', 'Bu saatten sonra işlem yok'] };
  function ruleValue(k, v) {
    if (k === 'require_stop') return v ? _t('aiCoach.action.on', 'açık') : _t('aiCoach.action.off', 'kapalı');
    if (k === 'no_trading_after') return (v < 10 ? '0' : '') + v + ':00';
    if (k === 'max_daily_loss' || k === 'max_loss_per_trade') return money(v);
    return String(v);
  }
  function renderAction(a) {
    var box = el('div', 'wwai-commit wwai-action'), title = '', lines = [], btn = '';
    var done = appliedSet()[actionKey(a)];
    if (a.type === 'add_strategy') {
      title = _t('aiCoach.action.strategy', 'Yeni strateji');
      lines.push('<b><span class="wwai-action-dot" style="background:' + esc(a.color) + '"></span>' + esc(a.name) + '</b>');
      if (a.description) lines.push('<span class="wwai-action-desc">' + esc(a.description) + '</span>');
      var jn = journalName(actionJournal());
      if (jn) lines.push('<span class="wwai-action-sub">' + esc(_t('aiCoach.action.journal', 'Defter: {name}', { name: jn })) + '</span>');
      btn = _t('aiCoach.action.add_strategy', 'Stratejiyi ekle');
    } else if (a.type === 'set_plan') {
      title = _t('aiCoach.action.plan', 'İşlem planı');
      var cur = (S.prefs && S.prefs.plan) || {}, changes = 0;
      Object.keys(a.rules || {}).forEach(function (k) {
        var L = PLAN_LABEL[k]; if (!L) return;
        if (cur[k] === a.rules[k]) return;                  // the coach repeated a rule the plan already has
        changes++;
        var was = cur[k] != null && cur[k] !== a.rules[k] ? ' <span class="wwai-action-sub">(' + esc(_t('aiCoach.action.was', 'şu an {v}', { v: ruleValue(k, cur[k]) })) + ')</span>' : '';
        lines.push(esc(_t(L[0], L[1])) + ': <b>' + esc(ruleValue(k, a.rules[k])) + '</b>' + was);
      });
      (a.remove || []).forEach(function (k) { var L = PLAN_LABEL[k]; if (L && cur[k] != null) { changes++; lines.push(esc(_t('aiCoach.action.remove', 'Kaldır: {rule}', { rule: _t(L[0], L[1]) }))); } });
      if (!changes) { lines.push(esc(_t('aiCoach.action.same', 'Planında zaten bu kurallar var.'))); done = done || 'same'; }
      btn = _t('aiCoach.action.update_plan', 'Planı güncelle');
    } else if (a.type === 'set_goal') {
      title = _t('aiCoach.action.goal', 'Bu haftanın hedefi');
      lines.push('<b>' + esc(goalText(a)) + '</b>');
      btn = _t('aiCoach.week.take', 'Hedef olarak al');
    } else if (a.type === 'set_monthly_target') {
      title = _t('aiCoach.action.monthly', 'Aylık kâr hedefi');
      var now = monthlyTarget(actionJournal());
      lines.push('<b>' + esc(money(a.amount)) + '</b>' + (now && now !== a.amount ? ' <span class="wwai-action-sub">(' + esc(_t('aiCoach.action.was', 'şu an {v}', { v: money(now) })) + ')</span>' : ''));
      var jn2 = journalName(actionJournal());
      if (jn2) lines.push('<span class="wwai-action-sub">' + esc(_t('aiCoach.action.journal', 'Defter: {name}', { name: jn2 })) + '</span>');
      btn = _t('aiCoach.action.save_target', 'Hedefi kaydet');
    } else return box;
    box.appendChild(el('span', 'wwai-commit-label', esc(title)));
    box.appendChild(el('div', 'wwai-action-body', lines.map(function (x) { return '<div>' + x + '</div>'; }).join('')));
    if (done === 'same') { /* nothing to apply: the line above says so */ }
    else if (done) box.appendChild(el('span', 'wwai-commit-state is-pos', esc(done === 'exists' ? _t('aiCoach.action.exists', 'Bu isimde bir strateji zaten var.') : _t('aiCoach.action.done', 'Uygulandı.'))));
    else {
      var b = el('button', 'wwai-upgrade', esc(btn)); b.type = 'button'; b.setAttribute('data-act', 'action-apply');
      b._action = a; box.appendChild(b);
    }
    return box;
  }
  function applyAction(btn) {
    var a = btn && btn._action; if (!a || btn.disabled) return;
    btn.disabled = true;
    var jid = actionJournal();
    function finish(state, msg) { markApplied(a, state); toast(msg, 'success'); S.snap = {}; renderMessages(); }
    if (a.type === 'set_monthly_target') {                    // the dashboard reads it from this browser
      if (!jid) { btn.disabled = false; toast(_t('aiCoach.action.no_journal', 'Önce bir defter seç.'), 'error'); return; }
      try { localStorage.setItem('ww_monthly_target_' + jid, String(a.amount)); } catch (e) { btn.disabled = false; toast(_t('aiCoach.set.save_error', 'Ayar kaydedilemedi. Birazdan tekrar dene.'), 'error'); return; }
      try { global.dispatchEvent(new CustomEvent('ww:monthly-target', { detail: { journalId: jid, amount: a.amount } })); } catch (e) { /* ignore */ }
      finish('done', _t('aiCoach.action.target_saved', 'Aylık hedefin kaydedildi.'));
      return;
    }
    session().then(function (s) {
      if (!s) throw new Error('session');
      return fetch(endpoint() + '/functions/v1/ai-coach', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.access_token, 'apikey': anonKey() },
        body: JSON.stringify({ action: 'apply', act: a, journalId: jid || null, tz: tz() }) }).then(function (r) { return r.json(); });
    }).then(function (j) {
      if (!j || !j.ok) throw Object.assign(new Error('apply'), { code: j && j.code });
      if (j.plan) { S.prefs = S.prefs || {}; S.prefs.plan = j.plan; }
      if (a.type === 'add_strategy') {
        if (global.wwCache && global.wwCache.invalidate) try { global.wwCache.invalidate('strategies'); } catch (e) { /* ignore */ }
        if (!j.existed) try { global.dispatchEvent(new CustomEvent('strategy-saved')); } catch (e) { /* ignore */ }
        finish(j.existed ? 'exists' : 'done', j.existed ? _t('aiCoach.action.exists', 'Bu isimde bir strateji zaten var.') : _t('aiCoach.action.strategy_added', '"{name}" stratejin eklendi.', { name: a.name }));
      } else if (a.type === 'set_plan') finish('done', _t('aiCoach.plan.saved', 'Planın kaydedildi.'));
      else finish('done', _t('aiCoach.week.taken', 'Hedefin kaydedildi. Hafta boyunca takip edeceğim.'));
    }).catch(function (e) {
      btn.disabled = false;
      toast(e && e.code === 'NO_JOURNAL' ? _t('aiCoach.action.no_journal', 'Önce bir defter seç.') : _t('aiCoach.set.save_error', 'Ayar kaydedilemedi. Birazdan tekrar dene.'), 'error');
    });
  }
  function savePlan() {
    var f = R.settings, raw = {};
    f.querySelectorAll('[data-plan]').forEach(function (x) {
      var k = x.getAttribute('data-plan');
      if (k === 'require_stop') { if (x.getAttribute('aria-checked') === 'true') raw.require_stop = true; return; }
      var v = String(x.value || '').replace(',', '.').trim(); if (v === '') return;
      var n = Number(v); if (!isFinite(n)) return;
      if (k === 'max_trades_per_day' || k === 'no_trading_after') { if (Math.floor(n) === n) raw[k] = n; } else if (n > 0) raw[k] = Math.round(n * 100) / 100;
    });
    if (raw.max_trades_per_day != null && (raw.max_trades_per_day < 1 || raw.max_trades_per_day > 50)) delete raw.max_trades_per_day;
    if (raw.no_trading_after != null && (raw.no_trading_after < 0 || raw.no_trading_after > 23)) delete raw.no_trading_after;
    session().then(function (s) {
      if (!s || !s.user) throw new Error('session');
      // the weekly goal, the coach choice and the daily promise (and its log) live in the plan too: every key that is not a
      // rule is kept as it is. Read from the server first: it may have settled a promise since the panel loaded (writing
      // the copy loaded earlier back would bring the settled promise back and notify twice).
      return global.sb.from('coach_settings').select('plan').eq('user_id', s.user.id).maybeSingle().then(function (cur) {
        if (cur && cur.error) throw cur.error;
        var old = (cur && cur.data && cur.data.plan) || {}, keep = {}, RULES = ['max_trades_per_day', 'max_daily_loss', 'max_loss_per_trade', 'require_stop', 'no_trading_after'];
        Object.keys(old).forEach(function (k) { if (RULES.indexOf(k) < 0) keep[k] = old[k]; });
        if (!keep.coach && storedCoach()) keep.coach = storedCoach();
        raw = Object.assign(raw, keep);
        return global.sb.from('coach_settings').upsert({ user_id: s.user.id, plan: raw, time_zone: tz() }, { onConflict: 'user_id' });
      });
    }).then(function (r) {
      if (r && r.error) throw r.error;
      S.prefs = Object.assign({}, S.prefs || {}, { plan: raw }); S.snap = {};          // the opening screen re-reads the score
      toast(_t('aiCoach.plan.saved', 'Planın kaydedildi.'), 'success'); renderSettings();
    }).catch(function () { toast(_t('aiCoach.set.save_error', 'Ayar kaydedilemedi. Birazdan tekrar dene.'), 'error'); });
  }
  function setAlerts(on) {
    var prev = S.prefs ? S.prefs.alerts_enabled : undefined;
    S.prefs = Object.assign({}, S.prefs || {}, { alerts_enabled: on }); renderSettings();
    session().then(function (s) {
      if (!s || !s.user) throw new Error('session');
      return global.sb.from('coach_settings').upsert({ user_id: s.user.id, alerts_enabled: on, time_zone: tz() }, { onConflict: 'user_id' });
    }).then(function (r) { if (r && r.error) throw r.error; }).catch(function () {
      S.prefs.alerts_enabled = prev; renderSettings();
      toast(_t('aiCoach.set.save_error', 'Ayar kaydedilemedi. Birazdan tekrar dene.'), 'error');
    });
  }
  function setDesktop(on) {
    if (!on) { setPref(DESKTOP_KEY, '0'); renderSettings(); return; }
    var N = global.Notification;
    Promise.resolve(N.permission === 'granted' ? 'granted' : N.requestPermission()).then(function (p) {
      setPref(DESKTOP_KEY, p === 'granted' ? '1' : '0'); renderSettings();
      if (p === 'granted') try { new N(_t('aiCoach.set.desktop_test', '{coach} bildirimleri açık', { coach: coachName() }), { body: _t('aiCoach.set.desktop_test_body', 'Önemli bir durum olduğunda seni buradan uyaracağım.'), tag: 'ww-coach-test' }); } catch (e) { /* ignore */ }
    }, function () { renderSettings(); });
  }
  // one alert (a notifications row): shown once per key in this tab
  function showAlert(n) {
    var meta = Object.assign({ coach: coachName() }, (n && n.meta_data) || {}), k = meta.alert_key || n.id;
    S.shownAlerts = S.shownAlerts || {};
    if (!k || S.shownAlerts[k]) return;
    S.shownAlerts[k] = 1;
    var title = _t(n.title_key, meta.coach, meta), body = _t(n.message_key, '', meta);
    toast(title + (body ? ': ' + body : ''), n.type === 'error' ? 'error' : 'warning');
    var N = global.Notification;
    if (N && N.permission === 'granted' && pref(DESKTOP_KEY, '0') === '1' && document.hidden) {
      try {
        var dn = new N(title, { body: body, tag: 'ww-coach-' + k });
        dn.onclick = function () { try { global.focus(); } catch (e) { /* ignore */ } if (S.mounted) setOpen(true); dn.close(); };
      } catch (e) { /* ignore */ }
    }
  }
  // after a manual trade: ask the server for the same checks a sync runs (debounced; backtest copies do not count)
  function onTradeSaved(e) {
    if (e && e.detail && e.detail.source === 'backtest') return;
    clearTimeout(S.alertTimer);
    S.alertTimer = setTimeout(checkAlerts, 3000);
  }
  function checkAlerts() {
    var jid = '';
    try { jid = (global.journal && global.journal.getActiveJournalId && global.journal.getActiveJournalId()) || ''; } catch (e) { /* none */ }
    if (!jid || (S.prefs && S.prefs.alerts_enabled === false)) return;
    session().then(function (s) {
      if (!s) return null;
      return fetch(endpoint() + '/functions/v1/ai-coach', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.access_token, 'apikey': anonKey() },
        body: JSON.stringify({ action: 'alerts', journalId: jid, tz: tz() }) }).then(function (r) { return r.json(); });
    }).then(function (j) {
      // the realtime listener shows them too; showAlert keeps one per key
      (j && j.ok && j.alerts || []).forEach(function (a) {
        showAlert({ type: a.level, title_key: 'coach.alert.' + a.kind + '.title', message_key: 'coach.alert.' + a.kind + '.msg', meta_data: Object.assign({ alert_key: a.key }, a.params) });
      });
    }, function () { /* quiet: alerts are best effort */ });
  }

  // ---------------------------------------------------------------- chat
  function newChat() {
    S.conversationId = null; S.convJournal = undefined; S.messages = []; clearImage();
    save({ open: S.open, conversationId: null });
    showChat();
    R.input.focus();
  }
  function setView(v) {
    if (v !== 'chat') stopDictation(true);
    S.view = v; R.msgs.hidden = v !== 'chat'; R.history.hidden = v !== 'history'; R.settings.hidden = v !== 'settings'; R.coach.hidden = v !== 'coach';
    R.panel.querySelector('.wwai-foot').hidden = v !== 'chat'; R.panel.querySelector('.wwai-back').hidden = v === 'chat';
    R.gear.classList.toggle('is-active', v === 'settings'); R.gear.setAttribute('aria-pressed', v === 'settings' ? 'true' : 'false');
  }
  function showChat() { setView('chat'); texts(); renderMessages(); }

  function renderMessages() {
    var box = R.msgs; box.innerHTML = '';
    if (!S.messages.length) { box.appendChild(renderEmpty()); return; }
    S.messages.forEach(function (m) { box.appendChild(bubble(m)); });
    if (S.pending === true) box.appendChild(el('div', 'wwai-msg wwai-model wwai-typing', whoHtml() + '<div class="wwai-dots"><span></span><span></span><span></span></div>'));
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
      var am = ACTION_LINE.exec(ln);
      if (am) {                                              // a change the coach prepared: card with "Apply"
        flush();
        var ad = m.visuals && m.visuals[am[1]];
        if (ad && ad.kind === 'action' && ad.action) body.appendChild(renderAction(ad.action));
        return;
      }
      var cm = COMMIT_LINE.exec(ln);
      if (cm) {                                              // the promise card (no data yet while streaming: nothing)
        flush();
        var cd = m.visuals && m.visuals[cm[1]];
        if (cd && cd.kind === 'commit' && cd.commit) body.appendChild(renderCommit(cd));
        return;
      }
      var v = VIZ_LINE.exec(ln);
      if (!v) { chunk.push(ln); return; }
      flush();
      var data = m.visuals && m.visuals[v[1]];
      if (data) body.appendChild(renderViz(data));
      else if (m.streaming) body.appendChild(el('div', 'wwai-viz wwai-viz-wait'));
    });
    flush();
  }

  // the coach's answers are plain full-width text (no bubble) under a small label with the coach's name; the user's stay bubbles
  function whoHtml() { var d = coach().def; return '<div class="wwai-who"><span class="wwai-who-icon">' + coachAv(d, 20) + '</span>' + esc(d.name) + '</div>'; }
  function bubble(m) {
    var b = el('div', 'wwai-msg ' + (m.role === 'user' ? 'wwai-user' : 'wwai-model') + (m.error ? ' wwai-error' : ''));
    if (m.role !== 'user' && !m.error) b.innerHTML = whoHtml();
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
    if (code === 'NOT_CONFIGURED') return _t('aiCoach.err.off', '{coach} şu an kullanılamıyor.', { coach: coachName() });
    if (code === 'NETWORK') return _t('aiCoach.err.network', 'Bağlantı hatası. İnternetini kontrol edip tekrar dene.');
    return _t('aiCoach.err.generic', 'AI şu an cevap veremedi. Birazdan tekrar dene.');
  }

  function send() {
    if (S.pending) return;
    stopDictation(true);                                    // what is in the box is sent; late results must not refill it
    var text = R.input.value.trim();
    if (!text && S.image) text = _t('aiCoach.prompt.chart_text', 'Bu grafikteki kurulum hakkında ne düşünüyorsun?');
    if (!text) return;
    if (S.view !== 'chat') showChat();
    var img = S.image;
    S.messages.push({ role: 'user', content: text, imageUrl: img ? img.url : null });
    R.input.value = ''; autosize(); clearImage();
    S.pending = true; R.send.disabled = true;
    renderMessages();
    // The answer is typed out word by word: what the server sent so far is reply.full, what is on screen reply.content.
    // Gemini sends uneven chunks (sometimes a whole paragraph at once); a typer reveals them at a steady pace and speeds
    // up when a big chunk is waiting, so the text never lags far behind (typeStep). The server's final text and charts
    // replace it once the typing has caught up.
    var reply = null;                                       // the streaming answer, once the first word arrived
    function paint() {                                      // redraw only the streaming bubble
      if (!reply || !reply.el || !reply.el.isConnected) return;
      var near = R.msgs.scrollHeight - R.msgs.scrollTop - R.msgs.clientHeight < 80;
      fillModel(reply.el.querySelector('.wwai-msg-text'), reply);
      if (near) R.msgs.scrollTop = R.msgs.scrollHeight;
    }
    function ensureReply() {
      if (reply) return;
      reply = { role: 'model', content: '', full: '', streaming: true };
      S.messages.push(reply);
      S.pending = 'streaming';
      renderMessages();
      reply.el = R.msgs.lastElementChild && R.msgs.lastElementChild.classList.contains('wwai-model') ? R.msgs.lastElementChild : null;
    }
    function schedule() {
      if (!reply || reply._raf) return;
      reply._raf = (global.requestAnimationFrame || function (f) { return setTimeout(function () { f(Date.now()); }, 16); })(typeStep);
    }
    function typeStep(ts) {
      if (!reply) return;
      reply._raf = 0;
      var full = reply.full, shown = reply.content.length;
      if (shown < full.length) {
        if (document.hidden) shown = full.length;                         // background tab: no point in typing
        else {
          var dt = reply._ts ? Math.min(ts - reply._ts, 100) : 16;
          var backlog = (full.length - shown) / 6;                        // words still waiting (about 6 characters each)
          reply._carry = (reply._carry || 0) + (TYPE_WPS + backlog * TYPE_CATCH_UP) * dt / 1000;
          var n = Math.floor(reply._carry);
          reply._carry -= n;
          while (n-- > 0 && shown < full.length) shown = nextWordEnd(full, shown);
        }
        reply._ts = ts;
        if (shown > reply.content.length) { reply.content = full.slice(0, shown); paint(); }
      }
      if (reply.content.length < reply.full.length) schedule();
      else {
        reply._ts = 0; reply._carry = 0;
        if (reply._drained) { var f = reply._drained; reply._drained = null; f(); }
      }
    }
    function drained() {                                    // resolves once everything received is on screen
      return new Promise(function (resolve) {
        if (!reply || reply.content.length >= reply.full.length) return resolve();
        reply._drained = resolve; schedule();
      });
    }
    function onDelta(t) {
      ensureReply();
      reply.full += t; schedule();
    }
    function onReset() {                                    // the server retries a broken answer: back to "typing…"
      if (!reply) return;
      if (reply._raf) (global.cancelAnimationFrame || clearTimeout)(reply._raf);
      var i = S.messages.indexOf(reply); if (i >= 0) S.messages.splice(i, 1);
      reply = null; S.pending = true; renderMessages();
    }
    function failWith(code, j) {
      var msg = errorText(code, j);
      if (reply) { reply.content = reply.full; reply.streaming = false; reply.note = msg; }   // keep what arrived, say it stopped
      else S.messages.push({ role: 'model', content: msg, error: true, upgrade: code === 'LIMIT' && j && j.usage && !j.usage.premium });
    }
    session().then(function (s) {
      if (!s) throw Object.assign(new Error('session'), { code: 'UNAUTHORIZED' });
      var cc = coach(), body = { message: text, lang: lang(), tz: tz(), stream: true, detail: detail(), coach: cc.id, tone: cc.tone, currency: currency() };
      var mtv = monthlyTarget(actionJournal()); if (mtv) body.monthlyTarget = mtv;
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
      ensureReply();
      if (!reply.full) { reply.full = String(j.reply || ''); schedule(); }   // a non-streamed answer is typed out too
      return drained().then(function () {
        reply.content = j.reply; reply.visuals = j.visuals || null; reply.streaming = false;
      });
    }).catch(function (e) {
      failWith((e && e.code) || 'NETWORK');
    }).then(function () {
      if (reply) { reply.streaming = false; if (reply._raf) (global.cancelAnimationFrame || clearTimeout)(reply._raf); reply._raf = 0; }
      S.pending = false; R.send.disabled = false;
      if (S.view === 'chat') renderMessages();
    });
  }
  // typing pace: words per second at rest, plus this much per word still waiting (80 words arriving at once take ~1.5 s)
  var TYPE_WPS = 32, TYPE_CATCH_UP = 0.7;
  // the end of the next word after position i (spaces, then the word); a [[viz:...]] line comes in one piece
  function nextWordEnd(text, i) {
    var n = text.length;
    while (i < n && /\s/.test(text.charAt(i))) i++;
    if (text.charAt(i) === '[' && text.charAt(i + 1) === '[') { var e = text.indexOf(']]', i); return e < 0 ? n : e + 2; }
    while (i < n && !/\s/.test(text.charAt(i))) i++;
    return i;
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
      by_month_last_12: 'Ay', by_trade_number_of_day: 'Günün kaçıncı işlemi', after_consecutive_losses: 'Art arda kayıp sonrası',
      r_buckets: 'R çarpanı (riske göre sonuç)' },
    session: { asia: 'Asya', london: 'Londra', london_ny_overlap: 'Londra–NY', new_york: 'New York', late: 'Geç saat' }
  };
  function vt(group, id) { return _t('aiCoach.viz.' + group + '.' + id, (VIZ_TR[group] && VIZ_TR[group][id]) || id); }
  function nf(v, opts) { try { return new Intl.NumberFormat(lang(), opts).format(v); } catch (e) { return String(v); } }
  // the currency symbol the app shows (settings / onboarding); the coach writes its amounts in it too
  function currency() { try { return (typeof global.getCurrencySymbol === 'function' && global.getCurrencySymbol()) || localStorage.getItem('ww_currency') || '$'; } catch (e) { return '$'; } }
  function money(v, signed) {
    var cur = currency();
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
      if (S.journalId && !S.journals.some(function (j) { return j.id === S.journalId; })) S.journalId = undefined;
      renderJournal();
      if (S.view === 'settings') renderSettings();
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
    // a failed attempt is cached too (30 s): it re-renders the start screen, which would otherwise ask again at once, forever
    if (c && Date.now() - c.at < (c.data || c.loading ? 120000 : 30000)) return;
    S.snap[k] = { loading: true, at: Date.now() };
    session().then(function (s) {
      if (!s) throw new Error('session');
      var body = { action: 'snapshot', tz: tz() }; if (jid) body.journalId = jid;
      return fetch(endpoint() + '/functions/v1/ai-coach', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.access_token, 'apikey': anonKey() }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); });
    }).then(function (j) { S.snap[k] = { data: j && j.ok ? j.snapshot : null, at: Date.now() }; }, function () { S.snap[k] = { data: null, at: Date.now() }; })
      .then(function () {
        if ((currentJournal() || '*') !== k) return;
        if (S.view === 'chat' && !S.messages.length) renderMessages(); else if (S.view === 'coach') renderCoach();
      });
  }
  function insightText(ins) {
    var p = {}, q = ins.params || {};
    Object.keys(q).forEach(function (key) { p[key] = q[key]; });
    ['net'].forEach(function (key) { if (key in q) p[key] = money(Number(q[key]), true); });
    ['room', 'remaining', 'total'].forEach(function (key) { if (key in q) p[key] = money(Number(q[key])); });
    ['win_rate', 'base', 'first', 'pct', 'live', 'backtest', 'before', 'capture', 'pass', 'better', 'cut', 'score'].forEach(function (key) { if (key in q) p[key] = nf(Number(q[key]), { maximumFractionDigits: 1 }); });
    ['after_loss', 'after_win', 'avg_r'].forEach(function (key) { if (key in q) p[key] = nf(Number(q[key]), { minimumFractionDigits: 1, maximumFractionDigits: 2 }); });
    if ('day' in q && q.day in DAYS) { try { p.day = new Intl.DateTimeFormat(lang(), { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + DAYS[q.day]))); } catch (e) { /* key */ } }
    if ('session' in q) p.session = vt('session', q.session);
    if ('rule' in q) p.rule = _t('aiCoach.rule.' + q.rule, RULE_TR[q.rule] || q.rule);
    if ('emotion' in q) p.emotion = _t('notes.emotion.' + q.emotion, q.emotion);
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
    no_trades: ['Henüz kapanmış işlemin yok. İşlem ekledikçe sana özel analiz yaparım.', 'Trading günlüğümü nasıl kullanmalıyım? Nereden başlamalıyım?'],
    prop_failed: ['{journal} prop hesabında bir kural ihlal edilmiş.', '{journal} prop hesabım neden başarısız oldu? Bir sonrakinde neyi farklı yapmalıyım?'],
    prop_daily_limit: ['{journal}: bugün günlük zarar limitine {room} kaldı (yaklaşık {losses} ortalama kayıp).', 'Bugün {journal} hesabımda işlem açmaya devam etmeli miyim? Lotumu ne kadar küçültmeliyim?'],
    prop_max_loss: ['{journal}: maksimum zarar sınırına {room} kaldı (yaklaşık {losses} ortalama kayıp).', '{journal} hesabımı korumak için riskimi nasıl ayarlamalıyım?'],
    prop_target_close: ['{journal}: kâr hedefinin %{pct} tamam, {remaining} kaldı.', '{journal} challenge\'ını bitirmek için nasıl ilerlemeliyim?'],
    size_after_loss: ['Kayıptan sonra lotunu büyütüyorsun: ortalama ×{after_loss}, kazançtan sonra ×{after_win}.', 'Kayıptan sonra neden lot büyütüyorum? Bunu nasıl önlerim?'],
    oversized: ['Normalden büyük lotlu {trades} işlemin toplamda zararda ({net}).', 'Büyük lotla açtığım işlemleri analiz et. Pozisyon büyüklüğümü nasıl belirlemeliyim?'],
    stop_overrun: ['Kayıplarının %{pct} kadarı stop seviyesinin ötesinde kapanmış (ortalama {avg_r}R).', 'Kayıplarım neden planladığım stoptan büyük oluyor?'],
    early_exit: ['Kazanan işlemlerde hedefinin ancak %{capture} kadarını alıyorsun.', 'Kazanan işlemleri erken mi kapatıyorum? Hedefe kadar nasıl tutarım?'],
    costs_high: ['Komisyon ve swap brüt kârının %{pct} kadarını götürüyor ({total}).', 'İşlem maliyetlerim sonucumu nasıl etkiliyor, nasıl azaltırım?'],
    backtest_gap: ['{name}: backtest\'te kazanma oranın %{backtest}, canlıda %{live}.', '{name} backtest\'te çalışıyor ama canlıda neden çalışmıyor?'],
    form_down: ['Son 20 işlemde kazanma oranın %{win_rate}, öncesinde %{before}.', 'Son işlemlerim neden kötü gidiyor? Ne değişti?'],
    prop_odds_risk: ['{journal}: geçme olasılığın %{pass}. İşlem başına riski %{cut} azaltırsan %{better}.', '{journal} hesabımda riskimi nasıl ayarlarsam challenge\'ı geçme şansım artar?'],
    prop_odds: ['{journal}: mevcut sonuçlarınla challenge\'ı geçme olasılığın yaklaşık %{pass}.', '{journal} challenge\'ını geçme olasılığımı nasıl artırırım?'],
    bt_ready: ['{name} backtest\'i ({symbol}, {trades} işlem) canlıya hazır görünüyor.', '{name} stratejimi canlıya nasıl taşımalıyım? Küçük bir deneme planı yapar mısın?'],
    bt_no_edge: ['{name} backtest hesabın zararda ({net}, {trades} işlem).', '{name} backtest hesabımı analiz et: sistemim canlıya hazır mı, neyi değiştirmeliyim?'],
    plan_discipline: ['Son 7 günde işlemlerinin %{score} kadarı planına uydu. En çok çiğnenen: {rule}.', 'Planıma neden uyamıyorum? {rule} kuralını nasıl tutarım?'],
    plan_followed: ['Son 7 günde işlemlerinin %{score} kadarı planına uydu. Harika gidiyorsun.', 'Planıma uymak sonuçlarımı nasıl etkiliyor?'],
    emotion_cost: ['Notlarında "{emotion}" geçen {trades} işlemin toplamda zararda ({net}).', '"{emotion}" hissettiğim işlemler neden zarar ediyor? Ne yapmalıyım?'],
    form_up: ['Gelişiyorsun: son 20 işlemde kazanma oranın %{win_rate}, öncesinde %{before}.', 'Son dönemde neyi doğru yapıyorum, nasıl sürdürürüm?']
  };
  function renderEmpty() {
    var wrap = el('div', 'wwai-start'), jid = currentJournal(), k = jid || '*';
    if (S.open) loadSnapshot(jid);                         // only when the member opens the panel, not on every page view
    var c = S.snap[k], snap = c && c.data;
    var cd = coach().def, head = el('div', 'wwai-start-head');
    head.insertAdjacentHTML('beforeend', avaHtml(cd, 'wwai-ava-lg'));
    var intro = el('div', 'wwai-start-intro');
    intro.appendChild(el('p', 'wwai-start-text', esc(cd.id === 'kai' ? _t('aiCoach.intro_short', cd.intro) : coachText(cd, 'intro'))));
    var sw = el('button', 'wwai-link wwai-coach-switch', esc(_t('aiCoach.coach.change', 'Koçu değiştir')) + ' →'); sw.type = 'button'; sw.setAttribute('data-act', 'coach-open');
    intro.appendChild(sw); head.appendChild(intro);
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
    if (snap && snap.commitment) wrap.appendChild(commitCard(snap.commitment));
    if (snap && snap.weekly) wrap.appendChild(weeklyCard(snap.weekly));
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
    if (cd.chip) {                                         // the coach's own topic first
      var fc = el('button', 'wwai-chip wwai-chip-coach', ICON[cd.icon] + '<span></span>'); fc.type = 'button'; fc.setAttribute('data-act', 'prompt');
      var fq = _t('aiCoach.coach.' + cd.id + '.chip_q', cd.chip[1]); fc.setAttribute('data-text', fq); fc.title = fq;
      fc.querySelector('span').textContent = _t('aiCoach.coach.' + cd.id + '.chip', cd.chip[0]); chips.appendChild(fc);
    }
    PROMPTS.forEach(function (p) {
      var b = el('button', 'wwai-chip', ICON[p[4]] + '<span></span>'); b.type = 'button'; b.setAttribute('data-act', 'prompt');
      b.setAttribute('data-text', _t(p[0], p[1])); b.title = _t(p[0], p[1]); b.querySelector('span').textContent = _t(p[2], p[3]); chips.appendChild(b);
    });
    var ib = el('button', 'wwai-chip', ICON.image + '<span></span>'); ib.type = 'button'; ib.setAttribute('data-act', 'prompt-image');
    ib.querySelector('span').textContent = _t('aiCoach.chip.chart', 'Grafik yorumla'); chips.appendChild(ib);
    wrap.appendChild(chips);
    return wrap;
  }

  // ---------------------------------------------------------------- usage + settings
  function loadUsage() {
    if (!global.sb || !global.sb.rpc) return;
    global.sb.rpc('get_ai_usage').then(function (r) {
      if (r && !r.error && r.data) { S.usage = r.data; S.usageFailed = false; } else if (!S.usage) S.usageFailed = true;
      renderUsage();
    }, function () { if (!S.usage) { S.usageFailed = true; renderUsage(); } });
  }
  // the gear gets a small dot when at most one message is left; the numbers live in the settings view
  function renderUsage() {
    if (!R.gear) return;
    var u = S.usage, low = !!u && u.limit > 0 && u.limit - u.used <= 1;
    R.gear.classList.toggle('has-alert', low);
    if (S.view === 'settings') renderSettings();
  }
  function resetTime() {                                                   // the counter is per UTC day: next UTC midnight, in local time
    var d = new Date(); d.setUTCHours(24, 0, 0, 0);
    try { return new Intl.DateTimeFormat(lang(), { hour: '2-digit', minute: '2-digit' }).format(d); } catch (e) { return d.toISOString().slice(11, 16) + ' UTC'; }
  }
  function resetIn() {
    var now = new Date(), at = new Date(now); at.setUTCHours(24, 0, 0, 0);
    var mins = Math.max(1, Math.ceil((at - now) / 60000)), h = Math.floor(mins / 60), m = mins % 60;
    var t = h ? _t('aiCoach.set.hm', '{h} sa {m} dk', { h: h, m: m }) : _t('aiCoach.set.m', '{m} dk', { m: m });
    return _t('aiCoach.set.reset_in', '{time} sonra yenilenir', { time: t });
  }
  function ring(frac) {
    var C = 2 * Math.PI * 17, f = Math.max(0, Math.min(1, frac));
    return '<svg class="wwai-quota-ring" viewBox="0 0 40 40" aria-hidden="true"><circle class="wwai-ring-bg" cx="20" cy="20" r="17"/>' +
      (f > 0 ? '<circle class="wwai-ring" cx="20" cy="20" r="17" stroke-dasharray="' + (C * f).toFixed(2) + ' ' + C.toFixed(2) + '"/>' : '') + '</svg>';  // no round-cap dot at 0
  }
  function showSettings() { setView('settings'); texts(); loadUsage(); }       // texts() -> renderUsage() -> renderSettings()
  function row(title, hint, control, cls) {
    return '<div class="wwai-row' + (cls ? ' ' + cls : '') + '"><div class="wwai-row-text"><strong>' + esc(title) + '</strong>' +
      (hint ? '<span>' + esc(hint) + '</span>' : '') + '</div>' + control + '</div>';
  }
  function renderSettings() {
    clearInterval(S.tick);
    var u = S.usage, wide = R.panel.classList.contains('is-wide'), h = '';

    // usage: the upgrade button only when the member is about to run out, a quiet link otherwise
    h += '<div class="wwai-group wwai-usage-card">';
    if (u && u.limit > 0) {
      var left = Math.max(0, u.limit - u.used), low = left <= 1;
      h += '<div class="wwai-quota' + (low ? ' is-low' : '') + '">' + ring(left / u.limit) + '<span class="wwai-quota-n">' + (left ? left : ICON.lock) + '</span></div>' +
        '<div class="wwai-row-text"><strong>' + esc(_t('aiCoach.set.left', '{left} / {limit} mesaj hakkın kaldı', { left: left, limit: u.limit })) + '</strong>' +
        '<span class="wwai-reset-in" title="' + esc(_t('aiCoach.set.reset', 'Yenilenme: her gün {time}', { time: resetTime() })) + '">' + esc(resetIn()) + '</span>';
      if (u.premium) h += '<span>' + esc(_t('aiCoach.set.plan_premium', 'Premium · günde {limit} mesaj', { limit: u.limit })) + '</span>';
      else if (low) h += '<button type="button" class="wwai-upgrade" data-act="upgrade">' + esc(_t('aiCoach.upgrade', "Premium'a geç")) + '</button>';
      else h += '<button type="button" class="wwai-link" data-act="upgrade">' + esc(_t('aiCoach.set.more', 'Daha fazla mesaj')) + ' →</button>';
      h += '</div>';
      S.tick = setInterval(function () {
        var el2 = R.settings.querySelector('.wwai-reset-in');
        if (!el2 || S.view !== 'settings') { clearInterval(S.tick); return; }
        el2.textContent = resetIn();
      }, 30000);
    } else {
      h += '<p class="wwai-muted wwai-set-wait">' + esc(S.usageFailed ? _t('aiCoach.set.usage_error', 'Kullanım bilgisi alınamadı.') : _t('aiCoach.loading', 'Yükleniyor…')) + '</p>';
    }
    h += '</div>';

    // the coach (by the member's main problem) and its tone
    var cs = coach();
    h += '<div class="wwai-group">';
    h += row(_t('aiCoach.coach.yours', 'Koçun') + ': ' + cs.def.name, coachText(cs.def, 'problem') + ' · ' + coachText(cs.def, 'desc'),
      '<button type="button" class="wwai-link" data-act="coach-open">' + esc(_t('aiCoach.coach.change', 'Koçu değiştir')) + ' →</button>');
    h += row(_t('aiCoach.coach.tone', 'Üslup'), toneHint(cs.tone), toneSeg(cs.tone), 'is-stack');
    h += '</div>';

    // preferences
    var d = detail();
    var seg = '<div class="wwai-seg" role="radiogroup" aria-label="' + esc(_t('aiCoach.set.detail', 'Cevap uzunluğu')) + '">' +
      [['short', 'aiCoach.set.detail_short', 'Kısa'], ['normal', 'aiCoach.set.detail_normal', 'Dengeli'], ['detailed', 'aiCoach.set.detail_detailed', 'Detaylı']].map(function (o) {
        return '<button type="button" role="radio" data-act="detail" data-v="' + o[0] + '" aria-checked="' + (d === o[0] ? 'true' : 'false') + '">' + esc(_t(o[1], o[2])) + '</button>';
      }).join('') + '</div>';
    h += '<div class="wwai-group">';
    h += row(_t('aiCoach.set.wide', 'Geniş panel'), _t('aiCoach.set.wide_hint', 'Paneli ekranın büyük kısmına yayar.'),
      '<button type="button" class="wwai-switch" role="switch" data-act="wide" aria-checked="' + (wide ? 'true' : 'false') + '" aria-label="' + esc(_t('aiCoach.set.wide', 'Geniş panel')) + '"><span></span></button>', 'wwai-row-wide');
    h += row(_t('aiCoach.set.detail', 'Cevap uzunluğu'), '', seg, 'is-stack');
    if (S.journals && S.journals.length) {
      var cur = pref(JOURNAL_KEY, 'active');
      var opts = [{ id: 'active', name: _t('aiCoach.set.journal_active', 'Açık olan defter') }, { id: '', name: _t('aiCoach.journal_all', 'Tüm defterler') }].concat(S.journals);
      if (!opts.some(function (o) { return o.id === cur; })) cur = 'active';
      h += row(_t('aiCoach.set.journal', 'Varsayılan defter'), _t('aiCoach.set.journal_hint', 'Yeni sohbetler bu defterle başlar.'),
        '<select class="wwai-set-sel" data-pref="journal" aria-label="' + esc(_t('aiCoach.set.journal', 'Varsayılan defter')) + '">' +
        opts.map(function (o) { return '<option value="' + esc(o.id) + '"' + (o.id === cur ? ' selected' : '') + '>' + esc(o.name) + '</option>'; }).join('') + '</select>');
    }
    h += '</div>';

    // trading plan (coach_settings.plan): the coach scores discipline against it and the live alerts use it
    if (S.prefs !== undefined) h += planEditor();

    // live alerts (server: coach_settings.alerts_enabled; desktop notifications: this browser only)
    var al = !S.prefs || S.prefs.alerts_enabled !== false;
    h += '<div class="wwai-group">';
    h += row(_t('aiCoach.set.alerts', 'Canlı uyarılar'), _t('aiCoach.set.alerts_hint', 'Yeni işlemlerinden sonra seri kayıp, kayıptan sonra lot büyütme, prop limitlerine yaklaşma gibi durumlarda seni uyarırım.'),
      '<button type="button" class="wwai-switch" role="switch" data-act="alerts" aria-checked="' + (al ? 'true' : 'false') + '" aria-label="' + esc(_t('aiCoach.set.alerts', 'Canlı uyarılar')) + '"' + (S.prefs === null ? ' disabled' : '') + '><span></span></button>');
    if ('Notification' in global) {
      var perm = global.Notification.permission, dk = al && perm === 'granted' && pref(DESKTOP_KEY, '0') === '1';
      h += row(_t('aiCoach.set.desktop', 'Masaüstü bildirimi'), perm === 'denied' ? _t('aiCoach.set.desktop_denied', 'Bildirimler bu tarayıcıda engellenmiş; site ayarlarından izin verebilirsin.')
        : _t('aiCoach.set.desktop_hint', 'Sekme arka plandayken de uyarıları bildirim olarak gösterir.'),
        '<button type="button" class="wwai-switch" role="switch" data-act="desktop" aria-checked="' + (dk ? 'true' : 'false') + '" aria-label="' + esc(_t('aiCoach.set.desktop', 'Masaüstü bildirimi')) + '"' + (!al || perm === 'denied' ? ' disabled' : '') + '><span></span></button>');
    }
    h += '</div>';

    // data
    h += '<div class="wwai-group">';
    h += row(_t('aiCoach.set.privacy', 'Veri ve gizlilik'),
      _t('aiCoach.set.privacy_text', 'Soruların ve defterinin özeti cevap üretmek için Google Gemini\'ye gönderilir; Google bu verileri hizmetlerini geliştirmek için kullanabilir. Gemini yoğunken görselsiz mesajlar OpenRouter üzerinden ücretsiz bir modelle cevaplanabilir; bu sağlayıcılar da verileri saklayabilir. Grafik görselleri saklanmaz.'),
      '<a class="wwai-link" href="/privacy#ai-coach" target="_blank" rel="noopener">' + esc(_t('aiCoach.set.privacy_link', 'Gizlilik politikası')) + ' →</a>', 'is-stack');
    h += row(_t('aiCoach.set.delete_all', 'Tüm sohbetleri sil'), _t('aiCoach.set.delete_all_hint', 'Geçmiş sohbetlerin kalıcı olarak silinir.'),
      '<button type="button" class="wwai-danger" data-act="delete-all">' + esc(_t('aiCoach.set.delete', 'Sil')) + '</button>');
    h += '</div>';

    var keys = '<kbd>' + (isMac() ? '⌘' : 'Ctrl') + '</kbd><kbd>K</kbd>';
    h += '<p class="wwai-hint">' + esc(_t('aiCoach.set.tip', 'İpucu: {keys} ile koçu aç / kapat')).split('{keys}').join(keys) + '</p>';
    R.settings.innerHTML = h;
  }
  function deleteAll() {
    if (!global.sb || !global.confirm(_t('aiCoach.set.delete_all_confirm', 'Tüm sohbetlerin kalıcı olarak silinsin mi? Bu geri alınamaz.'))) return;
    session().then(function (s) {
      if (!s || !s.user) throw new Error('session');
      return global.sb.from('ai_conversations').delete().eq('user_id', s.user.id);
    }).then(function (r) {
      if (r && r.error) throw r.error;
      S.conversationId = null; S.convJournal = undefined; S.messages = []; save({ open: S.open, conversationId: null });
      toast(_t('aiCoach.set.deleted_all', 'Tüm sohbetler silindi.'), 'success');
    }).catch(function () { toast(_t('aiCoach.err.generic', 'AI şu an cevap veremedi. Birazdan tekrar dene.'), 'error'); });
  }

  // ---------------------------------------------------------------- history
  function showHistory() {
    setView('history'); texts();
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

  // ask(text): another component (the economic calendar) opens the coach with a question; it starts a new chat (a new
  // topic; the earlier one stays in the history) and is sent like a suggested question. While an answer is still coming,
  // the text waits in the box for the member to send.
  function askFromOutside(text) {
    if (!S.mounted) return false;
    text = String(text || '').trim().slice(0, MAX_MESSAGE);
    if (!text) return false;
    setOpen(true);
    if (S.pending) { R.input.value = text; autosize(); try { R.input.focus(); } catch (e) { /* ignore */ } return true; }
    // a conversation still loading ignores its result once the id changed (openConversation checks it)
    S.conversationId = null; S.convJournal = undefined; S.messages = []; clearImage();
    save({ open: S.open, conversationId: null });
    R.input.value = text; send();
    return true;
  }
  global.WwAiCoach = { open: function () { if (S.mounted) setOpen(true); }, close: function () { if (S.mounted) setOpen(false); }, ask: askFromOutside, coachName: coachName, setCoach: function (id) { setCoach(id); }, _md: md, _joinDictation: joinDictation };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { start(0); }); else start(0);
})(typeof window !== 'undefined' ? window : globalThis);
