// ============================================================
// DASHBOARD SAYFASI — sayfa script'i (dashboard-page.js)
// ============================================================
// Eskiden src/pages/dashboard.astro içinde satır içi <script is:inline> bloğuydu; HTML küçülsün, kod küçültülsün (minify)
// ve kalıcı önbelleğe (immutable, ?v=<içerik hash'i>) girsin diye buraya AYNEN taşındı.
// Sayfada bloğun eski yerinde yüklenir: <script src="/interface/dashboard/js/dashboard-page.js" is:inline data-page-script>.
// defer/async YOK: engelleyici klasik script olarak satır içiyle aynı anda çalışır (üstündeki DOM hazır, defer
// script'ler henüz çalışmadı). Üst seviye adlar global kalır (minify üst seviyeyi yeniden adlandırmaz).
// data-page-script ŞART: SPA router (SpaRouter.astro) bu dosyayı sayfaya her girişte yeniden çalıştırır, satır içi
// script'ler gibi. Bu yüzden üst seviyede const/let/class YAZMAYIN (ikinci girişte "already declared" hatası);
// var / function kullanın (tests/page-scripts.test.js kontrol eder).
// ============================================================
    // SPA: bu script'in global dinleyicileri sayfadan çıkınca kaldırılır (BaseHead.astro → wwPage)
    var DASH_PAGE = window.wwPage.current();

    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    var _currentPropSync = null;

    async function refreshDashboardPropBanner() {
      if (!DASH_PAGE.alive) return;
      var propCardEl = document.getElementById('dashboard-prop-card');
      var badgeEl = document.getElementById('dashboard-prop-badge');
      var bannerEl = document.getElementById('dashboard-prop-banner');
      if (bannerEl) {
        bannerEl.style.display = 'none';
        bannerEl.innerHTML = '';
      }

      var statsGridEl = document.getElementById('stats-grid');
      if (statsGridEl && statsGridEl.style.display === 'none') {
        var statsSkelEl = document.getElementById('stats-skeleton');
        if (statsSkelEl && statsSkelEl.style.display === 'none') {
          statsGridEl.style.display = 'grid';
        }
      }

      if (!window.PropService || !window.journal) {
        renderStandardAccountCard(propCardEl);
        if (badgeEl) badgeEl.innerHTML = '';
        return;
      }

      var activeId = window.journal.getActiveJournalId();
      if (!activeId) {
        window._isPropAccountActive = false;
        renderStandardAccountCard(propCardEl);
        if (badgeEl) badgeEl.innerHTML = '';
        return;
      }

      // Fast-render: if previously cached as standard, render immediately without waiting
      var isPropCached = false;
      try {
        var rawCache = sessionStorage.getItem('ww_is_prop_' + activeId);
        if (rawCache === '1') isPropCached = true;
      } catch (e) {}

      if (!isPropCached && !window._isPropAccountActive) {
        renderStandardAccountCard(propCardEl);
      }

      try {
        var syncRes = await window.PropService.syncPropAccountStatus(activeId);
        if (!syncRes || !syncRes.account || !syncRes.status) {
          window._isPropAccountActive = false;
          try { sessionStorage.setItem('ww_is_prop_' + activeId, '0'); } catch (e) {}
          renderStandardAccountCard(propCardEl);
          if (badgeEl) badgeEl.innerHTML = '';
          return;
        }

        try { sessionStorage.setItem('ww_is_prop_' + activeId, '1'); } catch (e) {}

        window._isPropAccountActive = true;
        _currentPropSync = syncRes;
        var account = syncRes.account;
        var status = syncRes.status;
        var tmplKey = account.template_key;
        var tmpl = window.PropTemplates ? window.PropTemplates.getPropTemplate(tmplKey) : null;
        var firmName = tmpl ? tmpl.firm : (account.rules?.firm || 'Prop');
        var phaseNum = (account.phase_index !== undefined ? account.phase_index + 1 : 1);
        var t = function (key, params) {
          return (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t(key, params) : key;
        };
        var curLang = (window.i18n && typeof window.i18n.getCurrentLanguage === 'function') ? window.i18n.getCurrentLanguage() : 'tr';
        var tradeScope = 'live';
        try { if (window.WwTrades) tradeScope = await window.WwTrades.resolveJournalScope(activeId); } catch (e) {}
        var localeStr = curLang === 'tr' ? 'tr-TR' : (curLang === 'de' ? 'de-DE' : 'en-US');

        function localizePhaseName(rawPhase) {
          if (!rawPhase) return '';
          if (curLang === 'tr') {
            return String(rawPhase)
              .replace(/Phase 1 \(Challenge\)/i, 'Faz 1 (Challenge)')
              .replace(/Phase 1 \(Evaluation\)/i, 'Faz 1 (Değerlendirme)')
              .replace(/Phase 1 \(Single Phase\)/i, 'Faz 1 (Tek Aşama)')
              .replace(/Phase 2 \(Verification\)/i, 'Faz 2 (Doğrulama)')
              .replace(/Phase 2/i, 'Faz 2')
              .replace(/Phase 1/i, 'Faz 1')
              .replace(/Funded \((.*?)\)/i, 'Fonlandı ($1)')
              .replace(/^Funded$/i, 'Fonlandı (Canlı)');
          } else if (curLang === 'de') {
            return String(rawPhase)
              .replace(/Phase 1 \(Challenge\)/i, 'Phase 1 (Challenge)')
              .replace(/Phase 1 \(Evaluation\)/i, 'Phase 1 (Bewertung)')
              .replace(/Phase 1 \(Single Phase\)/i, 'Phase 1 (Einzelschritt)')
              .replace(/Phase 2 \(Verification\)/i, 'Phase 2 (Verifizierung)')
              .replace(/Funded \((.*?)\)/i, 'Gefördert ($1)')
              .replace(/^Funded$/i, 'Gefördert (Live)');
          }
          return rawPhase;
        }

        var rawPhaseName = account.rules?.phase_name || t('prop.phase_num', { n: phaseNum });
        var phaseName = localizePhaseName(rawPhaseName);

        var currSym = (typeof window.getCurrencySymbol === 'function') 
          ? window.getCurrencySymbol() 
          : (localStorage.getItem('ww_currency') || '$');

        var fmtPlain = function(val) {
          var n = Number(val) || 0;
          return currSym + Math.abs(n).toLocaleString(localeStr, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };
        var fmtDelta = function(val) {
          var n = Number(val) || 0;
          var sign = n > 0 ? '+' : (n < 0 ? '-' : '');
          return sign + currSym + Math.abs(n).toLocaleString(localeStr, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };
        var fmtPct = function(pct) {
          var p = Math.round(Number(pct) || 0);
          return curLang === 'tr' ? '%' + p : p + '%';
        };

        // Action buttons & warnings
        var warningsList = (status.warnings || []).slice();
        if (account.rules && account.rules.verified === false) {
          warningsList.unshift('UNVERIFIED_PHASE_RULES');
        }
        var currentPhaseIdx = account.phase_index !== undefined ? account.phase_index : 0;
        var nextPhaseIdx = currentPhaseIdx + 1;
        var hasNextPhase = Boolean(tmpl && tmpl.phases && tmpl.phases.length > nextPhaseIdx);

        var st = status.overall_status || 'in_progress';
        var stLabel = st === 'passed' ? t('prop.status_passed') : (st === 'failed' ? t('prop.status_failed') : t('prop.status_in_progress'));

        // Başlığın sağındaki prop firm ibareleri kaldırıldı
        if (badgeEl) {
          badgeEl.innerHTML = '';
          badgeEl.style.display = 'none';
        }
        bindHudButtons(account, tmpl, nextPhaseIdx, warningsList);

        // Calculations for Prop Card
        var dailyRem = status.daily_loss ? Number(status.daily_loss.remaining_margin || 0) : 0;
        var dailyLimit = status.daily_loss ? Number(status.daily_loss.limit_amount || 0) : 0;
        var dailyToday = status.daily_loss ? Number(status.daily_loss.today_pnl || 0) : 0;
        var dailyValColor = dailyRem <= 0 ? 'var(--red,#ef4444)' : 'var(--green,#22c55e)';

        var maxStop = status.max_loss ? Number(status.max_loss.hard_stop_level || 0) : 0;
        var maxDist = status.max_loss ? Number(status.max_loss.distance_to_stop || 0) : 0;
        var maxDistPct = status.max_loss ? Number(status.max_loss.distance_to_stop_pct || 0) : 0;

        var targetAmount = status.profit_target ? Number(status.profit_target.target_amount || 0) : 0;
        var targetRem = status.profit_target ? Number(status.profit_target.remaining_amount || 0) : 0;
        var targetPct = status.profit_target ? Number(status.profit_target.progress_pct || 0) : 0;
        var targetBarFill = targetAmount > 0 ? Math.min(100, Math.max(0, targetPct)) : 0;

        var dayCount = status.trading_days ? (status.trading_days.count || 0) : 0;
        var dayMin = status.trading_days ? (status.trading_days.min_required || 0) : 0;

        // Kart istatistikleri FAZ İÇİ özetten gelir (status.stats): start_date öncesi işlemler ve açık
        // işlemler hariç, bakiye/total_pnl ile aynı kümeden. (Eskiden syncRes.trades hiç dönmediği için
        // Win rate ve İşlem sayısı hep 0 görünüyordu; liste dönse bile tüm journal'ı sayacaktı.)
        var phaseStats = status.stats || { trades_count: 0, wins: 0, losses: 0, win_rate_pct: 0 };
        var totalTrades = phaseStats.trades_count;
        var totalPnl = Number(status.total_pnl) || 0;
        var wins = phaseStats.wins;
        var losses = phaseStats.losses;
        var wrPct = Math.round(Number(phaseStats.win_rate_pct) || 0);
        var pnlValColor = totalPnl >= 0 ? 'var(--green,#22c55e)' : 'var(--red,#ef4444)';

        // Status description text for phase (Lucide SVG icon instead of emojis)
        var phaseStatusIcon = '';
        var phaseStatusText = '';
        var phaseStatusClass = st;
        if (st === 'passed') {
          phaseStatusIcon = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" class="prop-status-icon passed"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
          phaseStatusText = t('prop.target_reached_desc');
        } else if (st === 'failed') {
          phaseStatusIcon = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" class="prop-status-icon failed"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
          phaseStatusText = t('prop.status_failed') + ': ' + (status.failed_rule || t('prop.limits_exceeded'));
        } else {
          phaseStatusIcon = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" class="prop-status-icon target"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
          if (targetAmount > 0) {
            phaseStatusText = targetRem <= 0 
              ? t('prop.target_reached_desc')
              : t('prop.target_remaining_info', { rem: fmtPlain(targetRem), target: fmtPlain(targetAmount) });
          } else {
            phaseStatusIcon = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" class="prop-status-icon info"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
            phaseStatusText = t('prop.unlimited_time_hint');
          }
        }

        // Render into dashboard-prop-card
        if (propCardEl) {
          var legacyHtml = `
            <div class="prop-card-header">
              <div class="prop-card-firm-title">
                <span class="prop-card-firm-name">${escapeHtml(firmName)}</span>
                <span class="prop-card-phase-tag">${escapeHtml(phaseName)}</span>
              </div>
              <div class="prop-card-badge-row">
                ${warningsList.length > 0 ? `
                  <button type="button" id="prop-card-notices-btn" class="prop-card-btn-notices" title="${escapeHtml(t('prop.notices_count_title', { n: warningsList.length }))}">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <span>${warningsList.length}</span>
                  </button>
                ` : ''}
                <span class="prop-status-pill ${st}">
                  <span class="prop-status-dot"></span>
                  <span>${escapeHtml(stLabel)}</span>
                </span>
                ${(hasNextPhase && st === 'passed') ? `
                  <button type="button" id="prop-card-advance-btn" class="prop-card-btn-advance">
                    ${escapeHtml(t('prop.next_phase'))}
                  </button>
                ` : ''}
              </div>
            </div>

            <!-- PHASE DURUMU & HEDEF İLERLEMESİ -->
            <div class="prop-card-phase-banner ${phaseStatusClass}">
              <div class="prop-card-phase-banner-top">
                <span class="prop-card-phase-desc">
                  ${phaseStatusIcon}
                  <span>${escapeHtml(phaseStatusText)}</span>
                </span>
                <span class="prop-card-phase-pct">${fmtPct(targetPct)}</span>
              </div>
              <div class="prop-card-progress-bar">
                <div class="prop-card-progress-fill ${st}" style="width: ${targetBarFill}%;"></div>
              </div>
            </div>

            <!-- METRİK IZGARASI (KALAN MARGIN, MAX LOSS, TOTAL PNL, GÜNLER/BAKİYE) -->
            <div class="prop-card-grid">
              <!-- 1. KALAN MARGIN -->
              <div class="prop-card-box">
                <div class="prop-card-box-label">
                  <span>${escapeHtml(t('prop.remaining_margin'))}</span>
                  <span class="prop-card-dot" style="background:${dailyValColor};"></span>
                </div>
                <div class="prop-card-box-value" style="color:${dailyValColor};">
                  ${fmtDelta(dailyRem)}
                </div>
                <div class="prop-card-box-sub">
                  <span>${escapeHtml(t('prop.limit'))}: ${fmtPlain(dailyLimit)}</span>
                  <span>${escapeHtml(t('prop.today'))}: ${fmtDelta(dailyToday)}</span>
                </div>
              </div>

              <!-- 2. MAX LOSS FLOOR MESAFESİ -->
              <div class="prop-card-box">
                <div class="prop-card-box-label">
                  <span>${escapeHtml(t('prop.max_loss_distance'))}</span>
                  <span class="prop-card-dot" style="background:${maxDist <= 0 ? 'var(--red,#ef4444)' : (maxDistPct <= 25 ? '#f59e0b' : 'var(--green,#22c55e)')};"></span>
                </div>
                <div class="prop-card-box-value" style="color:${maxDist <= 0 ? 'var(--red,#ef4444)' : 'inherit'};">
                  ${fmtPlain(maxDist)}
                </div>
                <div class="prop-card-box-sub">
                  <span>${escapeHtml(t('prop.stop_level'))}: ${fmtPlain(maxStop)}</span>
                  <span>${escapeHtml(t('prop.remaining'))}: ${fmtPct(maxDistPct)}</span>
                </div>
              </div>

              <!-- 3. TOTAL PNL -->
              <div class="prop-card-box">
                <div class="prop-card-box-label">
                  <span>${escapeHtml(t('prop.total_pnl'))}</span>
                  <span class="prop-card-dot" style="background:${pnlValColor};"></span>
                </div>
                <div class="prop-card-box-value" style="color:${pnlValColor};">
                  ${fmtDelta(totalPnl)}
                </div>
                <div class="prop-card-box-sub">
                  <span>${escapeHtml(t('prop.win_rate'))}: ${fmtPct(wrPct)}</span>
                  <span>${escapeHtml(t('prop.trades_summary', { count: totalTrades, wins: wins, losses: losses }))}</span>
                </div>
              </div>

              <!-- 4. BAKİYE & GÜN -->
              <div class="prop-card-box">
                <div class="prop-card-box-label">
                  <span>${escapeHtml(t('prop.balance_and_days'))}</span>
                  <span class="prop-card-dot" style="background:#38bdf8;"></span>
                </div>
                <div class="prop-card-box-value">
                  ${fmtPlain(status.current_balance || status.account?.starting_balance)}
                </div>
                <div class="prop-card-box-sub">
                  <span>${escapeHtml(t('prop.day'))}: ${dayCount}${dayMin ? '/' + dayMin : ''}</span>
                  <span>${escapeHtml(t('prop.starting'))}: ${fmtPlain(status.account?.starting_balance)}</span>
                </div>
              </div>
            </div>
          `;

          // chance to pass the rest of the challenge with the trader's own results (prop-montecarlo.js, same engine as the AI coach)
          function propOdds(acc, stt, trades) {
            try {
              if (!window.PropMonteCarlo || !trades || stt.overall_status !== 'in_progress') return null;
              var m = window.PropMonteCarlo.simulate({ account: acc, status: stt, trades: trades, runs: 1000 });
              if (!m || m.kind !== 'challenge') return null;
              var b = m.best_risk_scale < 1 ? m.by_risk.filter(function (x) { return x.risk_scale === m.best_risk_scale; })[0] : null;
              return { pass: m.pass_pct, runs: m.runs, better: b ? b.pass_pct : null, cut: b ? Math.round((1 - b.risk_scale) * 100) : null };
            } catch (e) { return null; }
          }
          var cardCtx = {
            t: function (k, p) { return t(k, p); },
            esc: escapeHtml,
            fmtPlain: fmtPlain, fmtDelta: fmtDelta, fmtPct: fmtPct,
            localeStr: localeStr, curLang: curLang,
            firmName: firmName, phaseName: phaseName,
            phaseIndex: currentPhaseIdx,
            phaseCount: (tmpl && tmpl.phases) ? tmpl.phases.length : 1,
            warningsCount: warningsList.length,
            noticesTitle: t('prop.notices_count_title', { n: warningsList.length }),
            showAdvance: Boolean(hasNextPhase && st === 'passed'),
            advanceLabel: t('prop.next_phase'),
            st: st, statusIcon: phaseStatusIcon, statusText: phaseStatusText,
            targetAmount: targetAmount, targetRem: targetRem, targetPct: targetPct,
            startBal: Number((status.account && status.account.starting_balance) || account.starting_balance || 0),
            balNow: Number(status.current_balance || (status.account && status.account.starting_balance) || 0),
            maxStop: maxStop, maxDist: maxDist,
            maxAllowed: (status.max_loss && Number(status.max_loss.limit_pct) > 0)
              ? Number((status.account && status.account.starting_balance) || account.starting_balance || 0) * Number(status.max_loss.limit_pct) / 100
              : 0,
            dailyLimit: dailyLimit, dailyRem: dailyRem, dailyToday: dailyToday,
            dayCount: dayCount, dayMin: dayMin,
            totalPnl: totalPnl, totalTrades: totalTrades, wrPct: wrPct,
            tradesLabel: t('journal.trades_label'),
            scopeNote: tradeScope !== 'live' ? t('prop.scope_live_only') : '',
            odds: propOdds(account, status, syncRes.trades)
          };
          propCardEl.innerHTML = window.WWPropCardV2 ? window.WWPropCardV2.render(cardCtx) : legacyHtml;

          // chart: target and stop lines, anchored to the latest point of the curve
          if (window.wwSetCumulativeLevels) {
            window.wwSetCumulativeLevels({
              targetAhead: (st !== 'passed' && targetRem > 0) ? targetRem : null,
              stopBehind: maxStop > 0 ? Math.max(0, maxDist) : null,
              targetLabel: t('dashboard.chart.target_line'),
              stopLabel: t('prop.stop_level')
            });
          }

          // Bind advance button in card if present
          var cardAdvBtn = document.getElementById('prop-card-advance-btn');
          if (cardAdvBtn) {
            cardAdvBtn.onclick = function() {
              var mainAdvBtn = document.getElementById('dashboard-advance-phase-btn');
              if (mainAdvBtn) mainAdvBtn.click();
            };
          }

          // Bind notices button in card if present
          var cardNoticesBtn = document.getElementById('prop-card-notices-btn');
          if (cardNoticesBtn) {
            cardNoticesBtn.onclick = function() {
              var modal = document.getElementById('dashboard-prop-notices-modal');
              if (modal) {
                modal.style.display = 'flex';
                modal.classList.add('active');
                if (typeof lucide !== 'undefined') lucide.createIcons();
              }
            };
          }
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
      } catch (err) {
        if (window.wwLog) window.wwLog.error('refreshDashboardPropBanner err:', err);
        renderStandardAccountCard(propCardEl);
      }
    }

    function renderStandardAccountCard(propCardEl) {
      if (!propCardEl) return;
      if (window.wwSetCumulativeLevels) window.wwSetCumulativeLevels(null);
      var t = function (key, params) {
        return (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t(key, params) : key;
      };
      var sym = (typeof window.getCurrencySymbol === 'function') ? window.getCurrencySymbol() : '$';
      var fmtPnl = function (val) {
        if (typeof window.formatCurrency === 'function') {
          return window.formatCurrency(val);
        }
        var num = parseFloat(val) || 0;
        var formatted = Math.abs(num).toLocaleString((window.WwTime && window.WwTime.numLocale ? window.WwTime.numLocale() : 'tr-TR'), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return (num >= 0 ? '+' : '-') + sym + formatted;
      };
      var fmtTarget = function (val) {
        var num = Math.abs(parseFloat(val) || 0);
        return sym + num.toLocaleString((window.WwTime && window.WwTime.numLocale ? window.WwTime.numLocale() : 'tr-TR'), { minimumFractionDigits: 0, maximumFractionDigits: 2 });
      };

      // Get trades from dashboard state
      var trades = (window._currentDashboardTrades && Array.isArray(window._currentDashboardTrades))
        ? window._currentDashboardTrades
        : ((window._allDashboardTrades && Array.isArray(window._allDashboardTrades)) ? window._allDashboardTrades : []);

      // 'Açık işlem' kavramı yok: yalnızca çıkış fiyatı olan (kapanmış) işlemler
      var closed = (window.WwMetrics ? window.WwMetrics.closedTrades(trades) : trades.filter(function (tr) { return tr && tr.exit_price; }));

      var calcPnl = function (tr) {
        if (typeof window.calcTradePnL === 'function') return window.calcTradePnL(tr);
        var p = parseFloat(tr.pnl);
        return !isNaN(p) ? p : 0;
      };

      var bestTrade = null;
      var worstTrade = null;
      var totalWins = 0;
      var winCount = 0;
      var totalLosses = 0;
      var lossCount = 0;
      var totalPnL = 0;

      closed.forEach(function (tr) {
        var pnl = calcPnl(tr);
        totalPnL += pnl;
        if (!bestTrade || pnl > bestTrade.pnl) {
          bestTrade = { pnl: pnl, symbol: tr.symbol || '' };
        }
        if (!worstTrade || pnl < worstTrade.pnl) {
          worstTrade = { pnl: pnl, symbol: tr.symbol || '' };
        }
        if (pnl > 0) {
          totalWins += pnl;
          winCount++;
        } else if (pnl < 0) {
          totalLosses += Math.abs(pnl);
          lossCount++;
        }
      });

      // Target calculations
      var jid = window.journal ? window.journal.getActiveJournalId() : '';
      var savedTarget = localStorage.getItem('ww_monthly_target_' + jid);
      var monthlyTarget = (savedTarget && !isNaN(parseFloat(savedTarget))) ? parseFloat(savedTarget) : 5000;

      // Aylık hedef ilerlemesi: bu takvim ayının kapanmış işlem PnL'i (seçili tarih filtresinden bağımsız)
      var goalNow = new Date();
      var goalMonthPrefix = goalNow.getFullYear() + '-' + String(goalNow.getMonth() + 1).padStart(2, '0');
      var goalMonthPnL = 0;
      var goalSource = (window._allDashboardTrades && Array.isArray(window._allDashboardTrades)) ? window._allDashboardTrades : trades;
      (window.WwMetrics ? window.WwMetrics.closedTrades(goalSource) : []).forEach(function (tr) {
        if (window.WwMetrics.dateKey(tr).indexOf(goalMonthPrefix) === 0) goalMonthPnL += calcPnl(tr);
      });
      var rawGoalPct = monthlyTarget > 0 ? ((goalMonthPnL / monthlyTarget) * 100) : 0;
      var goalPctRounded = Math.round(rawGoalPct * 10) / 10;
      var goalPctText = rawGoalPct > 100 ? '>100%' : (rawGoalPct < -100 ? '<-100%' : (goalPctRounded === 0 ? 0 : goalPctRounded).toLocaleString((window.WwTime && window.WwTime.numLocale ? window.WwTime.numLocale() : 'tr-TR'), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%');
      var goalFillWidth = Math.min(100, Math.max(0, rawGoalPct));
      var goalGradient = rawGoalPct >= 100
        ? 'linear-gradient(90deg, #10b981, #22c55e)'
        : (rawGoalPct > 0 ? 'linear-gradient(90deg, #6366f1, #818cf8)' : 'rgba(255,255,255,0.08)');
      var goalPctColor = rawGoalPct >= 100 ? '#4ade80' : (rawGoalPct > 0 ? '#818cf8' : 'var(--muted)');

      // Box 1: En İyi İşlem
      var bestText = '—';
      var bestSub = t('dashboard.card.no_trades') || 'Kayıtlı İşlem Yok';
      if (bestTrade && bestTrade.pnl > 0) {
        bestText = fmtPnl(bestTrade.pnl);
        bestSub = bestTrade.symbol ? (bestTrade.symbol + ' • ' + (t('dashboard.card.profit_tag') || 'Kazanç')) : (t('dashboard.card.best_trade') || 'En İyi İşlem');
      } else if (closed.length > 0) {
        bestText = fmtPnl(0).replace(/^\+/, '');
        bestSub = t('dashboard.card.no_win') || 'Kârlı İşlem Yok';
      }

      // Box 2: En Kötü İşlem
      var worstText = '—';
      var worstSub = t('dashboard.card.no_trades') || 'Kayıtlı İşlem Yok';
      var worstColor = 'var(--text)';
      if (worstTrade && worstTrade.pnl < 0) {
        worstText = fmtPnl(worstTrade.pnl);
        worstColor = '#f87171';
        worstSub = worstTrade.symbol ? (worstTrade.symbol + ' • ' + (t('dashboard.card.loss_tag') || 'Kayıp')) : (t('dashboard.card.worst_trade') || 'En Kötü İşlem');
      } else if (closed.length > 0) {
        worstText = fmtPnl(0).replace(/^\+/, '');
        worstColor = 'var(--text)';
        worstSub = t('dashboard.card.no_loss') || 'Kayıp İşlem Yok';
      }

      // Box 3: Expectancy (İşlem Başına Matematiksel Beklenti)
      var expVal = closed.length > 0 ? (totalPnL / closed.length) : null;
      var expText = '—';
      var expColor = 'var(--text)';
      if (expVal !== null) {
        expText = fmtPnl(expVal);
        expColor = expVal >= 0 ? '#4ade80' : '#f87171';
      }

      // Box 4: Payoff Ratio (Ort. Kazanç / Ort. Kayıp)
      var avgWin = winCount > 0 ? (totalWins / winCount) : 0;
      var avgLoss = lossCount > 0 ? (totalLosses / lossCount) : 0;
      var payoffText = '—';
      var payoffSub = t('dashboard.card.payoff_sub') || 'Ort. Win / Ort. Loss';
      if (avgLoss > 0 && avgWin > 0) {
        payoffText = (avgWin / avgLoss).toFixed(2) + 'x';
      } else if (avgWin > 0 && avgLoss === 0) {
        payoffText = 'Max';
        payoffSub = t('dashboard.card.no_loss') || 'Kayıp İşlem Yok';
      } else if (closed.length > 0) {
        payoffText = '0.00x';
      }

      var legacyStdHtml = `
        <div class="prop-card-header">
          <div class="prop-card-firm-title">
            <span class="prop-card-firm-name">${t('dashboard.card.performance_edge') || 'Performans & Edge'}</span>
          </div>
          <button type="button" class="prop-card-btn-notices" id="standard-edit-goal-btn" title="${t('dashboard.goal.title') || 'Aylık Hedef Belirle'}" style="background:rgba(var(--ac-b1-rgb), 0.12);color:var(--ac-l2);border-color:rgba(var(--ac-b1-rgb), 0.25);cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:3px 9px;">
            <i data-lucide="target"></i>
            <span>${t('dashboard.card.set_goal') || 'Hedef Belirle'}</span>
          </button>
        </div>

        <div class="prop-card-phase-banner" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);">
          <div class="prop-card-phase-banner-top">
            <span class="prop-card-phase-desc" style="display:inline-flex;align-items:center;gap:6px;">
              <i data-lucide="target" style="color:#818cf8;flex-shrink:0;"></i>
              <span>${t('dashboard.card.monthly_target') || 'Aylık Hedef'}: <strong style="color:var(--text);">${fmtPnl(goalMonthPnL)}</strong> / ${fmtTarget(monthlyTarget)}</span>
            </span>
            <span class="prop-card-phase-pct" style="color:${goalPctColor};">${goalPctText}</span>
          </div>
          <div class="prop-card-progress-bar">
            <div class="prop-card-progress-fill" style="width:${goalFillWidth}%;background:${goalGradient};"></div>
          </div>
        </div>

        <div class="prop-card-grid">
          <div class="prop-card-box">
            <div class="prop-card-box-label">
              <span style="display:inline-flex;align-items:center;gap:4px;">
                <i data-lucide="arrow-up-right" style="color:#4ade80;"></i>
                <span>${t('dashboard.card.best_trade') || 'En İyi İşlem'}</span>
              </span>
              <span class="prop-card-dot" style="background:#4ade80;"></span>
            </div>
            <div class="prop-card-box-value" style="color:#4ade80;">${bestText}</div>
            <div class="prop-card-box-sub"><span>${bestSub}</span></div>
          </div>

          <div class="prop-card-box">
            <div class="prop-card-box-label">
              <span style="display:inline-flex;align-items:center;gap:4px;">
                <i data-lucide="arrow-down-right" style="color:#f87171;"></i>
                <span>${t('dashboard.card.worst_trade') || 'En Kötü İşlem'}</span>
              </span>
              <span class="prop-card-dot" style="background:#f87171;"></span>
            </div>
            <div class="prop-card-box-value" style="color:${worstColor};">${worstText}</div>
            <div class="prop-card-box-sub"><span>${worstSub}</span></div>
          </div>

          <div class="prop-card-box">
            <div class="prop-card-box-label">
              <span style="display:inline-flex;align-items:center;gap:4px;">
                <i data-lucide="scale" style="color:#818cf8;"></i>
                <span>${t('dashboard.card.expectancy') || 'Beklenti (Exp.)'}</span>
              </span>
              <span class="prop-card-dot" style="background:#818cf8;"></span>
            </div>
            <div class="prop-card-box-value" style="color:${expColor};">${expText}</div>
            <div class="prop-card-box-sub"><span>${t('dashboard.card.expectancy_sub') || 'İşlem Başı Ort. K/Z'}</span></div>
          </div>

          <div class="prop-card-box">
            <div class="prop-card-box-label">
              <span style="display:inline-flex;align-items:center;gap:4px;">
                <i data-lucide="zap" style="color:#38bdf8;"></i>
                <span>${t('dashboard.card.payoff_ratio') || 'Payoff Ratio'}</span>
              </span>
              <span class="prop-card-dot" style="background:#38bdf8;"></span>
            </div>
            <div class="prop-card-box-value" style="color:#38bdf8;">${payoffText}</div>
            <div class="prop-card-box-sub"><span>${payoffSub}</span></div>
          </div>
        </div>
      `;

      var avgSub = (avgWin > 0 && avgLoss > 0) ? (fmtTarget(avgWin) + ' / ' + fmtTarget(avgLoss)) : payoffSub;
      var stdCtx = {
        esc: escapeHtml,
        title: t('dashboard.card.performance_edge') || 'Performans & Edge',
        goalBtnLabel: t('dashboard.card.set_goal') || 'Hedef Belirle',
        goalBtnTitle: t('dashboard.goal.title') || 'Aylık Hedef Belirle',
        goalLabel: t('dashboard.card.monthly_target') || 'Aylık Hedef',
        pnlText: fmtPnl(goalMonthPnL),
        targetText: fmtTarget(monthlyTarget),
        goalPct: rawGoalPct,
        goalPctText: goalPctText,
        best:   { label: t('dashboard.card.best_trade') || 'En İyi İşlem', text: bestText, cls: (bestTrade && bestTrade.pnl > 0) ? 'up' : '', sub: bestSub },
        worst:  { label: t('dashboard.card.worst_trade') || 'En Kötü İşlem', text: worstText, cls: (worstTrade && worstTrade.pnl < 0) ? 'down' : '', sub: worstSub },
        exp:    { label: t('dashboard.card.expectancy') || 'Beklenti (Exp.)', text: expText, cls: expVal === null ? '' : (expVal >= 0 ? 'up' : 'down'), sub: t('dashboard.card.expectancy_sub') || 'İşlem Başı Ort. K/Z' },
        payoff: { label: t('dashboard.card.payoff_ratio') || 'Payoff Ratio', text: payoffText, cls: 'info', sub: avgSub },
        spark: {
          pnls: (window.WwMetrics ? window.WwMetrics.chronological(closed) : closed).map(calcPnl),
          fmtMoney: fmtPnl,
          fmtRatio: function (v) { return v.toFixed(2) + 'x'; },
          tradeLabel: t('dashboard.card.trade') || 'İşlem'
        }
      };
      propCardEl.innerHTML = window.WWPropCardV2 ? window.WWPropCardV2.renderStandard(stdCtx) : legacyStdHtml;

      var editBtn = document.getElementById('standard-edit-goal-btn');
      if (editBtn) {
        editBtn.onclick = function () {
          var mainBtn = document.getElementById('edit-goal-btn');
          if (mainBtn) {
            mainBtn.click();
          } else {
            var modal = document.getElementById('goal-modal');
            if (modal) {
              modal.style.display = 'flex';
              modal.classList.add('active');
            }
          }
        };
      }

      if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        try {
          lucide.createIcons({ root: propCardEl });
        } catch (e) {
          lucide.createIcons();
        }
      }
    }

    function bindHudButtons(account, tmpl, nextPhaseIdx, warningsList) {
      var t = function (key, params) {
        return (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t(key, params) : key;
      };

      // Toggle View button
      var toggleBtn = document.getElementById('dashboard-toggle-view-btn');
      if (toggleBtn) {
        toggleBtn.onclick = function() {
          window._propViewMode = window._propViewMode === 'standard' ? 'prop' : 'standard';
          refreshDashboardPropBanner();
        };
      }

      // Prepare notices modal content
      var noticesBodyEl = document.getElementById('dashboard-prop-notices-body');
      var noticesDiscEl = document.getElementById('dashboard-prop-notices-disclaimer');
      if (noticesBodyEl) {
        var itemsHtml = '';
        (warningsList || []).forEach(function(w) {
          var msg = '';
          if (w === 'UNVERIFIED_PHASE_RULES') msg = t('prop.unverified_warning');
          else if (w === 'EQUITY_BASED_ESTIMATED') msg = t('prop.warn_equity_estimated');
          else if (w === 'INTRADAY_BREACH_POSSIBLE') msg = t('prop.warn_intraday_breach');
          else if (w === 'INTRADAY_ORDER_UNKNOWN') msg = t('prop.warn_intraday_order');
          else if (w === 'CONSISTENCY_NOT_MET') msg = t('prop.warn_consistency');
          else msg = w;
          itemsHtml += `
            <div class="prop-notice-item">
              <span>${escapeHtml(msg)}</span>
            </div>
          `;
        });
        noticesBodyEl.innerHTML = itemsHtml || `<div style="font-size:0.85rem;color:var(--muted);padding:0.5rem 0;">${escapeHtml(t('prop.no_warnings') || 'Aktif kural uyarısı bulunmuyor.')}</div>`;
      }
      if (noticesDiscEl) {
        noticesDiscEl.innerHTML = `
          <span>${escapeHtml(t('prop.disclaimer', { last_verified: (account.rules && account.rules.last_verified) || (tmpl && tmpl.last_verified) || '2026-10-04' }))}</span>
        `;
      }

      // Bind notices button
      var openNoticesBtn = document.getElementById('dashboard-open-notices-btn');
      if (openNoticesBtn) {
        openNoticesBtn.onclick = function() {
          var modal = document.getElementById('dashboard-prop-notices-modal');
          if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('active');
            if (typeof lucide !== 'undefined') lucide.createIcons();
          }
        };
      }

      // Bind advance button click
      var advBtn = document.getElementById('dashboard-advance-phase-btn');
      if (advBtn) {
        advBtn.onclick = function() {
          openAdvancePhaseModal(account, tmpl, nextPhaseIdx);
        };
      }
    }

    function updateTradesOnDateWarning(dateVal) {
      var warnBox = document.getElementById('advance-trades-warning');
      var warnText = document.getElementById('advance-trades-warning-text');
      var bumpBtn = document.getElementById('advance-bump-date-btn');
      if (!warnBox || !warnText || !dateVal) return;

      var tradesList = [];
      if (_currentPropSync && _currentPropSync.trades && Array.isArray(_currentPropSync.trades)) {
        tradesList = _currentPropSync.trades;
      } else if (window.wwCache && window.currentUser) {
        var jid = window.journal ? window.journal.getActiveJournalId() : null;
        tradesList = window.wwCache.get('trades_dashboard', window.currentUser.id, jid, ['trade_date']) || [];
      }

      var count = 0;
      for (var i = 0; i < tradesList.length; i++) {
        var td = String(tradesList[i].trade_date || '').slice(0, 10);
        if (td === dateVal) count++;
      }

      if (count > 0) {
        // Ertesi gün: takvim günü aritmetiği (eskiden yerel gece yarısı UTC'ye çevrilince UTC+ bölgelerde aynı gün çıkıyordu)
        var tomorrowStr = window.WwTime.addDays(dateVal, 1);
        var tFn = function(k, p) { return (window.i18n && window.i18n.t) ? window.i18n.t(k, p) : k; };
        warnText.textContent = tFn('prop.advance_trades_on_date_warn', { n: count, tomorrow: tomorrowStr }) || ('Bu tarihte ' + count + ' işlem var, yeni faza dahil edilecek. Başlangıç tarihini ertesi güne (' + tomorrowStr + ') almak ister misin?');
        if (bumpBtn) {
          bumpBtn.onclick = function() {
            var dateInput = document.getElementById('advance-phase-start-date');
            if (dateInput) {
              dateInput.value = tomorrowStr;
              updateTradesOnDateWarning(tomorrowStr);
            }
          };
        }
        warnBox.style.display = 'block';
      } else {
        warnBox.style.display = 'none';
      }
    }

    function openAdvancePhaseModal(account, tmpl, nextPhaseIdx) {
      var modal = document.getElementById('dashboard-advance-phase-modal');
      var dateInput = document.getElementById('advance-phase-start-date');
      var balInput = document.getElementById('advance-phase-starting-balance');
      var customChoice = document.getElementById('advance-custom-rules-choice');
      if (!modal || !dateInput || !balInput) return;

      // Başlangıç tarihi varsayılanı: prop hesabının sıfırlama saat dilimindeki bugün
      var todayStr;
      try { todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: account.reset_tz || window.WwTime.getTz() }).format(new Date()); }
      catch (e) { todayStr = window.WwTime.todayKey(); }
      dateInput.value = todayStr;
      balInput.value = account.starting_balance || 100000;

      // Show custom rules choice if account rules were customized
      if (customChoice) {
        var isCust = Boolean(account.rules && account.rules.is_customized);
        customChoice.style.display = isCust ? 'block' : 'none';
        var keepRadio = document.getElementById('advance-rules-keep');
        if (keepRadio) keepRadio.checked = true;
      }

      updateTradesOnDateWarning(todayStr);
      dateInput.onchange = function() { updateTradesOnDateWarning(dateInput.value); };
      dateInput.oninput = function() { updateTradesOnDateWarning(dateInput.value); };

      modal.style.display = 'flex';
      modal.classList.add('active');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function closeAdvancePhaseModal() {
      var modal = document.getElementById('dashboard-advance-phase-modal');
      if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
      }
    }

    document.addEventListener('DOMContentLoaded', function() {
      var closeBtn = document.getElementById('close-advance-modal');
      var cancelBtn = document.getElementById('cancel-advance-modal');
      var confirmBtn = document.getElementById('confirm-advance-modal');
      if (closeBtn) closeBtn.onclick = closeAdvancePhaseModal;
      if (cancelBtn) cancelBtn.onclick = closeAdvancePhaseModal;

      var closeNoticesBtn = document.getElementById('close-dashboard-prop-notices');
      if (closeNoticesBtn) {
        closeNoticesBtn.onclick = function() {
          var modal = document.getElementById('dashboard-prop-notices-modal');
          if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active');
          }
        };
      }

      var advModal = document.getElementById('dashboard-advance-phase-modal');
      if (advModal) {
        advModal.addEventListener('click', function(e) {
          if (e.target === advModal) closeAdvancePhaseModal();
        });
      }
      var noticesModal = document.getElementById('dashboard-prop-notices-modal');
      if (noticesModal) {
        noticesModal.addEventListener('click', function(e) {
          if (e.target === noticesModal) {
            noticesModal.style.display = 'none';
            noticesModal.classList.remove('active');
          }
        });
      }

      if (confirmBtn) {
        confirmBtn.onclick = async function() {
          if (!_currentPropSync || !_currentPropSync.account) return;
          var account = _currentPropSync.account;
          var nextPhaseIdx = (account.phase_index !== undefined ? account.phase_index + 1 : 1);
          var startDate = document.getElementById('advance-phase-start-date').value;
          var balance = Number(document.getElementById('advance-phase-starting-balance').value);
          var keepCustomRules = document.getElementById('advance-rules-keep') ? document.getElementById('advance-rules-keep').checked : false;
          var t = function (key) {
            return (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t(key) : key;
          };

          if (!startDate) {
            if (window.showToast) window.showToast(t('prop.err_select_start_date'), 'error');
            return;
          }
          if (isNaN(balance) || balance <= 0) {
            if (window.showToast) window.showToast(t('prop.err_invalid_balance'), 'error');
            return;
          }

          try {
            confirmBtn.disabled = true;
            await window.PropService.advancePhase(account.id, {
              newPhaseIndex: nextPhaseIdx,
              startDate: startDate,
              startingBalance: balance,
              keepCustomRules: keepCustomRules
            });
            if (window.showToast) window.showToast(t('prop.advance_success'), 'success');
            closeAdvancePhaseModal();
            refreshDashboardPropBanner();
          } catch (err) {
            if (window.showToast) window.showToast(err.message, 'error');
          } finally {
            confirmBtn.disabled = false;
          }
        };
      }

      // ============================================================
      // DUAL DONUT SLIDER (WIN/LOSS & LONG/SHORT)
      // ============================================================
      function initDonutSlider() {
        var card = document.getElementById('donut-slider-card');
        var track = document.getElementById('donut-slider-track');
        var prevBtn = document.getElementById('donut-prev-btn');
        var nextBtn = document.getElementById('donut-next-btn');
        var dots = document.querySelectorAll('#donut-slider-dots .donut-slider-dot');
        var titleEl = document.getElementById('donut-slider-title');
        if (!card || !track) return;

        var currentSlide = 0;
        var totalSlides = 2;

        function updateSlide(idx) {
          currentSlide = (idx + totalSlides) % totalSlides;
          track.style.transform = 'translateX(-' + (currentSlide * 100) + '%)';
          
          dots.forEach(function(dot, i) {
            if (i === currentSlide) {
              dot.classList.add('active');
            } else {
              dot.classList.remove('active');
            }
          });

          if (titleEl) {
            var t = function(key, fallback) {
              return (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t(key) : fallback;
            };
            if (currentSlide === 0) {
              titleEl.textContent = t('dashboard.chart.winloss') || 'Win / Loss Dağılımı';
              titleEl.setAttribute('data-i18n', 'dashboard.chart.winloss');
            } else {
              titleEl.textContent = t('dashboard.chart.direction') || 'Long / Short Dağılımı';
              titleEl.setAttribute('data-i18n', 'dashboard.chart.direction');
            }
          }
        }

        if (prevBtn) {
          prevBtn.onclick = function(e) {
            e.stopPropagation();
            updateSlide(currentSlide - 1);
          };
        }
        if (nextBtn) {
          nextBtn.onclick = function(e) {
            e.stopPropagation();
            updateSlide(currentSlide + 1);
          };
        }
        dots.forEach(function(dot) {
          dot.onclick = function(e) {
            e.stopPropagation();
            var slideIdx = parseInt(dot.getAttribute('data-slide'), 10) || 0;
            updateSlide(slideIdx);
          };
        });

        // Touch swipe support
        var touchStartX = 0;
        var touchEndX = 0;
        card.addEventListener('touchstart', function(e) {
          touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        card.addEventListener('touchend', function(e) {
          touchEndX = e.changedTouches[0].screenX;
          var diff = touchStartX - touchEndX;
          if (Math.abs(diff) > 40) {
            if (diff > 0) {
              updateSlide(currentSlide + 1);
            } else {
              updateSlide(currentSlide - 1);
            }
          }
        }, { passive: true });

        window._updateDonutSlider = updateSlide;
        updateSlide(0);
      }

      initDonutSlider();

      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
        if (typeof wwLog !== 'undefined' && wwLog.log) {
          wwLog.log('✅ Lucide icons initialized on dashboard!');
        }
      }
      refreshDashboardPropBanner();
    });

    DASH_PAGE.on(window, 'journal-changed', function() {
      refreshDashboardPropBanner();
    });
    DASH_PAGE.on(window, 'trade-saved', function() {
      refreshDashboardPropBanner();
    });
    DASH_PAGE.on(window, 'trade-deleted', function() {
      refreshDashboardPropBanner();
    });
    DASH_PAGE.on(window, 'dashboard-refreshed', function() {
      refreshDashboardPropBanner();
    });
    if (window.i18n && typeof window.i18n.onChange === 'function') {
      DASH_PAGE.onI18nChange(function() {
        refreshDashboardPropBanner();
        if (typeof window._updateDonutSlider === 'function') {
          window._updateDonutSlider(0);
        }
      });
    }
