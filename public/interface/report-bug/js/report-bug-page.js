// ============================================================
// HATA BİLDİR (REPORT-BUG) SAYFASI — sayfa script'i (report-bug-page.js)
// ============================================================
// Eskiden src/pages/report-bug.astro içinde satır içi <script is:inline> bloğuydu; HTML küçülsün, kod küçültülsün (minify)
// ve kalıcı önbelleğe (immutable, ?v=<içerik hash'i>) girsin diye buraya AYNEN taşındı.
// Sayfada bloğun eski yerinde yüklenir: <script src="/interface/report-bug/js/report-bug-page.js" is:inline data-page-script>.
// defer/async YOK: engelleyici klasik script olarak satır içiyle aynı anda çalışır (üstündeki DOM hazır, defer
// script'ler henüz çalışmadı). Üst seviye adlar global kalır (minify üst seviyeyi yeniden adlandırmaz).
// data-page-script ŞART: SPA router (SpaRouter.astro) bu dosyayı sayfaya her girişte yeniden çalıştırır, satır içi
// script'ler gibi. Bu yüzden üst seviyede const/let/class YAZMAYIN (ikinci girişte "already declared" hatası);
// var / function kullanın (tests/page-scripts.test.js kontrol eder).
// ============================================================
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Çeviri yardımcısı: anahtar henüz yüklenmediyse yedek metni döner
  function T(key, fallback, params) {
    var out = (window.i18n && window.i18n.t) ? window.i18n.t(key, params) : key;
    if (!out || out === key) {
      out = fallback || key;
      if (params) {
        Object.keys(params).forEach(function (p) {
          out = out.replace(new RegExp('\\{+' + p + '\\}+', 'g'), params[p]);
        });
      }
    }
    return out;
  }

  function currentLocale() {
    var lang = (window.i18n && window.i18n.getCurrentLanguage) ? window.i18n.getCurrentLanguage() : 'tr';
    return ({ tr: 'tr-TR', en: 'en-US', de: 'de-DE' })[lang] || 'tr-TR';
  }

  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  document.addEventListener('DOMContentLoaded', function () {
    // 1. Sistem Tanı Bilgilerini Tespit Et
    function detectSystemInfo() {
      var ua = navigator.userAgent;
      var browser = 'Diğer';
      if (ua.indexOf('Firefox') > -1) browser = 'Firefox';
      else if (ua.indexOf('SamsungBrowser') > -1) browser = 'Samsung';
      else if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) browser = 'Opera';
      else if (ua.indexOf('Trident') > -1) browser = 'IE';
      else if (ua.indexOf('Edge') > -1 || ua.indexOf('Edg') > -1) browser = 'Edge';
      else if (ua.indexOf('Chrome') > -1) browser = 'Chrome';
      else if (ua.indexOf('Safari') > -1) browser = 'Safari';

      var os = 'Bilinmiyor';
      if (ua.indexOf('Mac') > -1) os = 'macOS';
      else if (ua.indexOf('Win') > -1) os = 'Windows';
      else if (ua.indexOf('Linux') > -1) os = 'Linux';
      else if (ua.indexOf('Android') > -1) os = 'Android';
      else if (ua.indexOf('iPhone') > -1 || ua.indexOf('iPad') > -1) os = 'iOS';

      var res = window.screen.width + 'x' + window.screen.height;

      return { browser: browser, os: os, resolution: res, url: window.location.href };
    }

    var sysInfo = detectSystemInfo();

    // Dile bağlı, JS ile yazılan metinler (dil değişince tekrar çağrılır)
    function applyDynamicTexts() {
      var pasteKey = IS_MAC ? '⌘V' : 'Ctrl+V';
      var pasteEl = document.getElementById('paste-hint-text');
      if (pasteEl) pasteEl.textContent = T('bug_report.paste_hint', 'Görseli yapıştırın ({key}) veya sürükleyin', { key: pasteKey });

      var diagLabel = document.getElementById('diag-toggle-label');
      if (diagLabel) {
        diagLabel.title = T('bug_report.diag_tooltip', 'Gönderilecek: {os} · {browser} · {res}', {
          os: sysInfo.os, browser: sysInfo.browser, res: sysInfo.resolution
        });
      }

      var kbdEl = document.getElementById('submit-kbd-hint');
      if (kbdEl) {
        var sendKey = IS_MAC ? '⌘ Enter' : 'Ctrl Enter';
        var tpl = T('bug_report.submit_kbd', '{key} ile gönder', { key: '\u0000' });
        var parts = tpl.split('\u0000');
        kbdEl.textContent = '';
        kbdEl.appendChild(document.createTextNode(parts[0] || ''));
        var kbd = document.createElement('kbd');
        kbd.textContent = sendKey;
        kbdEl.appendChild(kbd);
        kbdEl.appendChild(document.createTextNode(parts[1] || ''));
      }

      var card = document.querySelector('#pane-compose .bug-card');
      if (card) card.setAttribute('data-drop-text', T('bug_report.drop_here', 'Görseli buraya bırakın'));
    }

    // 2. Tab Switcher (Sekme Yönetimi)
    var tabBtnCompose = document.getElementById('tab-btn-compose');
    var tabBtnHistory = document.getElementById('tab-btn-history');
    var paneCompose = document.getElementById('pane-compose');
    var paneHistory = document.getElementById('pane-history');
    var btnGotoCompose = document.getElementById('btn-goto-compose');

    function switchBugTab(target) {
      if (target === 'history') {
        if (paneCompose) paneCompose.style.display = 'none';
        if (paneHistory) paneHistory.style.display = 'block';
        if (tabBtnCompose) tabBtnCompose.classList.remove('active');
        if (tabBtnHistory) tabBtnHistory.classList.add('active');
      } else {
        if (paneCompose) paneCompose.style.display = 'block';
        if (paneHistory) paneHistory.style.display = 'none';
        if (tabBtnCompose) tabBtnCompose.classList.add('active');
        if (tabBtnHistory) tabBtnHistory.classList.remove('active');
      }
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    if (tabBtnCompose) tabBtnCompose.addEventListener('click', function() { switchBugTab('compose'); });
    if (tabBtnHistory) tabBtnHistory.addEventListener('click', function() { switchBugTab('history'); });
    if (btnGotoCompose) btnGotoCompose.addEventListener('click', function() { switchBugTab('compose'); });

    // 3. Bildirim Türü Seçimi + türe göre açıklama şablonu
    var typeChips = document.querySelectorAll('.type-chip-pill');
    var typeInput = document.getElementById('bug-type-input');
    var priorityGroup = document.getElementById('priority-group');
    var subjectInput = document.getElementById('bug-subject');
    var descTextarea = document.getElementById('bug-desc');

    var TEMPLATE_FALLBACK = {
      bug: 'Ne yaptım:\n1. \n\nNe bekliyordum:\n\nNe oldu:\n',
      perf: 'Hangi sayfada / işlemde:\n\nNe kadar sürüyor (yaklaşık):\n\nNe zamandan beri:\n',
      feature: 'Ne istiyorum:\n\nNeden işime yarar:\n'
    };
    function templateKind(type) {
      return type === 'feature' ? 'feature' : (type === 'perf' ? 'perf' : 'bug');
    }
    function getTemplate(type) {
      var kind = templateKind(type);
      return T('bug_report.tpl_' + kind, TEMPLATE_FALLBACK[kind]);
    }
    var lastInsertedTemplate = '';
    // Açıklama boş mu, ya da dokunulmamış bir şablon mu?
    function isUntouchedTemplate(text) {
      var v = (text || '').trim();
      if (!v) return true;
      if (lastInsertedTemplate && v === lastInsertedTemplate.trim()) return true;
      // Yüklü tüm dillerdeki şablonlar (dil değiştiyse eski dildeki şablon da "boş" sayılır)
      var loaded = (window.i18n && window.i18n.translations) ? window.i18n.translations : {};
      return ['bug', 'perf', 'feature'].some(function (k) {
        if (v === TEMPLATE_FALLBACK[k].trim()) return true;
        return Object.keys(loaded).some(function (lang) {
          var tpl = loaded[lang] && loaded[lang]['bug_report.tpl_' + k];
          return typeof tpl === 'string' && v === tpl.trim();
        });
      });
    }
    function applyTemplate(force) {
      if (!descTextarea) return;
      if (force || isUntouchedTemplate(descTextarea.value)) {
        lastInsertedTemplate = getTemplate(typeInput ? typeInput.value : 'ui');
        descTextarea.value = lastInsertedTemplate;
      }
    }

    function setType(type) {
      typeChips.forEach(function (c) { c.classList.toggle('active', c.getAttribute('data-type') === type); });
      if (typeInput) typeInput.value = type;
      // Öneride öncelik sormak anlamsız: alanı gizle
      if (priorityGroup) priorityGroup.hidden = (type === 'feature');
      applyTemplate(false);
      updateSubmitState();
    }

    typeChips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        setType(chip.getAttribute('data-type'));
        saveDraft();
      });
    });

    // 4. Öncelik Seçimi + açıklama satırı
    var priorityChips = document.querySelectorAll('.priority-chip');
    var priorityInput = document.getElementById('bug-priority-input');
    var priorityHint = document.getElementById('priority-hint');
    var HINT_FALLBACK = {
      'bug_report.prio_low_hint': 'Kozmetik bir sorun, kullanımı etkilemiyor.',
      'bug_report.prio_med_hint': 'Kullanımı etkiliyor ama devam edebiliyorum.',
      'bug_report.prio_high_hint': 'Kritik — işlem yapamıyorum.'
    };

    function setPriority(value) {
      priorityChips.forEach(function (c) {
        var on = c.getAttribute('data-priority') === value;
        c.classList.toggle('active', on);
        if (on && priorityHint) {
          var hintKey = c.getAttribute('data-hint');
          priorityHint.setAttribute('data-i18n', hintKey);
          priorityHint.textContent = T(hintKey, HINT_FALLBACK[hintKey]);
        }
      });
      if (priorityInput) priorityInput.value = value;
    }

    priorityChips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        setPriority(chip.getAttribute('data-priority'));
        saveDraft();
      });
    });

    // Gönder butonu: zorunlu alanlar dolana kadar pasif
    var submitBtnEl = document.getElementById('submit-bug-btn');
    function isFormFilled() {
      var subject = (subjectInput && subjectInput.value || '').trim();
      var desc = descTextarea ? descTextarea.value : '';
      return subject.length > 0 && !isUntouchedTemplate(desc);
    }
    function updateSubmitState() {
      if (!submitBtnEl || isUserBanned) return;
      submitBtnEl.disabled = !isFormFilled();
    }

    // Taslak: yazılanlar sayfadan çıkınca kaybolmasın (yalnız bu tarayıcıda)
    var DRAFT_KEY = 'ww_bug_report_draft';
    var draftTimer = null;
    function saveDraft() {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(function () {
        try {
          var subject = subjectInput ? subjectInput.value : '';
          var desc = descTextarea ? descTextarea.value : '';
          if (!subject.trim() && isUntouchedTemplate(desc)) {
            localStorage.removeItem(DRAFT_KEY);
            return;
          }
          localStorage.setItem(DRAFT_KEY, JSON.stringify({
            type: typeInput ? typeInput.value : 'ui',
            priority: priorityInput ? priorityInput.value : 'medium',
            subject: subject,
            desc: desc,
            ts: Date.now()
          }));
        } catch (e) {}
      }, 400);
    }
    function clearDraft() {
      clearTimeout(draftTimer);
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    }
    function restoreDraft() {
      var draft = null;
      try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) {}
      // 7 günden eski taslakları at
      if (!draft || !draft.ts || Date.now() - draft.ts > 7 * 864e5) {
        clearDraft();
        return false;
      }
      setType(draft.type || 'ui');
      setPriority(draft.priority || 'medium');
      if (subjectInput) subjectInput.value = draft.subject || '';
      if (descTextarea && typeof draft.desc === 'string') descTextarea.value = draft.desc;
      updateSubmitState();
      return true;
    }

    if (subjectInput) subjectInput.addEventListener('input', function () { updateSubmitState(); saveDraft(); });
    if (descTextarea) descTextarea.addEventListener('input', function () { updateSubmitState(); saveDraft(); });

    // 5. Dosya Yükleme & Pano (Paste) Desteği
    var triggerUploadBtn = document.getElementById('btn-trigger-upload');
    var fileInput = document.getElementById('bug-file-input');
    var previewWrap = document.getElementById('selected-file-preview');
    var fileNameSpan = document.getElementById('selected-file-name');
    var removeFileBtn = document.getElementById('btn-remove-file');
    var selectedFile = null;
    var ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

    if (triggerUploadBtn && fileInput) {
      triggerUploadBtn.addEventListener('click', function() { fileInput.click(); });
      fileInput.addEventListener('change', function() {
        if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
      });
    }

    // Formun herhangi bir yerine Ctrl+V / ⌘V ile görsel yapıştırma
    var bugFormEl = document.getElementById('bug-report-form');
    if (bugFormEl) {
      bugFormEl.addEventListener('paste', function(e) {
        if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
          var item = e.clipboardData.files[0];
          if (item.type.indexOf('image/') === 0) {
            e.preventDefault();
            if (handleFile(item) && typeof showToast === 'function') {
              showToast(T('bug_report.screenshot_added', 'Ekran görüntüsü eklendi'), 'info');
            }
          }
        }
      });
    }

    // Sürükle-bırak: görsel kartın herhangi bir yerine bırakılabilir
    var composeCard = document.querySelector('#pane-compose .bug-card');
    if (composeCard) {
      var dragDepth = 0;
      var hasFiles = function (e) {
        return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1;
      };
      composeCard.addEventListener('dragenter', function (e) {
        if (!hasFiles(e) || isUserBanned) return;
        e.preventDefault();
        dragDepth++;
        composeCard.classList.add('is-dragging');
      });
      composeCard.addEventListener('dragover', function (e) {
        if (!hasFiles(e) || isUserBanned) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      });
      composeCard.addEventListener('dragleave', function (e) {
        if (!hasFiles(e)) return;
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) composeCard.classList.remove('is-dragging');
      });
      composeCard.addEventListener('drop', function (e) {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth = 0;
        composeCard.classList.remove('is-dragging');
        if (isUserBanned) return;
        var file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file && handleFile(file) && typeof showToast === 'function') {
          showToast(T('bug_report.screenshot_added', 'Ekran görüntüsü eklendi'), 'info');
        }
      });
    }

    var currentScreenshotDataUrl = null;

    // Base64 -> Blob Dönüştürücü (Supabase Storage'a 5-10MB yerine 60-80KB yüklemek için)
    function dataUrlToBlob(dataUrl) {
      try {
        var parts = dataUrl.split(',');
        var mime = parts[0].match(/:(.*?);/)[1] || 'image/jpeg';
        var bstr = atob(parts[1]);
        var n = bstr.length;
        var u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
      } catch (e) {
        return null;
      }
    }

    // Görsel Sıkıştırma / Optimize Etme (Supabase kotasını korumak için max 1280px & %76 kalite)
    async function compressImageFile(file, maxWidth, quality) {
      maxWidth = maxWidth || 1280;
      quality = quality || 0.76;
      return new Promise(function(resolve) {
        var reader = new FileReader();
        reader.onload = function(e) {
          var img = new Image();
          img.onload = function() {
            var w = img.width;
            var h = img.height;
            if (w > maxWidth) {
              h = Math.round((h * maxWidth) / w);
              w = maxWidth;
            }
            var canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            var dataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(dataUrl);
          };
          img.onerror = function() {
            resolve(e.target.result);
          };
          img.src = e.target.result;
        };
        reader.onerror = function() {
          resolve(null);
        };
        reader.readAsDataURL(file);
      });
    }

    function handleFile(file) {
      if (!file) return false;
      if (ALLOWED_IMAGE_TYPES.indexOf(file.type) === -1) {
        var typeMsg = T('bug_report.err_image_only', 'Yalnızca PNG, JPG veya WEBP görsel ekleyebilirsiniz.');
        if (typeof showToast === 'function') showToast(typeMsg, 'error');
        else alert(typeMsg);
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        var msg = T('bug_report.err_filesize', 'Dosya boyutu en fazla 10MB olabilir.');
        if (typeof showToast === 'function') showToast(msg, 'error');
        else alert(msg);
        return false;
      }
      selectedFile = file;
      if (fileNameSpan) fileNameSpan.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
      
      var reader = new FileReader();
      reader.onload = function(ev) {
        currentScreenshotDataUrl = ev.target.result;
        var thumb = document.getElementById('selected-file-thumb');
        var icon = document.getElementById('selected-file-icon');
        if (thumb) {
          thumb.src = ev.target.result;
          thumb.style.display = 'inline-block';
        }
        if (icon) icon.style.display = 'none';
      };
      reader.readAsDataURL(file);

      if (previewWrap) previewWrap.style.display = 'inline-flex';
      if (triggerUploadBtn) triggerUploadBtn.style.display = 'none';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      return true;
    }

    if (removeFileBtn) {
      removeFileBtn.addEventListener('click', function () {
        selectedFile = null;
        currentScreenshotDataUrl = null;
        var thumb = document.getElementById('selected-file-thumb');
        var icon = document.getElementById('selected-file-icon');
        if (thumb) {
          thumb.src = '';
          thumb.style.display = 'none';
        }
        if (icon) icon.style.display = 'inline-block';
        if (fileInput) fileInput.value = '';
        if (previewWrap) previewWrap.style.display = 'none';
        if (triggerUploadBtn) triggerUploadBtn.style.display = 'inline-flex';
      });
    }

    var isUserBanned = false;
    var currentUser = null;

    function getSb() {
      return (typeof window !== 'undefined' && window.sb) ? window.sb : null;
    }

    // 6. Destek Canlı Durumu
    async function loadLiveSupportStatus() {
      var sb = getSb();
      var chip = document.getElementById('support-status-chip');
      var text = document.getElementById('support-status-text');
      if (!chip || !text || !sb) return;

      try {
        var { data } = await sb
          .from('system_settings')
          .select('value')
          .eq('key', 'support_status')
          .maybeSingle();

        if (data && data.value) {
          var val = data.value;
          var status = val.status || 'online';
          if (['online', 'busy', 'offline', 'maintenance'].indexOf(status) === -1) status = 'online';

          // Etiketler kullanıcının dilinde; admin'in yazdığı not varsa üzerine gelince görünür
          var eta = document.getElementById('support-status-eta');
          chip.setAttribute('data-status', status);
          text.setAttribute('data-i18n', 'bug_report.support_s_' + status);
          text.textContent = T('bug_report.support_s_' + status, text.textContent);
          if (eta) {
            eta.setAttribute('data-i18n', 'bug_report.support_eta_' + status);
            eta.textContent = T('bug_report.support_eta_' + status, eta.textContent);
          }
          chip.title = val.note || '';
        }
      } catch (e) {
        console.warn('loadLiveSupportStatus hatası:', e);
      }
    }

    // 7. Kullanıcı Engeli Kontrolü & Biletleri Yükleme
    async function checkBanAndLoadTickets() {
      var sb = getSb();
      var userId = null;
      var userEmail = null;

      if (sb) {
        try {
          var { data: authData } = await sb.auth.getUser();
          currentUser = (authData && authData.user) ? authData.user : null;
          userId = currentUser ? currentUser.id : null;
          userEmail = currentUser ? currentUser.email : null;
        } catch (e) {}
      }

      // Engel kontrolü
      var banFound = null;
      if (sb && (userId || userEmail)) {
        try {
          var query = sb.from('support_bans').select('*');
          if (userId && userEmail) {
            query = query.or(`user_id.eq.${userId},user_email.eq.${userEmail}`);
          } else if (userId) {
            query = query.eq('user_id', userId);
          } else {
            query = query.eq('user_email', userEmail);
          }

          var { data: banData, error: banErr } = await query.maybeSingle();
          if (!banErr && banData) {
            banFound = banData;
          }
        } catch (e) {}

        if (!banFound) {
          try {
            var { data: fbData } = await sb.from('system_settings').select('value').eq('key', 'support_bans').maybeSingle();
            if (fbData && fbData.value && Array.isArray(fbData.value)) {
              banFound = fbData.value.find(function(b) {
                return (userId && b.user_id === userId) || (userEmail && b.user_email === userEmail);
              });
            }
          } catch (e) {}
        }
      }

      if (banFound) {
        isUserBanned = true;
        var alertBox = document.getElementById('banned-alert-box');
        var formEl = document.getElementById('bug-report-form');
        var reasonSpan = document.getElementById('banned-reason-display');
        
        if (reasonSpan) reasonSpan.textContent = banFound.reason || 'Sistem kurallarına aykırı bildirim gönderimi.';
        if (alertBox) alertBox.style.display = 'flex';
        if (formEl) {
          formEl.style.display = 'none';
          var inputs = formEl.querySelectorAll('input, textarea, button');
          inputs.forEach(function(el) { el.disabled = true; });
        }
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      }

      await loadUserTickets(userId, userEmail);
    }

    async function loadUserTickets(userId, userEmail) {
      var sb = getSb();
      var stream = document.getElementById('tickets-stream');
      var tabCountBadge = document.getElementById('tab-count-badge');
      var countAllEl = document.getElementById('count-all');
      var countAnsweredEl = document.getElementById('count-answered');
      var countPendingEl = document.getElementById('count-pending');
      var countRejectedEl = document.getElementById('count-rejected');
      if (!stream) return;

      var userTickets = [];

      // 1. Supabase'den çek
      if (sb && (userId || userEmail)) {
        try {
          var query = sb.from('bug_reports').select('*').order('created_at', { ascending: false }).limit(40);
          if (userId && userEmail) {
            query = query.or(`user_id.eq.${userId},user_email.eq.${userEmail}`);
          } else if (userId) {
            query = query.eq('user_id', userId);
          } else {
            query = query.eq('user_email', userEmail);
          }

          var { data, error } = await query;
          if (!error && data && data.length > 0) {
            userTickets = data;
          }
        } catch (e) {}

        if (userTickets.length === 0) {
          try {
            var { data: fbData } = await sb.from('system_settings').select('value').eq('key', 'bug_reports_stream').maybeSingle();
            if (fbData && fbData.value && Array.isArray(fbData.value)) {
              userTickets = fbData.value.filter(function(r) {
                return (userId && r.user_id === userId) || (userEmail && r.user_email === userEmail);
              });
            }
          } catch(e) {}
        }
      }

      // 2. Lokal tarayıcı kayıtlarıyla birleştir
      try {
        var localList = JSON.parse(localStorage.getItem('my_bug_reports') || '[]');
        if (Array.isArray(localList) && localList.length > 0) {
          localList.forEach(function(localItem) {
            var exists = userTickets.some(function(t) {
              return (localItem.id && t.id === localItem.id) ||
                     (localItem.subject === t.subject && localItem.description === t.description);
            });
            if (!exists) {
              userTickets.push(localItem);
            }
          });
        }
      } catch (e) {}

      // Tarihe göre sırala
      userTickets.sort(function(a, b) {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });

      // Sayaçları güncelle
      var answeredCount = userTickets.filter(function(t) { return t.status === 'answered' || t.status === 'closed'; }).length;
      var rejectedCount = userTickets.filter(function(t) { return t.status === 'rejected'; }).length;
      var pendingCount = userTickets.filter(function(t) { return t.status !== 'answered' && t.status !== 'closed' && t.status !== 'rejected'; }).length;

      if (countAllEl) countAllEl.textContent = userTickets.length;
      if (countAnsweredEl) countAnsweredEl.textContent = answeredCount;
      if (countPendingEl) countPendingEl.textContent = pendingCount;
      if (countRejectedEl) countRejectedEl.textContent = rejectedCount;
      if (tabCountBadge) {
        tabCountBadge.textContent = userTickets.length;
        tabCountBadge.hidden = userTickets.length === 0;
      }

      stream.innerHTML = '';

      // Sıfır bildirim varsa temiz Empty State
      if (userTickets.length === 0) {
        stream.innerHTML = `
          <div class="tickets-empty">
            <div class="empty-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2"></rect>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
              </svg>
            </div>
            <p class="empty-title" data-i18n="bug_report.empty_title">${escapeHtml(T('bug_report.empty_title', 'Henüz bir bildiriminiz yok'))}</p>
            <p class="empty-desc" data-i18n="bug_report.empty_desc">${escapeHtml(T('bug_report.empty_desc', 'Bir hata veya öneri ilettiğinizde burada görünür; ekibimizin yanıtları da buraya düşer.'))}</p>
            <button type="button" class="btn-empty-compose" id="btn-empty-create">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span data-i18n="bug_report.tab_new">${escapeHtml(T('bug_report.tab_new', 'Yeni Bildirim'))}</span>
            </button>
          </div>
        `;

        var btnEmptyCreate = document.getElementById('btn-empty-create');
        if (btnEmptyCreate) {
          btnEmptyCreate.addEventListener('click', function() { switchBugTab('compose'); });
        }
        return;
      }

      var typeFallback = {
        ui: 'Arayüz',
        chart: 'Grafik & Hesap',
        trade: 'İşlem & Veri',
        perf: 'Performans',
        feature: 'Öneri'
      };
      function categoryLabel(cat) {
        return typeFallback[cat] ? T('bug_report.type_' + cat, typeFallback[cat]) : T('bug_report.category_default', 'Bildirim');
      }
      var locale = currentLocale();
      var lblRejected = escapeHtml(T('bug_report.status_rejected', 'Reddedildi'));
      var lblAnswered = escapeHtml(T('bug_report.status_answered', 'Yanıtlandı'));
      var lblInReview = escapeHtml(T('bug_report.status_in_progress', 'İnceleniyor'));
      var lblShot = escapeHtml(T('bug_report.view_screenshot', 'Ekran görüntüsü'));
      var lblFull = escapeHtml(T('bug_report.view_full', 'Tam boyutta incele ↗'));

      userTickets.forEach(function(t) {
        var isRejected = (t.status === 'rejected');
        var isAnswered = (t.status === 'answered' || t.status === 'closed');
        var dateStr = t.created_at ? new Date(t.created_at).toLocaleString(locale, { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';
        var card = document.createElement('div');
        card.className = 'ticket-card';
        card.setAttribute('data-status', isRejected ? 'rejected' : (isAnswered ? 'answered' : 'pending'));

        var statusBadgeHtml = '';
        if (isRejected) {
          statusBadgeHtml = `<span class="tag-status rejected"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg><span>${lblRejected}</span></span>`;
        } else if (isAnswered) {
          statusBadgeHtml = `<span class="tag-status answered"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>${lblAnswered}</span></span>`;
        } else {
          statusBadgeHtml = `<span class="tag-status in_progress"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>${lblInReview}</span></span>`;
        }

        var screenshotHtml = '';
        var rawUrl = (t.screenshot_url || '').trim();
        var isValidImgUrl = /^(https?:\/\/|data:image\/(png|jpeg|jpg|webp|gif);base64,)/i.test(rawUrl);
        if (isValidImgUrl) {
          var safeImgUrl = escapeHtml(rawUrl);
          screenshotHtml = `
            <div class="ticket-screenshot-wrap">
              <a href="${safeImgUrl}" target="_blank" rel="noopener noreferrer" class="ticket-screenshot-thumb">
                <img src="${safeImgUrl}" alt="${lblShot}" style="width:36px; height:36px; object-fit:cover; border-radius:6px; border:1px solid rgba(255,255,255,0.1); background:#000;" />
                <div style="display:flex; flex-direction:column; gap:2px;">
                  <span style="font-size:11.5px; font-weight:700; color:var(--accent2, var(--ac-p1)); display:inline-flex; align-items:center; gap:4px;">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    ${lblShot}
                  </span>
                  <span style="font-size:10.5px; color:var(--muted, #a0a0b8);">${lblFull}</span>
                </div>
              </a>
            </div>
          `;
        }

        var cardHtml = `
          <div class="ticket-header">
            <div class="ticket-tags">
              <span class="tag-category">${escapeHtml(categoryLabel(t.category))}</span>
              ${statusBadgeHtml}
            </div>
            <span class="ticket-date">${dateStr}</span>
          </div>
          <h3 class="ticket-title">${escapeHtml(t.subject || '')}</h3>
          <p class="ticket-body">${escapeHtml(t.description || '')}</p>
          ${screenshotHtml}
        `;

        if (t.admin_reply) {
          var replyDate = t.replied_at ? new Date(t.replied_at).toLocaleString(locale, { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';
          var adminLabel = isRejected
            ? T('bug_report.reject_reason', 'Reddetme gerekçesi')
            : (t.replied_by || T('bug_report.admin_team', 'Wawe Journal Ekibi (Admin)'));
          cardHtml += `
            <div class="admin-response-box ${isRejected ? 'rejected' : ''}">
              <div class="admin-response-top">
                <span class="admin-name-badge">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
                  <span>${escapeHtml(adminLabel)}</span>
                </span>
                <span class="admin-response-time">${replyDate}</span>
              </div>
              <p class="admin-response-text">${escapeHtml(t.admin_reply)}</p>
            </div>
          `;
        }

        card.innerHTML = cardHtml;
        stream.appendChild(card);
      });

      // Aktif filtre kontrolü
      var activeFilterBtn = document.querySelector('.filter-pill-btn.active');
      if (activeFilterBtn) {
        var currentFilter = activeFilterBtn.getAttribute('data-filter');
        if (currentFilter && currentFilter !== 'all') {
          var currentCards = stream.querySelectorAll('.ticket-card');
          currentCards.forEach(function(c) {
            if (c.getAttribute('data-status') === currentFilter) c.style.display = 'flex';
            else c.style.display = 'none';
          });
        }
      }
    }

    // 8. Filtre Butonları
    var filterBtns = document.querySelectorAll('.filter-pill-btn');
    filterBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        filterBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var filter = btn.getAttribute('data-filter');
        var currentCards = document.querySelectorAll('.ticket-card');
        currentCards.forEach(function(card) {
          if (filter === 'all' || card.getAttribute('data-status') === filter) {
            card.style.display = 'flex';
          } else {
            card.style.display = 'none';
          }
        });
      });
    });

    // 9. Form Gönderimi
    var form = document.getElementById('bug-report-form');
    var submitBtn = document.getElementById('submit-bug-btn');
    var btnText = document.getElementById('btn-text');

    if (form) {
      form.addEventListener('submit', async function (e) {
        e.preventDefault();

        if (isUserBanned) {
          var banMsg = T('bug_report.banned_toast', 'Hata bildirme yetkiniz askıya alınmış. Yeni bildirim gönderemezsiniz.');
          if (typeof showToast === 'function') showToast(banMsg, 'error');
          else alert(banMsg);
          return;
        }
        if (submitBtn && submitBtn.classList.contains('loading')) return;

        var subject = (document.getElementById('bug-subject')?.value || '').trim();
        var desc = (document.getElementById('bug-desc')?.value || '').trim();
        var type = typeInput ? typeInput.value : 'ui';
        // Öneride öncelik alanı gizli: aciliyeti "düşük" say
        var priority = type === 'feature' ? 'low' : (priorityInput ? priorityInput.value : 'medium');
        var includeSys = document.getElementById('include-system-info')?.checked;

        if (!subject || isUntouchedTemplate(desc)) {
          var reqMsg = (window.i18n && window.i18n.t) ? window.i18n.t('bug_report.err_required') : 'Lütfen konu başlığı ve açıklama alanlarını doldurunuz.';
          if (typeof showToast === 'function') showToast(reqMsg, 'error');
          else alert(reqMsg);
          return;
        }

        if (submitBtn) {
          submitBtn.classList.add('loading');
          if (btnText) {
            btnText.textContent = (window.i18n && window.i18n.t) ? window.i18n.t('bug_report.btn_submitting') : 'Gönderiliyor...';
          }
        }

        var sb = getSb();
        var userId = currentUser ? currentUser.id : null;
        var userEmail = currentUser ? currentUser.email : '';
        var userName = (currentUser && currentUser.user_metadata && currentUser.user_metadata.username) ? currentUser.user_metadata.username : (userEmail ? userEmail.split('@')[0] : 'Trader');

        // Görsel Yükleme / Sıkıştırma İşlemi
        var screenshotUrl = null;
        if (selectedFile) {
          if (btnText) btnText.textContent = T('bug_report.uploading_image', 'Görsel yükleniyor...');
          try {
            var compressedDataUrl = await compressImageFile(selectedFile, 1280, 0.76);
            var blobToUpload = (compressedDataUrl && dataUrlToBlob(compressedDataUrl)) || selectedFile;

            // 1. Supabase Storage yüklemeyi dene (Sadece 50-80 KB ultra hafif dosya yüklenir)
            if (sb && sb.storage) {
              var fileName = 'bug_' + Date.now() + '_' + Math.random().toString(36).substring(7) + '.jpg';
              var storagePath = 'screenshots/' + fileName;

              var buckets = ['bug-reports', 'references-images', 'avatars'];
              for (var b = 0; b < buckets.length; b++) {
                try {
                  var bucket = buckets[b];
                  var { error: upErr } = await sb.storage.from(bucket).upload(storagePath, blobToUpload, {
                    contentType: 'image/jpeg',
                    cacheControl: '31536000',   // adı benzersiz, içerik değişmez: 1 yıl (eskiden 1 saat)
                    upsert: true
                  });
                  if (!upErr) {
                    var { data: pubData } = sb.storage.from(bucket).getPublicUrl(storagePath);
                    if (pubData && pubData.publicUrl) {
                      screenshotUrl = pubData.publicUrl;
                      break;
                    }
                  }
                } catch(e) {}
              }
            }

            // 2. Storage bucket yoksa veya izin verilmediyse Base64 Data URL kullan (100% garantili)
            if (!screenshotUrl && compressedDataUrl) {
              screenshotUrl = compressedDataUrl;
            } else if (!screenshotUrl && currentScreenshotDataUrl) {
              screenshotUrl = currentScreenshotDataUrl;
            }
          } catch(err) {
            console.warn('Screenshot upload exception:', err);
            if (currentScreenshotDataUrl) screenshotUrl = currentScreenshotDataUrl;
          }
        }

        var payload = {
          user_id: userId,
          user_email: userEmail,
          user_name: userName,
          category: type,
          priority: priority,
          subject: subject,
          description: desc,
          system_info: includeSys ? sysInfo : {},
          screenshot_url: screenshotUrl,
          status: 'pending',
          created_at: new Date().toISOString()
        };

        var savedReport = null;

        if (sb) {
          try {
            var { data, error } = await sb.from('bug_reports').insert([payload]).select();
            if (!error && data && data[0]) {
              savedReport = data[0];
            } else {
              var { data: fbData } = await sb.from('system_settings').select('value').eq('key', 'bug_reports_stream').maybeSingle();
              var streamArr = (fbData && fbData.value && Array.isArray(fbData.value)) ? fbData.value : [];
              payload.id = 'report-' + Date.now();
              streamArr.unshift(payload);
              if (streamArr.length > 50) streamArr = streamArr.slice(0, 50);
              await sb.from('system_settings').upsert({
                key: 'bug_reports_stream',
                value: streamArr,
                updated_at: new Date().toISOString()
              });
              savedReport = payload;
            }
          } catch(err) {
            console.warn('bug report submission exception:', err);
            payload.id = 'report-' + Date.now();
            savedReport = payload;
          }
        } else {
          payload.id = 'report-' + Date.now();
          savedReport = payload;
        }

        if (savedReport) {
          try {
            var localList = JSON.parse(localStorage.getItem('my_bug_reports') || '[]');
            localList.unshift(savedReport);
            localStorage.setItem('my_bug_reports', JSON.stringify(localList));
          } catch (e) {}
        }

        if (submitBtn) submitBtn.classList.remove('loading');
        if (btnText) {
          btnText.textContent = (window.i18n && window.i18n.t) ? window.i18n.t('bug_report.btn_submit') : 'Hata Raporunu Gönder';
        }

        // Formu temizle (tür/öncelik varsayılana döner, taslak silinir)
        form.reset();
        if (removeFileBtn) removeFileBtn.click();
        clearDraft();
        setType('ui');
        setPriority('medium');
        applyTemplate(true);
        updateSubmitState();

        // Biletleri yeniden yükle
        await loadUserTickets(userId, userEmail);

        // Kullanıcıyı otomatik olarak "Bildirimlerim" sekmesine geçir
        switchBugTab('history');

        if (typeof showToast === 'function') {
          var rawId = savedReport && savedReport.id != null ? String(savedReport.id) : '';
          var shortId = /^\d+$/.test(rawId) ? rawId : rawId.replace(/^report-/, '').replace(/-/g, '').slice(-6).toUpperCase();
          showToast(shortId
            ? T('bug_report.sent_id', 'Bildiriminiz iletildi · #{id}', { id: shortId })
            : T('bug_report.success_title', 'Raporunuz başarıyla iletildi!'), 'success');
        }
      });

      // Ctrl+Enter / ⌘+Enter ile gönder
      form.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          if (submitBtn && !submitBtn.disabled) {
            if (form.requestSubmit) form.requestSubmit(submitBtn);
            else submitBtn.click();
          }
        }
      });
    }

    // İlk durum: taslak varsa geri yükle, yoksa türün şablonunu koy
    applyDynamicTexts();
    var draftRestored = restoreDraft();
    if (!draftRestored) applyTemplate(false);
    updateSubmitState();
    if (draftRestored && typeof showToast === 'function') {
      setTimeout(function () { showToast(T('bug_report.draft_restored', 'Kaydedilmemiş taslağınız geri yüklendi'), 'info'); }, 300);
    }

    // Çeviriler yüklenince / dil değişince JS metinlerini ve dokunulmamış şablonu yenile
    function onLangReady() {
      applyDynamicTexts();
      applyTemplate(false);
      updateSubmitState();
    }
    if (window.i18nReady && typeof window.i18nReady.then === 'function') window.i18nReady.then(onLangReady);
    if (window.i18n && typeof window.i18n.onChange === 'function') {
      window.i18n.onChange(function () {
        onLangReady();
        loadUserTickets(currentUser ? currentUser.id : null, currentUser ? currentUser.email : null);
      });
    }

    // Canlı durum ve kullanıcı biletlerini başlat
    loadLiveSupportStatus();
    checkBanAndLoadTickets();

    if (typeof loadNavbar === 'function') {
      try { loadNavbar('navbar-container'); } catch (e) {}
    }

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  });
