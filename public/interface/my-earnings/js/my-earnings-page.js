// ============================================================
// KAZANÇLARIM (MY-EARNINGS) SAYFASI — sayfa script'i (my-earnings-page.js)
// ============================================================
// Eskiden src/pages/my-earnings.astro içinde satır içi <script is:inline> bloğuydu; HTML küçülsün, kod küçültülsün (minify)
// ve kalıcı önbelleğe (immutable, ?v=<içerik hash'i>) girsin diye buraya AYNEN taşındı.
// Sayfada bloğun eski yerinde yüklenir: <script src="/interface/my-earnings/js/my-earnings-page.js" is:inline data-page-script>.
// defer/async YOK: engelleyici klasik script olarak satır içiyle aynı anda çalışır (üstündeki DOM hazır, defer
// script'ler henüz çalışmadı). Üst seviye adlar global kalır (minify üst seviyeyi yeniden adlandırmaz).
// data-page-script ŞART: SPA router (SpaRouter.astro) bu dosyayı sayfaya her girişte yeniden çalıştırır, satır içi
// script'ler gibi. Bu yüzden üst seviyede const/let/class YAZMAYIN (ikinci girişte "already declared" hatası);
// var / function kullanın (tests/page-scripts.test.js kontrol eder).
// ============================================================
    var EARNINGS_STATE = {
      totalEarnings: 0,
      availableBalance: 0,
      pendingPayout: 0,
      paidPayout: 0,
      btcAddress: '',
      ltcAddress: '',
      selectedCrypto: 'LTC',
      requests: []
    };

    function t(key, fallback, params) {
      var res = fallback;
      if (typeof window !== 'undefined' && window.i18n && typeof window.i18n.t === 'function') {
        var tr = window.i18n.t(key, params);
        if (tr && tr !== key) res = tr;
      }
      if (params && typeof params === 'object') {
        Object.keys(params).forEach(function(k) {
          res = String(res).replace(new RegExp('\\{\\{?' + k + '\\}?\\}', 'g'), params[k]);
        });
      }
      return res;
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/[&<>"']/g, function(m) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m];
      });
    }

    // Tutarları kısa bir sayaçla yazar; hareket azaltma tercihinde doğrudan yazar
    function animateMoney(el, value) {
      if (!el) return;
      var target = Number(value) || 0;
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce || target <= 0) { el.textContent = '$' + target.toFixed(2); return; }
      var start = performance.now();
      var duration = 900;
      function step(now) {
        var p = Math.min(1, (now - start) / duration);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = '$' + (target * eased).toFixed(2);
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    function copyToClipboard(text, msg) {
      if (!navigator.clipboard) {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } else {
        navigator.clipboard.writeText(text);
      }
      var toastMsg = msg || t('earnings.toast_code_copied', 'Kopyalandı!');
      if (typeof window.showToast === 'function') {
        window.showToast(toastMsg, 'success');
      } else {
        alert(toastMsg);
      }
    }

    function selectCryptoMethod(crypto) {
      EARNINGS_STATE.selectedCrypto = crypto;
      var cardLtc = document.getElementById('crypto-card-ltc');
      var cardBtc = document.getElementById('crypto-card-btc');
      var radLtc = document.getElementById('crypto-ltc');
      var radBtc = document.getElementById('crypto-btc');
      var lbl = document.getElementById('payout-address-label');
      var input = document.getElementById('payout-wallet-address');

      if (crypto === 'LTC') {
        if (cardLtc) cardLtc.classList.add('active');
        if (cardBtc) cardBtc.classList.remove('active');
        if (radLtc) radLtc.checked = true;
        if (lbl) lbl.textContent = 'Litecoin (LTC)';
        if (input) input.value = EARNINGS_STATE.ltcAddress || '';
      } else {
        if (cardBtc) cardBtc.classList.add('active');
        if (cardLtc) cardLtc.classList.remove('active');
        if (radBtc) radBtc.checked = true;
        if (lbl) lbl.textContent = 'Bitcoin (BTC)';
        if (input) input.value = EARNINGS_STATE.btcAddress || '';
      }
    }

    function openPayoutModal() {
      if (EARNINGS_STATE.availableBalance < 20) {
        var minWarn = t('earnings.toast_min_amount', 'Minimum çekim tutarı $20.00\'dır.') + ' (' + t('earnings.stat_available', 'Çekilebilir Bakiye') + ': $' + EARNINGS_STATE.availableBalance.toFixed(2) + ')';
        if (typeof window.showToast === 'function') {
          window.showToast(minWarn, 'error');
        } else {
          alert(minWarn);
        }
        return;
      }

      document.getElementById('modal-available-balance').textContent = '$' + EARNINGS_STATE.availableBalance.toFixed(2);
      document.getElementById('payout-amount').value = Math.floor(EARNINGS_STATE.availableBalance);
      selectCryptoMethod(EARNINGS_STATE.selectedCrypto || 'LTC');

      document.getElementById('payout-modal').classList.add('open');
    }

    function closePayoutModal() {
      document.getElementById('payout-modal').classList.remove('open');
    }

    function openWalletsModal() {
      document.getElementById('pref-ltc-address').value = EARNINGS_STATE.ltcAddress || '';
      document.getElementById('pref-btc-address').value = EARNINGS_STATE.btcAddress || '';
      document.getElementById('wallets-modal').classList.add('open');
    }

    function closeWalletsModal() {
      document.getElementById('wallets-modal').classList.remove('open');
    }

    function setMaxWithdrawAmount() {
      document.getElementById('payout-amount').value = EARNINGS_STATE.availableBalance.toFixed(2);
    }

    async function saveWallets() {
      var btn = document.getElementById('save-wallets-btn');
      var btc = document.getElementById('pref-btc-address').value.trim();
      var ltc = document.getElementById('pref-ltc-address').value.trim();

      btn.disabled = true;
      btn.textContent = '...';

      try {
        var client = await getSb();
        var { data: { session } } = await client.auth.getSession();
        if (!session) return;

        // Try RPC first
        var { error: rpcErr } = await client.rpc('save_payout_addresses', { p_btc: btc, p_ltc: ltc });
        if (rpcErr) {
          // Direct fallback
          await client.from('user_profiles').update({
            btc_payout_address: btc,
            ltc_payout_address: ltc
          }).eq('id', session.user.id);
        }

        EARNINGS_STATE.btcAddress = btc;
        EARNINGS_STATE.ltcAddress = ltc;

        if (typeof window.showToast === 'function') window.showToast(t('earnings.toast_wallets_saved', 'Cüzdan adresleri başarıyla kaydedildi!'), 'success');
        closeWalletsModal();
      } catch (e) {
        console.error('saveWallets hatası:', e);
        if (typeof window.showToast === 'function') window.showToast((e.message || e), 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = t('common.save', 'Kaydet');
      }
    }

    async function submitPayoutRequest() {
      var btn = document.getElementById('submit-payout-btn');
      var amount = parseFloat(document.getElementById('payout-amount').value);
      var crypto = EARNINGS_STATE.selectedCrypto || 'LTC';
      var address = document.getElementById('payout-wallet-address').value.trim();
      var saveAddr = document.getElementById('save-address-checkbox').checked;

      if (isNaN(amount) || amount < 20) {
        var errMin = t('earnings.toast_min_amount', 'Minimum çekim tutarı $20.00 olmalıdır.');
        if (typeof window.showToast === 'function') window.showToast(errMin, 'error');
        else alert(errMin);
        return;
      }

      if (amount > EARNINGS_STATE.availableBalance) {
        var errBal = t('earnings.toast_insufficient_balance', 'Yetersiz bakiye. Maksimum çekilebilir: $') + EARNINGS_STATE.availableBalance.toFixed(2);
        if (typeof window.showToast === 'function') window.showToast(errBal, 'error');
        else alert(errBal);
        return;
      }

      if (!address) {
        var errAddr = t('earnings.toast_invalid_address', 'Lütfen geçerli bir cüzdan adresi girin.');
        if (typeof window.showToast === 'function') window.showToast(errAddr, 'error');
        else alert(errAddr);
        return;
      }

      btn.disabled = true;
      btn.textContent = '...';

      try {
        var client = await getSb();
        var { data: { session } } = await client.auth.getSession();
        if (!session) return;

        // Try RPC
        var { data: rpcRes, error: rpcErr } = await client.rpc('submit_payout_request', {
          p_amount: amount,
          p_currency: crypto,
          p_address: address
        });

        // Sunucu reddederse (yetersiz bakiye, minimum tutar vb.) gerçek sebep kullanıcıya gösterilir.
        // Eskiden iş kuralı reddi RPC hatası sanılıp doğrudan tabloya insert deneniyordu; o insert RLS'e takılınca
        // kullanıcı "yetersiz bakiye" yerine alakasız bir RLS hatası görüyordu (ve bakiye kontrolü atlanmaya çalışılıyordu).
        if (rpcErr) throw rpcErr;
        if (rpcRes && rpcRes.success === false) {
          throw new Error(rpcRes.error || t('earnings.toast_payout_failed', 'Çekim talebi oluşturulamadı.'));
        }

        if (saveAddr) {
          if (crypto === 'LTC') EARNINGS_STATE.ltcAddress = address;
          else EARNINGS_STATE.btcAddress = address;
        }

        var successMsg = t('earnings.toast_payout_success', 'Para çekme talebiniz başarıyla oluşturuldu! Admin onayından sonra cüzdanınıza transfer edilecektir.');
        if (typeof window.showToast === 'function') {
          window.showToast(successMsg, 'success');
        } else {
          alert(successMsg);
        }

        closePayoutModal();
        await loadEarningsData();
      } catch (e) {
        console.error('submitPayoutRequest hatası:', e);
        if (typeof window.showToast === 'function') window.showToast((e.message || e), 'error');
        else alert('Hata: ' + (e.message || e));
      } finally {
        btn.disabled = false;
        btn.textContent = t('earnings.btn_submit_request', 'Talebi Gönder');
      }
    }

    function openApplyModal() {
      document.getElementById('partner-apply-form').reset();
      selectFollowerRange(null);
      updateApplyNoteCount();
      selectCryptoUsage(true);
      document.getElementById('partner-apply-modal').classList.add('open');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function closeApplyModal() {
      document.getElementById('partner-apply-modal').classList.remove('open');
    }

    // Takipçi aralığı çipleri; seçilen değer gizli #apply-followers alanına yazılır
    function selectFollowerRange(chip) {
      var hidden = document.getElementById('apply-followers');
      document.querySelectorAll('#partner-apply-modal .apply-chip').forEach(function (c) {
        var on = c === chip;
        c.classList.toggle('active', on);
        c.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      if (hidden) hidden.value = chip ? chip.getAttribute('data-value') : '';
    }

    function updateApplyNoteCount() {
      var note = document.getElementById('apply-note');
      var count = document.getElementById('apply-note-count');
      if (note && count) count.textContent = note.value.length;
    }

    function selectCryptoUsage(val) {
      var yesCard = document.getElementById('crypto-opt-yes-card');
      var noCard = document.getElementById('crypto-opt-no-card');
      if (!yesCard || !noCard) return;
      var yesRadio = yesCard.querySelector('input');
      var noRadio = noCard.querySelector('input');

      if (val) {
        if (yesRadio) yesRadio.checked = true;
        if (noRadio) noRadio.checked = false;
        yesCard.classList.add('active');
        noCard.classList.remove('active');
      } else {
        if (yesRadio) yesRadio.checked = false;
        if (noRadio) noRadio.checked = true;
        noCard.classList.add('active');
        yesCard.classList.remove('active');
      }
    }

    async function loadPartnerApplicationStatus() {
      try {
        var client = await getSb();
        if (!client) return;

        var hasLoaded = false;
        try {
          var { data, error } = await client.rpc('get_my_partner_application');
          if (!error && data && data.has_application) {
            hasLoaded = true;
            if (data.status === 'pending') {
              showApplyState('pending');
            } else if (data.status === 'rejected') {
              showApplyState('rejected', {
                adminNote: data.admin_note,
                canReapply: data.can_reapply,
                daysUntilReapply: data.days_until_reapply
              });
            } else {
              showApplyState('can_apply');
            }
            return;
          }
        } catch (rpcEx) {
          console.warn('get_my_partner_application RPC failed, fallback to direct query:', rpcEx);
        }

        // Doğrudan partner_applications tablosundan oku (fallback)
        var { data: { session } } = await client.auth.getSession();
        if (!session || !session.user) {
          showApplyState('can_apply');
          return;
        }

        var { data: directRows, error: directErr } = await client
          .from('partner_applications')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (!directErr && directRows && directRows.length > 0) {
          var lastApp = directRows[0];
          if (lastApp.status === 'pending') {
            showApplyState('pending');
          } else if (lastApp.status === 'rejected') {
            var diffDays = Math.floor((new Date() - new Date(lastApp.created_at)) / (1000 * 60 * 60 * 24));
            var canReapply = diffDays >= 14;
            var daysLeft = Math.max(1, 14 - diffDays);
            showApplyState('rejected', {
              adminNote: lastApp.admin_note,
              canReapply: canReapply,
              daysUntilReapply: canReapply ? 0 : daysLeft
            });
          } else {
            showApplyState('can_apply');
          }
        } else {
          showApplyState('can_apply');
        }
      } catch (err) {
        console.error('loadPartnerApplicationStatus error:', err);
        showApplyState('can_apply');
      }
    }

    function showApplyState(type, meta) {
      meta = meta || {};
      var canApplyEl = document.getElementById('status-can-apply');
      var pendingEl = document.getElementById('status-pending-app');
      var rejectedEl = document.getElementById('status-rejected-app');
      var canReapplyWrap = document.getElementById('status-can-reapply');
      var countdownWrap = document.getElementById('app-countdown-wrap');
      var reasonEl = document.getElementById('app-rejection-reason');
      var countdownTextEl = document.getElementById('app-countdown-text');

      if (canApplyEl) canApplyEl.style.display = 'none';
      if (pendingEl) pendingEl.style.display = 'none';
      if (rejectedEl) rejectedEl.style.display = 'none';

      if (type === 'can_apply') {
        if (canApplyEl) canApplyEl.style.display = 'block';
      } else if (type === 'pending') {
        if (pendingEl) pendingEl.style.display = 'block';
      } else if (type === 'rejected') {
        if (rejectedEl) rejectedEl.style.display = 'block';
        if (reasonEl) {
          if (meta.adminNote) {
            reasonEl.textContent = t('earnings.admin_reason', 'Yönetici Notu:') + ' ' + meta.adminNote;
            reasonEl.style.display = 'block';
          } else {
            reasonEl.style.display = 'none';
          }
        }
        if (meta.canReapply) {
          if (countdownWrap) countdownWrap.style.display = 'none';
          if (canReapplyWrap) canReapplyWrap.style.display = 'block';
        } else {
          if (countdownWrap) {
            countdownWrap.style.display = 'block';
            if (countdownTextEl) {
              var trStr = t('earnings.app_reapply_countdown', 'Yeni başvuru yapabilmek için kalan süre: {days} gün');
              var daysCount = (meta.daysUntilReapply !== undefined && meta.daysUntilReapply !== null) ? meta.daysUntilReapply : 14;
              countdownTextEl.textContent = trStr.replace(/\{\{?days\}?\}/g, daysCount);
            }
          }
          if (canReapplyWrap) canReapplyWrap.style.display = 'none';
        }
      }
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    async function submitPartnerApplication(e) {
      if (e) e.preventDefault();
      var instagram = document.getElementById('apply-instagram').value.trim();
      var followers = document.getElementById('apply-followers').value;
      var cryptoRadio = document.querySelector('input[name="apply_crypto"]:checked');
      var usesCrypto = cryptoRadio ? (cryptoRadio.value === 'true') : true;
      var note = document.getElementById('apply-note').value.trim();

      if (!instagram) {
        var errInsta = t('earnings.toast_instagram_required', 'Lütfen Instagram adresinizi giriniz.');
        if (typeof window.showToast === 'function') window.showToast(errInsta, 'error');
        else alert(errInsta);
        return;
      }
      if (!followers) {
        var errFol = t('earnings.toast_followers_required', 'Lütfen takipçi kitlenizi seçiniz.');
        if (typeof window.showToast === 'function') window.showToast(errFol, 'error');
        else alert(errFol);
        return;
      }

      var submitBtn = document.getElementById('submit-apply-btn');
      var originalBtnHtml = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '...';

      try {
        var client = await getSb();
        if (!client) throw new Error('Client not available');

        var res = await client.rpc('submit_partner_application', {
          p_instagram: instagram,
          p_follower_count: followers,
          p_uses_crypto: usesCrypto,
          p_note: note
        });

        if (res.error) {
          throw new Error(res.error.message || 'Başvuru gönderilemedi.');
        }

        var successMsg = t('earnings.toast_app_submitted', 'Partner başvurunuz başarıyla alındı! Değerlendirme sonucu bu sayfada görünecektir.');
        if (typeof window.showToast === 'function') window.showToast(successMsg, 'success');
        else alert(successMsg);

        closeApplyModal();
        await loadPartnerApplicationStatus();
      } catch (err) {
        console.error('submitPartnerApplication error:', err);
        var errMsg = err.message || 'Başvuru gönderilirken bir hata oluştu.';
        if (typeof window.showToast === 'function') window.showToast(errMsg, 'error');
        else alert(errMsg);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    }

    async function getSb() {
      if (window.sb) return window.sb;
      for (let i = 0; i < 40; i++) {
        if (window.sb) return window.sb;
        if (typeof window.supabase !== 'undefined' && window.SUPABASE_URL) {
          window.sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
          return window.sb;
        }
        await new Promise(r => setTimeout(r, 100));
      }
      return null;
    }

    // SPA: sayfadan çıkıldıktan sonra devam eden yükleme, artık olmayan elemanlara
    // yazmaya çalışıp hata atmasın (yeni sayfada bu id'ler yok)
    async function loadEarningsData() {
      var scope = window.wwPage.current();
      try {
        return await loadEarningsDataInner();
      } catch (e) {
        if (scope.alive) throw e;
      }
    }

    async function loadEarningsDataInner() {
      var client = await getSb();
      if (!client) {
        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('empty-state').style.display = 'block';
        return;
      }

      const { data: { session } } = await client.auth.getSession();
      if (!session) {
        window.location.href = '/login';
        return;
      }

      try {
        // 1. Fetch Referral Codes
        let codeRows = [];
        const { data: rpcData, error: rpcError } = await client.rpc('get_influencer_earnings');
        if (!rpcError && Array.isArray(rpcData)) {
          codeRows = rpcData;
        } else {
          const { data: directData } = await client
            .from('referral_codes')
            .select('code, discount_percent, usage_count, usage_count_monthly, usage_count_yearly, commission_rate, commission_rate_yearly')
            .eq('influencer_user_id', session.user.id);
          if (Array.isArray(directData)) {
            codeRows = directData.map(r => {
              const uMonthly = r.usage_count_monthly !== undefined && r.usage_count_monthly !== null ? r.usage_count_monthly : (r.usage_count || 0);
              const uYearly = r.usage_count_yearly || 0;
              const cMonthly = r.commission_rate || 0;
              const cYearly = r.commission_rate_yearly || 0;
              return {
                code: r.code,
                discount_percent: r.discount_percent,
                usage_count: r.usage_count || 0,
                usage_count_monthly: uMonthly,
                usage_count_yearly: uYearly,
                commission_rate: cMonthly,
                commission_rate_yearly: cYearly,
                total_earnings: (uMonthly * cMonthly) + (uYearly * cYearly)
              };
            });
          }
        }

        // 2. Fetch Payout Summary / User data
        let totalEarnings = 0;
        let totalUsage = 0;
        codeRows.forEach(function(r) {
          totalEarnings += parseFloat(r.total_earnings || 0);
          totalUsage += parseInt(r.usage_count || 0, 10);
        });

        let pendingPayout = 0;
        let paidPayout = 0;
        let btcAddress = '';
        let ltcAddress = '';
        let requestsList = [];

        // Try RPC summary first
        const { data: summaryData, error: summaryErr } = await client.rpc('get_influencer_payout_summary');
        if (!summaryErr && summaryData && !summaryData.error) {
          totalEarnings = parseFloat(summaryData.total_earnings || totalEarnings);
          pendingPayout = parseFloat(summaryData.pending_payout || 0);
          paidPayout = parseFloat(summaryData.paid_payout || 0);
          btcAddress = summaryData.btc_address || '';
          ltcAddress = summaryData.ltc_address || '';
          requestsList = summaryData.requests || [];
        } else {
          // Direct fallback
          const { data: prof } = await client.from('user_profiles').select('btc_payout_address, ltc_payout_address').eq('id', session.user.id).maybeSingle();
          if (prof) {
            btcAddress = prof.btc_payout_address || '';
            ltcAddress = prof.ltc_payout_address || '';
          }

          const { data: reqs } = await client.from('payout_requests').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });
          if (Array.isArray(reqs)) {
            requestsList = reqs;
            reqs.forEach(function(rq) {
              var am = parseFloat(rq.amount || 0);
              if (rq.status === 'pending') pendingPayout += am;
              else if (rq.status === 'approved') paidPayout += am;
            });
          }
        }

        // Kuruşa yuvarla: kayan nokta farkı (ör. 50.3-30.3 = 19.999999999999996) tam 20 $'lık bakiyeyi "minimum 20" altında gösteriyordu
        var availableBalance = Math.max(0, Math.round((totalEarnings - pendingPayout - paidPayout) * 100) / 100);

        EARNINGS_STATE.totalEarnings = totalEarnings;
        EARNINGS_STATE.availableBalance = availableBalance;
        EARNINGS_STATE.pendingPayout = pendingPayout;
        EARNINGS_STATE.paidPayout = paidPayout;
        EARNINGS_STATE.btcAddress = btcAddress;
        EARNINGS_STATE.ltcAddress = ltcAddress;
        EARNINGS_STATE.requests = requestsList;

        document.getElementById('loading-state').style.display = 'none';

        if (codeRows.length === 0 && requestsList.length === 0) {
          document.getElementById('data-state').style.display = 'none';
          document.getElementById('empty-state').style.display = 'block';
          var topActions = document.getElementById('top-action-buttons');
          if (topActions) topActions.style.display = 'none';

          loadPartnerApplicationStatus();
          if (typeof lucide !== 'undefined') lucide.createIcons();
          return;
        }

        document.getElementById('empty-state').style.display = 'none';
        document.getElementById('data-state').style.display = 'block';
        var topActions = document.getElementById('top-action-buttons');
        if (topActions) topActions.style.display = 'flex';

        // Render Stats
        animateMoney(document.getElementById('stat-available'), availableBalance);
        animateMoney(document.getElementById('stat-earnings'), totalEarnings);
        animateMoney(document.getElementById('stat-pending'), pendingPayout);
        animateMoney(document.getElementById('stat-paid'), paidPayout);

        // Minimum çekime ilerleme
        var MIN_PAYOUT = 20;
        var progressFill = document.getElementById('available-progress-fill');
        var progressText = document.getElementById('available-progress-text');
        var progressNow = document.getElementById('available-progress-now');
        var ready = availableBalance >= MIN_PAYOUT;
        if (progressFill) progressFill.style.width = Math.min(100, (availableBalance / MIN_PAYOUT) * 100) + '%';
        if (progressNow) progressNow.textContent = '$' + Math.min(availableBalance, MIN_PAYOUT).toFixed(2);
        // Hazır durumu rozette yazar; buradaki metin tekrar etmesin
        if (progressText) {
          progressText.textContent = ready
            ? t('earnings.min_payout_note', 'Minimum çekim: $20.00')
            : t('earnings.balance_to_min', 'Minimum çekime ${amount} kaldı', { amount: (MIN_PAYOUT - availableBalance).toFixed(2) });
        }
        var hero = document.getElementById('earn-hero');
        if (hero) hero.classList.toggle('is-ready', ready);
        var heroBadge = document.getElementById('earn-hero-badge');
        if (heroBadge) heroBadge.textContent = ready
          ? t('earnings.balance_ready', 'Çekime hazır')
          : t('earnings.hero_badge_growing', 'Birikiyor');

        // Abone başına kazanç ipucu (en yüksek oranlı kod)
        var bestMonthly = 0, bestYearly = 0;
        codeRows.forEach(function(item) {
          bestMonthly = Math.max(bestMonthly, parseFloat(item.commission_rate || 0) || 0);
          bestYearly = Math.max(bestYearly, parseFloat(item.commission_rate_yearly || 0) || 0);
        });
        var heroHint = document.getElementById('earn-hero-hint');
        if (heroHint) {
          heroHint.hidden = !(bestMonthly > 0 || bestYearly > 0);
          document.getElementById('earn-hero-hint-text').textContent = t('earnings.hero_rate_hint',
            'Yıllık abone başına +${yearly}, aylık abone başına +${monthly}',
            { yearly: bestYearly.toFixed(2), monthly: bestMonthly.toFixed(2) });
        }

        // Update Withdraw Button state
        var openPayoutBtn = document.getElementById('open-payout-modal-btn');
        if (openPayoutBtn) {
          if (availableBalance < 20) {
            openPayoutBtn.style.opacity = '0.6';
            openPayoutBtn.title = t('earnings.min_payout_note', 'Minimum çekim: $20.00') + ' (' + t('earnings.stat_available', 'Çekilebilir Bakiye') + ': $' + availableBalance.toFixed(2) + ')';
          } else {
            openPayoutBtn.style.opacity = '1';
            openPayoutBtn.title = t('earnings.btn_request_payout', 'Para çekme talebi oluştur');
          }
        }

        // Referans kodu kartları (kopyalama: #data-state üzerindeki tek dinleyici, data-copy-*)
        var codesList = document.getElementById('codes-list');
        var monthlyLbl = t('earnings.monthly', 'aylık');
        var yearlyLbl = t('earnings.yearly', 'yıllık');
        if (codeRows.length === 0) {
          codesList.innerHTML = '<div class="earn-empty"><strong>' + escapeHtml(t('earnings.no_codes', 'Tanımlı referans kodu bulunamadı.')) + '</strong></div>';
        } else {
          codesList.innerHTML = codeRows.map(function(item) {
            var uMonthly = parseInt(item.usage_count_monthly !== undefined && item.usage_count_monthly !== null ? item.usage_count_monthly : (item.usage_count || 0), 10) || 0;
            var uYearly = parseInt(item.usage_count_yearly || 0, 10) || 0;
            var cMonthly = parseFloat(item.commission_rate || 0).toFixed(2);
            var cYearly = parseFloat(item.commission_rate_yearly || 0).toFixed(2);
            var totalEarningsVal = parseFloat(item.total_earnings || 0).toFixed(2);
            var code = escapeHtml(item.code);

            return '<article class="earn-code-card">' +
              '<div class="earn-code-id">' +
                '<span class="earn-code-kicker">' + escapeHtml(t('earnings.preview_label', 'PARTNER KODUNUZ')) + '</span>' +
                '<button type="button" class="earn-code-copy" data-copy-code="' + code + '" title="' + escapeHtml(t('earnings.copy_code', 'Kodu kopyala')) + '">' +
                  '<span>' + code + '</span>' +
                  '<span class="earn-code-copy-chip"><i data-lucide="copy"></i>' + escapeHtml(t('earnings.copy_code', 'Kodu kopyala')) + '</span></button>' +
                '<span class="earn-code-discount"><i data-lucide="tag"></i>' +
                  escapeHtml(t('earnings.code_discount', '%{pct} kullanıcı indirimi', { pct: parseFloat(item.discount_percent || 0) })) + '</span>' +
              '</div>' +
              '<div class="earn-code-metrics">' +
                '<div class="earn-metric tone-accent">' +
                  '<span class="earn-metric-label"><i data-lucide="users"></i>' + escapeHtml(t('earnings.col_usage', 'Abonelik Alımları')) + '</span>' +
                  '<strong class="earn-metric-value">' + Math.max(parseInt(item.usage_count, 10) || 0, uMonthly + uYearly) + '</strong>' +
                  '<span class="earn-metric-sub">' + uMonthly + ' ' + escapeHtml(monthlyLbl) + ' · ' + uYearly + ' ' + escapeHtml(yearlyLbl) + '</span>' +
                '</div>' +
                '<div class="earn-metric tone-yellow">' +
                  '<span class="earn-metric-label"><i data-lucide="coins"></i>' + escapeHtml(t('earnings.col_commission', 'Komisyon / Satış')) + '</span>' +
                  '<div class="earn-rate-row"><strong>$' + cMonthly + '</strong><span>' + escapeHtml(monthlyLbl) + '</span></div>' +
                  '<div class="earn-rate-row"><strong>$' + cYearly + '</strong><span>' + escapeHtml(yearlyLbl) + '</span></div>' +
                '</div>' +
                '<div class="earn-metric is-total tone-green">' +
                  '<span class="earn-metric-label"><i data-lucide="trending-up"></i>' + escapeHtml(t('earnings.col_total', 'Toplam Kazanç')) + '</span>' +
                  '<strong class="earn-metric-value">$' + totalEarningsVal + '</strong>' +
                '</div>' +
              '</div>' +
            '</article>';
          }).join('');
        }

        // Çekim talepleri (mobilde her satır karta döner; etiketler data-label ile)
        var payoutsTbody = document.getElementById('payouts-tbody');
        if (requestsList.length === 0) {
          payoutsTbody.innerHTML = '<tr class="is-empty"><td colspan="6"><div class="earn-empty">' +
            '<span class="earn-empty-icon"><i data-lucide="inbox"></i></span>' +
            '<strong>' + escapeHtml(t('earnings.no_payouts', 'Henüz bir para çekme talebiniz bulunmuyor.')) + '</strong>' +
            '<p>' + escapeHtml(t('earnings.no_payouts_hint', 'Çekilebilir bakiyeniz $20\'a ulaştığında "Para Çekme Talebi Gönder" ile ilk talebinizi oluşturabilirsiniz.')) + '</p>' +
          '</div></td></tr>';
        } else {
          var curLang = (window.i18n && window.i18n.currentLang) || 'tr';
          var localeMap = { 'tr': 'tr-TR', 'en': 'en-US', 'de': 'de-DE' };
          var dateLocale = localeMap[curLang] || 'tr-TR';
          var STATUS = {
            pending: ['is-pending', t('earnings.status_pending', 'Beklemede')],
            approved: ['is-approved', t('earnings.status_approved', 'Ödendi')],
            rejected: ['is-rejected', t('earnings.status_rejected', 'Reddedildi')]
          };
          var lbl = function(key, fallback) { return ' data-label="' + escapeHtml(t(key, fallback)) + '"'; };

          payoutsTbody.innerHTML = requestsList.map(function(req) {
            var st = STATUS[req.status];
            var statusBadge = st ? '<span class="earn-status ' + st[0] + '">' + escapeHtml(st[1]) + '</span>' : '—';
            var dateStr = req.created_at ? new Date(req.created_at).toLocaleDateString(dateLocale, { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
            var addr = String(req.payout_address || '');
            var shortAddr = addr.length > 18 ? (addr.slice(0, 8) + '…' + addr.slice(-6)) : addr;
            var curr = String(req.currency || '').toUpperCase();

            return '<tr>' +
              '<td class="cell-date"' + lbl('earnings.col_date', 'Tarih') + '>' + escapeHtml(dateStr) + '</td>' +
              '<td class="cell-amount"' + lbl('earnings.col_amount', 'Tutar ($)') + '>$' + (parseFloat(req.amount) || 0).toFixed(2) + '</td>' +
              '<td' + lbl('earnings.col_method', 'Yöntem') + '><span class="earn-crypto' + (curr === 'BTC' ? ' is-btc' : '') + '">' + escapeHtml(curr || '—') + '</span></td>' +
              '<td' + lbl('earnings.col_address', 'Cüzdan Adresi') + '>' + (addr
                ? '<button type="button" class="earn-address" data-copy-address="' + escapeHtml(addr) + '" title="' + escapeHtml(addr) + '">' + escapeHtml(shortAddr) + '<i data-lucide="copy"></i></button>'
                : '—') + '</td>' +
              '<td' + lbl('earnings.col_status', 'Durum') + '>' + statusBadge + '</td>' +
              '<td class="cell-note"' + lbl('earnings.col_note', 'Not / Açıklama') + '>' + escapeHtml(req.admin_note || '—') + '</td>' +
            '</tr>';
          }).join('');
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
      } catch (err) {
        console.error('loadEarningsData hatası:', err);
        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('empty-state').style.display = 'block';
      }
    }

    document.addEventListener('DOMContentLoaded', function() {
      loadEarningsData();

      var openBtn = document.getElementById('open-payout-modal-btn');
      if (openBtn) openBtn.addEventListener('click', openPayoutModal);

      var walletsBtn = document.getElementById('open-wallets-modal-btn');
      if (walletsBtn) walletsBtn.addEventListener('click', openWalletsModal);

      var openApplyBtn = document.getElementById('btn-open-application-modal');
      if (openApplyBtn) openApplyBtn.addEventListener('click', openApplyModal);

      var reapplyBtn = document.getElementById('btn-reapply-partner');
      if (reapplyBtn) reapplyBtn.addEventListener('click', openApplyModal);

      var refreshBtn = document.getElementById('refresh-payouts-btn');
      if (refreshBtn) refreshBtn.addEventListener('click', loadEarningsData);

      var dataState = document.getElementById('data-state');
      if (dataState) dataState.addEventListener('click', function(e) {
        var codeBtn = e.target.closest('[data-copy-code]');
        if (codeBtn) {
          copyToClipboard(codeBtn.getAttribute('data-copy-code'), t('earnings.toast_code_copied', 'Referans kodu kopyalandı!'));
          return;
        }
        var addrBtn = e.target.closest('[data-copy-address]');
        if (addrBtn) copyToClipboard(addrBtn.getAttribute('data-copy-address'), t('earnings.toast_address_copied', 'Cüzdan adresi kopyalandı!'));
      });

      if (typeof window !== 'undefined' && window.i18n && typeof window.i18n.onChange === 'function') {
        // SPA: sayfadan çıkınca kaldırılır (BaseHead.astro → wwPage)
        window.wwPage.current().onI18nChange(function() {
          if (window.i18n.apply) window.i18n.apply();
          loadEarningsData();
        });
      }
    });
