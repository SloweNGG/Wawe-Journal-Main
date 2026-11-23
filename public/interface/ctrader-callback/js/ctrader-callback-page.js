// ============================================================
// CTRADER BAĞLANTI DÖNÜŞÜ (CTRADER-CALLBACK) SAYFASI — sayfa script'i (ctrader-callback-page.js)
// ============================================================
// Eskiden src/pages/ctrader-callback.astro içinde satır içi <script is:inline> bloğuydu; HTML küçülsün, kod küçültülsün (minify)
// ve kalıcı önbelleğe (immutable, ?v=<içerik hash'i>) girsin diye buraya AYNEN taşındı.
// Sayfada bloğun eski yerinde yüklenir: <script src="/interface/ctrader-callback/js/ctrader-callback-page.js" is:inline>.
// defer/async YOK: engelleyici klasik script olarak satır içiyle aynı anda çalışır (üstündeki DOM hazır, defer
// script'ler henüz çalışmadı). Üst seviye adlar global kalır (minify üst seviyeyi yeniden adlandırmaz).
// Sayfa SPA değil (her açılış tam yükleme), bu yüzden data-page-script gerekmez.
// ============================================================
    (async function initCallback() {
      var titleEl = document.getElementById('callback-title');
      var descEl = document.getElementById('callback-desc');
      var badgeEl = document.getElementById('status-badge');
      var iconContainer = document.getElementById('icon-container');
      var actionContainer = document.getElementById('action-container');
      var actionBtn = document.getElementById('action-btn');
      var panel = document.getElementById('cb-panel');

      var ICON_OK = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
      var ICON_ERR = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
      var ICON_WARN = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      var ICON_LINK = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
      var SPINNER = '<div class="callback-spinner"></div>';

      // i18n: anahtar yoksa yedek metin; {x} yer tutucuları doldurulur
      function tt(key, fallback, params) {
        var v = fallback;
        try {
          var r = window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t(key, params) : key;
          if (r && r !== key) v = r;
        } catch (e) {}
        if (params) for (var k in params) v = String(v).split('{' + k + '}').join(String(params[k]));
        return v;
      }
      function esc(x) {
        return String(x == null ? '' : x).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
      }
      function setState(kind, badge, title, desc) {
        badgeEl.className = 'status-badge ' + (kind === 'error' ? 'error' : kind === 'success' ? 'success' : 'loading');
        badgeEl.textContent = badge;
        titleEl.textContent = title;
        descEl.textContent = desc || '';
        descEl.style.display = desc ? '' : 'none';
        iconContainer.innerHTML = kind === 'error' ? ICON_ERR : kind === 'success' ? ICON_OK : kind === 'warn' ? ICON_WARN : kind === 'choose' ? ICON_LINK : SPINNER;
      }
      function showError(msg) {
        setState('error', tt('ctrader.cb.badge_failed', 'Bağlantı Başarısız'), tt('ctrader.cb.title_error', 'Bir Hata Oluştu'),
          msg || tt('ctrader.cb.err_generic', 'cTrader hesabı bağlanırken bir sorun oluştu.'));
        panel.style.display = 'none';
        actionContainer.style.display = 'block';
        actionBtn.textContent = tt('ctrader.cb.back', 'Hesaplarıma Geri Dön');
      }
      function accTitle(a) {
        return '<span class="cb-env ' + (a.is_live ? 'live' : 'demo') + '">' + (a.is_live ? 'LIVE' : 'DEMO') + '</span>' +
          esc((a.broker_name || 'cTrader') + ' #' + (a.trader_login || a.ctid_trader_account_id));
      }
      function accPlain(a) { return window.WwCtSync ? window.WwCtSync.accountLabel(a) : String(a.trader_login || a.ctid_trader_account_id); }

      var params = new URLSearchParams(window.location.search);
      var code = params.get('code');
      var error = params.get('error');
      var errorDesc = params.get('error_description');

      // ertelenmiş betikler (WwCtSync, window.journal, i18n) DOMContentLoaded'dan önce çalışır
      if (document.readyState === 'loading') {
        await new Promise(function(r) { document.addEventListener('DOMContentLoaded', r, { once: true }); });
      }
      if (window.i18nReady) { try { await Promise.race([window.i18nReady, new Promise(function(r) { setTimeout(r, 1500); })]); } catch (e) {} }

      if (error) {
        showError(errorDesc || error || tt('ctrader.cb.err_denied', 'cTrader yetkilendirmesi iptal edildi veya reddedildi.'));
        return;
      }
      if (!code) {
        showError(tt('ctrader.cb.err_no_code', 'URL içinde yetkilendirme kodu (code) bulunamadı.'));
        return;
      }

      var attempts = 0;
      while ((!window.sb || !window.sb.auth) && attempts < 25) {
        await new Promise(function(r) { setTimeout(r, 100); });
        attempts++;
      }
      if (!window.sb || !window.sb.auth) {
        showError(tt('ctrader.cb.err_db', 'Veritabanı bağlantısı başlatılamadı. Lütfen sayfayı yenileyin.'));
        return;
      }

      var sessionRes = await window.sb.auth.getSession();
      var session = sessionRes && sessionRes.data && sessionRes.data.session;
      if (!session) {
        showError(tt('ctrader.cb.err_no_session', 'Oturumunuz bulunamadı. Lütfen önce giriş yapın.'));
        setTimeout(function() {
          window.location.href = '/login?redirect=' + encodeURIComponent(window.location.href);
        }, 1500);
        return;
      }

      descEl.textContent = tt('ctrader.cb.fetching', 'cTrader ile hesap bilgileri alınıyor...');

      var result;
      try {
        var ep = window.WwCtSync ? window.WwCtSync.endpoint() : { url: window.SUPABASE_URL, anonKey: window.SUPABASE_ANON_KEY };
        var redirectUri = (window.CTRADER_CONFIG && typeof window.CTRADER_CONFIG.getRedirectUri === 'function')
          ? window.CTRADER_CONFIG.getRedirectUri()
          : (window.location.origin + window.location.pathname);

        var response = await fetch(ep.url + '/functions/v1/ctrader-connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token, 'apikey': ep.anonKey },
          body: JSON.stringify({ code: code, redirectUri: redirectUri })
        });
        result = await response.json();
        if (!response.ok || !result.success) {
          var errMsg = result.error || tt('ctrader.cb.err_generic', 'cTrader hesabı bağlanırken bir sorun oluştu.');
          if (/yetkilendirme kodu|invalid_grant|expired|grant_type/i.test(errMsg)) {
            errMsg += ' ' + tt('ctrader.cb.err_code_once', '(cTrader güvenlik kodları tek kullanımlıktır. Lütfen Hesaplar sayfasından yeniden bağlanmayı deneyin.)');
          }
          showError(errMsg);
          return;
        }
      } catch (err) {
        console.error('Callback error:', err);
        showError(tt('ctrader.cb.err_network', 'Sunucuya bağlanırken bir ağ hatası oluştu.') + ' ' + (err.message || ''));
        return;
      }

      // Kod tek kullanımlık: yenilemede tekrar gönderilmesin
      try { history.replaceState(null, '', window.location.pathname); } catch (e) {}

      var accounts = Array.isArray(result.accounts) ? result.accounts : [];
      var revoked = Array.isArray(result.revoked_accounts) ? result.revoked_accounts : [];
      var targetJournalId = null;
      try { targetJournalId = localStorage.getItem('ww_ctrader_target_journal'); } catch (e) {}

      if (!accounts.length) {
        showError(result.list_fetched === false
          ? tt('ctrader.cb.err_list', 'cTrader hesap listesi alınamadı. Birkaç dakika sonra Hesaplar sayfasından yeniden bağlanmayı deneyin.')
          : tt('ctrader.cb.err_no_accounts', 'cTrader hiçbir hesap için izin vermedi. Yetkilendirme ekranında en az bir hesabı işaretleyin.'));
        return;
      }

      // Defter adları (başka deftere bağlı hesapları göstermek ve yeni defter adlarını tekil yapmak için)
      var journals = [];
      try { if (window.journal && window.journal.listJournals) journals = await window.journal.listJournals(); } catch (e) {}
      var journalName = {};
      (journals || []).forEach(function(j) { journalName[j.id] = j.name; });
      if (targetJournalId && journals.length && !journalName[targetJournalId]) targetJournalId = null;   // defter silinmiş

      var revokedLinked = revoked.filter(function(a) { return a.journal_id; });
      var revokedNote = revokedLinked.length
        ? '<div class="cb-note">' + esc(tt('ctrader.cb.revoked_note',
            'Bu yetkilendirmede seçilmeyen hesaplar artık senkronlanmayacak: {list}. Bunlar için tekrar bağlanıp cTrader ekranında o hesapları da işaretleyin.',
            { list: revokedLinked.map(function(a) { return accPlain(a) + (journalName[a.journal_id] ? ' (' + journalName[a.journal_id] + ')' : ''); }).join(', ') })) + '</div>'
        : '';

      // Defter seçilmeden gelindiyse (ör. yeniden bağlanma): eşleme sorulmaz, sonuç gösterilir
      if (!targetJournalId) {
        setState('success', tt('ctrader.cb.badge_ok', 'Bağlandı'), tt('ctrader.cb.title_ok', 'cTrader Başarıyla Bağlandı!'),
          tt('ctrader.cb.ok_count', '{n} cTrader hesabına erişim verildi. Hesapları defterlere Hesaplarım sayfasından bağlayabilirsiniz.', { n: accounts.length }));
        panel.innerHTML = revokedNote;
        panel.style.display = revokedNote ? 'block' : 'none';
        actionContainer.style.display = 'block';
        actionBtn.textContent = tt('ctrader.cb.go_accounts', 'Hesaplarıma Git');
        if (!revokedNote) setTimeout(function() { window.location.href = '/journals'; }, 2500);
        return;
      }

      // ---------------------------------------------------------------- hesap seçimi
      var pre = window.WwCtSync ? window.WwCtSync.chooseAccount(accounts, targetJournalId) : null;
      var selectedId = pre ? pre.account.id : null;
      var targetName = journalName[targetJournalId] || tt('ctrader.cb.this_journal', 'bu defter');

      function renderChooser() {
        setState('choose', tt('ctrader.cb.badge_choose', 'Hesap Seçimi'), tt('ctrader.cb.title_choose', 'Hangi hesap bağlansın?'), '');
        var html = '<p class="cb-section-label">' + esc(tt('ctrader.cb.choose_label', '"{journal}" defterine bağlanacak cTrader hesabı:', { journal: targetName })) + '</p>';
        html += '<div class="cb-acc-list">';
        accounts.forEach(function(a) {
          var sub;
          if (a.journal_id === targetJournalId) sub = tt('ctrader.cb.acc_this', 'Zaten bu deftere bağlı');
          else if (a.journal_id) sub = tt('ctrader.cb.acc_other', 'Şu an "{journal}" defterine bağlı; seçerseniz oradan ayrılır', { journal: journalName[a.journal_id] || '?' });
          else sub = tt('ctrader.cb.acc_free', 'Hiçbir deftere bağlı değil');
          html += '<label class="cb-acc' + (a.id === selectedId ? ' selected' : '') + '">' +
            '<input type="radio" name="cb-acc" value="' + esc(a.id) + '"' + (a.id === selectedId ? ' checked' : '') + ' />' +
            '<span class="cb-acc-main"><span class="cb-acc-title">' + accTitle(a) + '</span><span class="cb-acc-sub">' + esc(sub) + '</span></span></label>';
        });
        html += '</div>';
        if (accounts.length > 1) {
          html += '<label class="cb-option"><input type="checkbox" id="cb-create-others" />' +
            '<span>' + esc(tt('ctrader.cb.create_others', 'Diğer hesaplar için ayrı defter oluştur')) +
            '<small>' + esc(tt('ctrader.cb.create_others_hint', 'Hiçbir deftere bağlı olmayan her hesap için "cTrader Demo #123456" adında yeni bir defter açılır ve işlemleri aktarılır. Plan limitiniz dolarsa durur.')) + '</small></span></label>';
        }
        var autoDefault = accounts.some(function(a) { return a.id === selectedId && a.auto_sync === true; });
        html += '<label class="cb-option"><input type="checkbox" id="cb-auto-sync"' + (autoDefault ? ' checked' : '') + ' />' +
          '<span>' + esc(tt('ctrader.cb.auto_sync', 'Siteye girdiğimde otomatik senkronla')) +
          '<small>' + esc(tt('ctrader.cb.auto_sync_hint', 'Siteyi açtığınızda son senkronun üzerinden 30 dakika geçmişse yeni kapanan işlemler arka planda aktarılır. Hesap kartından istediğiniz zaman kapatabilirsiniz.')) + '</small></span></label>';
        html += revokedNote;
        html += '<div class="cb-actions">' +
          '<button type="button" class="callback-btn" id="cb-go"' + (selectedId ? '' : ' disabled') + '>' + esc(tt('ctrader.cb.link_sync', 'Bağla ve İşlemleri Aktar')) + '</button>' +
          '<a href="/journals" class="callback-btn secondary">' + esc(tt('ctrader.cb.later', 'Sonra')) + '</a></div>';
        panel.innerHTML = html;
        panel.style.display = 'block';

        var goBtn = document.getElementById('cb-go');
        panel.querySelectorAll('input[name="cb-acc"]').forEach(function(r) {
          r.addEventListener('change', function() {
            selectedId = r.value;
            panel.querySelectorAll('.cb-acc').forEach(function(l) { l.classList.toggle('selected', l.contains(r)); });
            goBtn.disabled = false;
          });
        });
        goBtn.addEventListener('click', function() {
          if (!selectedId) return;
          var createOthers = !!(document.getElementById('cb-create-others') || {}).checked;
          var autoSync = !!(document.getElementById('cb-auto-sync') || {}).checked;
          runPlan(createOthers, autoSync);
        });
      }

      // ---------------------------------------------------------------- bağla, defter aç, senkronla
      function rpcData(res) {
        if (res && res.error) throw new Error(res.error.message || 'RPC error');
        return res ? res.data : null;
      }

      async function linkAccount(accId, journalId) {
        var d = rpcData(await window.sb.rpc('link_ctrader_account', { p_account_id: accId, p_journal_id: journalId }));
        if (!d || d.success !== true) throw new Error((d && d.error) || tt('ctrader.cb.err_link', 'Hesap deftere bağlanamadı.'));
      }

      function uniqueName(base) {
        var used = {};
        (journals || []).forEach(function(j) { used[String(j.name).toLowerCase()] = true; });
        var name = base, n = 2;
        while (used[name.toLowerCase()]) name = base + ' (' + (n++) + ')';
        journals.push({ name: name });
        return name;
      }

      async function runPlan(createOthers, autoSync) {
        var selected = accounts.filter(function(a) { return a.id === selectedId; })[0];
        var plan = [{ account: selected, journalId: targetJournalId, journalName: targetName }];
        var lines = [];

        panel.innerHTML = '';
        setState('loading', tt('ctrader.cb.badge_working', 'Aktarılıyor'), tt('ctrader.cb.title_working', 'Hesaplar bağlanıyor'),
          tt('ctrader.cb.linking', 'Hesap deftere bağlanıyor...'));

        // 1) diğer hesaplar için defter (yalnızca hiçbir deftere bağlı olmayanlar; seçilen hesap hariç)
        if (createOthers && !(window.journal && typeof window.journal.createJournal === 'function')) {
          lines.push(['warn', tt('ctrader.cb.err_create', 'Defter oluşturulamadı.')]);
        }
        if (createOthers && window.journal && typeof window.journal.createJournal === 'function') {
          var others = accounts.filter(function(a) { return a.id !== selectedId && !a.journal_id; });
          for (var i = 0; i < others.length; i++) {
            var a = others[i];
            var name = uniqueName('cTrader ' + (a.is_live ? 'Live' : 'Demo') + ' #' + (a.trader_login || a.ctid_trader_account_id));
            descEl.textContent = tt('ctrader.cb.creating', '"{name}" defteri oluşturuluyor...', { name: name });
            try {
              var created = await window.journal.createJournal({ name: name, description: (a.broker_name || 'cTrader') + ' · cTrader', color: '#8B5CF6', icon: 'folder', trade_scope: 'live' });
              var newId = Array.isArray(created) ? (created[0] && created[0].id) : (created && created.id);
              if (!newId) throw new Error(tt('ctrader.cb.err_create', 'Defter oluşturulamadı.'));
              plan.push({ account: a, journalId: newId, journalName: name });
            } catch (e) {
              if (e && (e.code === 'QUOTA_EXCEEDED' || /QUOTA/i.test(e.message || ''))) {
                lines.push(['warn', tt('ctrader.cb.quota', 'Plan limitine ulaşıldı: {n} hesap için defter oluşturulamadı. Premium ile daha fazla defter açabilirsiniz.', { n: others.length - i })]);
                break;
              }
              lines.push(['err', accPlain(a) + ': ' + (e && e.message ? e.message : tt('ctrader.cb.err_create', 'Defter oluşturulamadı.'))]);
            }
          }
        }

        // 2) her hesap: bağla -> (otomatik senkron ayarı) -> senkronla
        var token = null;
        try { var sr = await window.sb.auth.getSession(); token = sr && sr.data && sr.data.session && sr.data.session.access_token; } catch (e) {}
        var allOk = true;
        for (var k = 0; k < plan.length; k++) {
          var p = plan[k];
          var label = accPlain(p.account);
          try {
            descEl.textContent = tt('ctrader.cb.linking_one', '{account} → "{journal}" bağlanıyor...', { account: label, journal: p.journalName });
            await linkAccount(p.account.id, p.journalId);
            try {
              var d = rpcData(await window.sb.rpc('set_ctrader_auto_sync', { p_account_id: p.account.id, p_enabled: autoSync }));
              if (!d || d.success !== true) throw new Error(d && d.error);
            } catch (autoErr) {
              if (autoSync) lines.push(['warn', tt('ctrader.cb.auto_failed', '{account}: otomatik senkron ayarı kaydedilemedi, hesap kartından tekrar açın.', { account: label })]);
            }
            descEl.textContent = tt('ctrader.cb.syncing_one', '{account}: işlemler aktarılıyor...', { account: label });
            var r = await window.WwCtSync.runSync({
              ctid: p.account.ctid_trader_account_id, journalId: p.journalId, token: token,
              onRound: function(n) { descEl.textContent = tt('ctrader.cb.syncing_round', '{account}: geçmiş işlemler alınıyor ({n})...', { account: label, n: n }); }
            });
            var msg = tt('ctrader.cb.result_ok', '{account} → "{journal}": {n} işlem aktarıldı', { account: label, journal: p.journalName, n: r.inserted });
            if (!r.done) msg += ' ' + tt('ctrader.cb.result_partial', '(geçmişin kalanı için kartta Senkronla\'ya basın)');
            lines.push(['ok', msg, r.inserted]);
          } catch (e) {
            allOk = false;
            lines.push(['err', label + ': ' + (e && e.message ? e.message : tt('ctrader.cb.err_generic', 'cTrader hesabı bağlanırken bir sorun oluştu.'))]);
          }
        }

        try {
          localStorage.removeItem('ww_ctrader_target_journal');
          localStorage.setItem('ww_active_journal_id', targetJournalId);
          if (window.wwCache) { window.wwCache.invalidate('trades'); window.wwCache.invalidate('trades_dashboard'); }
        } catch (e) {}

        // 3) sonuç
        var anyOk = lines.some(function(l) { return l[0] === 'ok'; });
        if (anyOk && allOk) {
          setState('success', tt('ctrader.cb.badge_ok', 'Bağlandı'), tt('ctrader.cb.title_done', 'Bağlantı ve aktarım tamam'), '');
        } else if (anyOk) {
          setState('warn', tt('ctrader.cb.badge_partial', 'Kısmen Tamam'), tt('ctrader.cb.title_partial', 'Bazı hesaplar aktarılamadı'), '');
        } else {
          setState('error', tt('ctrader.cb.badge_failed', 'Bağlantı Başarısız'), tt('ctrader.cb.title_error', 'Bir Hata Oluştu'), '');
        }
        panel.innerHTML = '<ul class="cb-results">' + lines.map(function(l) {
          return '<li class="' + l[0] + '">' + esc(l[1]) + '</li>';
        }).join('') + '</ul>';
        panel.style.display = 'block';
        actionContainer.style.display = 'block';
        actionBtn.textContent = tt('ctrader.cb.go_accounts', 'Hesaplarıma Git');
        if (anyOk && allOk && !lines.some(function(l) { return l[0] === 'warn'; })) {
          setTimeout(function() { window.location.href = '/journals'; }, 3500);
        }
      }

      renderChooser();
    })();
