// ============================================================
// İŞLEM EKLE (ADD-TRADE) SAYFASI — sayfa script'i (add-trade-page.js)
// ============================================================
// Eskiden src/pages/add-trade.astro içinde satır içi <script is:inline> bloğuydu; HTML küçülsün, kod küçültülsün (minify)
// ve kalıcı önbelleğe (immutable, ?v=<içerik hash'i>) girsin diye buraya AYNEN taşındı.
// Sayfada bloğun eski yerinde yüklenir: <script src="/interface/add-trade/js/add-trade-page.js" is:inline data-page-script>.
// defer/async YOK: engelleyici klasik script olarak satır içiyle aynı anda çalışır (üstündeki DOM hazır, defer
// script'ler henüz çalışmadı). Üst seviye adlar global kalır (minify üst seviyeyi yeniden adlandırmaz).
// data-page-script ŞART: SPA router (SpaRouter.astro) bu dosyayı sayfaya her girişte yeniden çalıştırır, satır içi
// script'ler gibi. Bu yüzden üst seviyede const/let/class YAZMAYIN (ikinci girişte "already declared" hatası);
// var / function kullanın (tests/page-scripts.test.js kontrol eder).
// ============================================================
    // ⭐ INSTRUMENT_MULTIPLIERS kontrolü - eğer tanımlı değilse varsayılan değerleri ata
    if (typeof INSTRUMENT_MULTIPLIERS === 'undefined') {
      window.INSTRUMENT_MULTIPLIERS = {
        forex: 100000,
        gold: 100,
        index: 10,
        crypto: 1,
        other: 1
      };
    }

    var currentUser = null;
    var importLogs = [];
    var strategiesList = [];

    // ============================================================
    // TOPLU / CSV İÇE AKTARMA YARDIMCILARI
    // ============================================================
    // Yön: tanınmayan değer SHORT'a SESSİZCE düşmez, null döner (satır atlanır).
    function importDirection(raw) {
      if (typeof BrokerDictionary !== 'undefined' && BrokerDictionary.normalizeDirection) {
        return BrokerDictionary.normalizeDirection(raw);
      }
      var v = String(raw || '').toUpperCase().trim();
      if (v === 'BUY' || v === 'LONG') return 'LONG';
      if (v === 'SELL' || v === 'SHORT') return 'SHORT';
      return null;
    }

    // Enstrüman + çarpan sembolden türetilir ve PnL burada hesaplanıp saklanır.
    // (Eskiden her satır 'forex'/100000 ve pnl=null yazılıyor, XAUUSD/BTC gibi sembollerde
    // PnL 10^2-10^5 kat şişiyordu.) Yalnızca kapanmış işlemler: exit zorunlu.
    function importTradeFields(symbol, finalDir, entry, exit, lot) {
      var instrument = (typeof BrokerDictionary !== 'undefined' && BrokerDictionary.guessInstrument)
        ? BrokerDictionary.guessInstrument(symbol) : 'forex';
      var multiplier = ({ forex: 100000, gold: 100, index: 10, crypto: 1, other: 1 })[instrument] || 1;
      var raw = (finalDir === 'LONG' ? 1 : -1) * (exit - entry) * lot * multiplier;
      var curr = (typeof window.getCurrencySymbol === 'function' ? window.getCurrencySymbol() : '') || localStorage.getItem('ww_currency') || '$';
      var isEurUsdPair = /^EURUSD/.test(String(symbol).toUpperCase().replace(/[^A-Z]/g, ''));
      var gross = ((curr === '€' || curr === 'EUR') && isEurUsdPair && exit > 0) ? raw / exit : raw;
      gross = parseFloat(gross.toFixed(2));
      return { instrument: instrument, multiplier: multiplier, gross_pnl: gross, commission: 0, swap: 0, pnl: gross };
    }

    // ============================================================
    // STRATEJİ KUTUCUKLARI
    // ============================================================
    async function loadStrategyGrid() {
      var grid = document.getElementById('strategy-grid');
      if (!grid) return;

      try {
        var allStrategies = await getUserStrategies();
        
        var jid = window.journal ? window.journal.getActiveJournalId() : null;
        if (!jid) {
          if (typeof wwLog !== 'undefined') wwLog.warn('Aktif journal yok, veri yüklenmiyor');
          return;
        }

        var strategies = allStrategies.filter(function(s) { return s.journal_id === jid; });
        strategiesList = strategies;

        if (!strategies || strategies.length === 0) {
          grid.innerHTML = '\n            <div class="strategy-chip-empty">\n              <span data-i18n="addtrade.no_strategies">Henüz strateji eklenmemiş.</span>\n              <a href="/strategies" data-i18n="addtrade.create_strategy">Strateji oluştur →</a>\n            </div>\n          ';
          i18n.apply();
          return;
        }

        var currentSelected = document.getElementById('strategy-id-hidden').value;

        var html = '';
        for (var sIdx = 0; sIdx < strategies.length; sIdx++) {
          var s = strategies[sIdx];
          var isActive = s.id === currentSelected;
          html += '\n            <div class="strategy-chip ' + (isActive ? 'active' : '') + '" \n                 data-id="' + s.id + '" \n                 onclick="selectStrategy(\'' + s.id + '\')"\n                 title="' + (s.description || s.name) + '">\n              <span class="chip-color" style="background:' + (s.color || 'var(--ac)') + '"></span>\n              <span class="chip-name">' + (s.name.length > 15 ? s.name.slice(0,12)+'..' : s.name) + '</span>\n              <span class="chip-check">✓</span>\n            </div>\n          ';
        }

        grid.innerHTML = html;
        i18n.apply();

      } catch (e) {
        grid.innerHTML = '\n          <div class="strategy-chip-empty">\n            <span style="color:var(--red);">⚠️ Stratejiler yüklenemedi</span>\n          </div>\n        ';
      }
    }

    function selectStrategy(id) {
      var chips = document.querySelectorAll('.strategy-chip');
      chips.forEach(function(chip) {
        chip.classList.toggle('active', chip.dataset.id === id);
      });
      var hiddenEl = document.getElementById('strategy-id-hidden');
      if (hiddenEl) hiddenEl.value = id;
    }

    function clearStrategy() {
      document.querySelectorAll('.strategy-chip').forEach(function(chip) { chip.classList.remove('active'); });
      var hiddenEl = document.getElementById('strategy-id-hidden');
      if (hiddenEl) hiddenEl.value = '';
    }

    var clearBtn = document.getElementById('clear-strategy-btn');
    if (clearBtn) clearBtn.addEventListener('click', clearStrategy);

    // ============================================================
    // REFRESH STRATEGIES
    // ============================================================
    var refreshBtn = document.getElementById('refresh-strategies-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadStrategyGrid);

    // ============================================================
    // DIRECTION TOGGLE
    // ============================================================
    window.setDirection = function(val) {
      var dirEl = document.getElementById('direction');
      if (dirEl) dirEl.value = val;
      var longBtn = document.getElementById('btn-long');
      var shortBtn = document.getElementById('btn-short');
      if (longBtn) longBtn.classList.toggle('active', val === 'LONG');
      if (shortBtn) shortBtn.classList.toggle('active', val === 'SHORT');
      updatePreview();
    };

    // ============================================================
    // INSTRUMENT CHANGE
    // ============================================================
    var instrumentEl = document.getElementById('instrument');
    if (instrumentEl) {
      instrumentEl.addEventListener('change', function() {
        var customWrap = document.getElementById('custom-multiplier-wrap');
        if (customWrap) customWrap.style.display = this.value === 'other' ? 'flex' : 'none';
        updatePreview();
      });
    }

    // ============================================================
    // PREVIEW - calcPnL ve calcRR fonksiyonları script.js'den çağrılır
    // ============================================================
    var previewInputs = ['entry', 'exit', 'lot', 'instrument', 'custom-multiplier', 'sl', 'tp', 'commission', 'swap', 'symbol'];
    previewInputs.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', updatePreview);
        el.addEventListener('change', updatePreview);
      }
    });

    function getMultiplier() {
      var instEl = document.getElementById('instrument');
      var inst = instEl ? instEl.value : 'forex';
      if (inst === 'other') {
        var customEl = document.getElementById('custom-multiplier');
        var v = customEl ? parseFloat(customEl.value) : null;
        return isNaN(v) ? null : v;
      }
      if (typeof INSTRUMENT_MULTIPLIERS !== 'undefined') {
        return INSTRUMENT_MULTIPLIERS[inst] || 1;
      }
      return 1;
    }

    function updatePreview() {
      var entryEl = document.getElementById('entry');
      var exitEl = document.getElementById('exit');
      var lotEl = document.getElementById('lot');
      var dirEl = document.getElementById('direction');
      var slEl = document.getElementById('sl');
      var tpEl = document.getElementById('tp');
      
      var entry = entryEl ? entryEl.value : '';
      var exit = exitEl ? exitEl.value : '';
      var lot = lotEl ? lotEl.value : '';
      var dir = dirEl ? dirEl.value : '';
      var sl = slEl ? slEl.value : '';
      var tp = tpEl ? tpEl.value : '';
      var mult = getMultiplier();

      var bar = document.getElementById('preview-bar');
      var pnlWrap = document.getElementById('preview-pnl-wrap');
      var rrWrap = document.getElementById('preview-rr-wrap');
      var divider = document.getElementById('preview-divider');
      var pnlEl = document.getElementById('preview-pnl');
      var rrEl = document.getElementById('preview-rr');

      var hasPnl = false;
      var hasRr = false;

      if (entry && lot && dir && mult !== null) {
        if (exit) {
          var gross = 0;
          var comm = parseFloat(document.getElementById('commission')?.value) || 0;
          var swp = parseFloat(document.getElementById('swap')?.value) || 0;
          try {
            var direction = (dir && (dir.toUpperCase() === 'LONG' || dir.toUpperCase() === 'BUY')) ? 1 : -1;
            var raw = direction * (parseFloat(exit) - parseFloat(entry)) * parseFloat(lot) * mult;
            var curr = (typeof window.getCurrencySymbol === 'function' ? window.getCurrencySymbol() : '') || localStorage.getItem('ww_currency') || '$';
            var symEl = document.getElementById('symbol');
            var sym = (symEl ? symEl.value : '').trim().toUpperCase();
            if ((curr === '€' || curr === 'EUR') && /^EURUSD/.test(String(sym).toUpperCase().replace(/[^A-Z]/g, '')) && parseFloat(exit) > 0) {
              gross = raw / parseFloat(exit);
            } else {
              gross = raw;
            }
          } catch(e) {}
          var net = gross - comm + swp;
          if (pnlEl) {
            pnlEl.textContent = formatCurrency(net);
            pnlEl.className = 'p-val' + (net >= 0 ? ' pos' : ' neg');
          }
          hasPnl = true;
        }
        if (sl && tp) {
          var rr = null;
          try {
            if (typeof calcRR !== 'undefined') {
              rr = calcRR(entry, sl, tp, dir);
            } else {
              var e = parseFloat(entry);
              var s = parseFloat(sl);
              var t = parseFloat(tp);
              var risk = Math.abs(e - s);
              var reward = Math.abs(t - e);
              if (risk > 0) rr = (reward / risk).toFixed(2);
            }
          } catch(e) {}
          if (rr !== null && rrEl) {
            rrEl.textContent = '1 : ' + rr;
            hasRr = true;
          }
        }
      }

      if (pnlWrap) pnlWrap.style.display = hasPnl ? 'flex' : 'none';
      if (rrWrap) rrWrap.style.display = hasRr ? 'flex' : 'none';
      if (divider) divider.style.display = (hasPnl && hasRr) ? 'block' : 'none';
      if (bar) bar.style.display = (hasPnl || hasRr) ? 'flex' : 'none';
    }

    // ============================================================
    // CSV IMPORT
    // ============================================================
    var importBanner = document.getElementById('import-banner-trigger');
    if (importBanner) {
      importBanner.addEventListener('click', function() {
        var csvFile = document.getElementById('csv-file');
        if (csvFile) csvFile.click();
      });
    }
    
    var csvFileInput = document.getElementById('csv-file');
    if (csvFileInput) {
      csvFileInput.addEventListener('change', async function() {
        if (this.files && this.files[0]) await importCSV(this.files[0]);
      });
    }

    function validateAndFormatDate(dateString, rowNumber) {
      if (!dateString || !dateString.trim()) {
        importLogs.push('⚠️ Satır ' + (rowNumber || '?') + ': Tarih boş, bugün kullanıldı.');
        return new Date().toISOString();
      }
      dateString = dateString.trim();

      // Açık saat dilimi ofseti kontrolü (Z veya +03:00 / -05:00 vs.)
      var hasOffset = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(dateString);

      // 1. Standart ISO/SQL formatında saatli mi? örn: 2026-01-01 09:17:00 veya 2026-01-01T09:17:00
      var mIsoTime = dateString.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (mIsoTime) {
        if (hasOffset) {
          var parsedWithOffset = new Date(dateString);
          if (!isNaN(parsedWithOffset.getTime())) return parsedWithOffset.toISOString();
        }
        // Saat dilimi yoksa tarayıcının yerel saat dilimi kabul edip UTC'ye çevir
        var localD = new Date(+mIsoTime[1], +mIsoTime[2] - 1, +mIsoTime[3], +mIsoTime[4], +mIsoTime[5], +(mIsoTime[6] || 0));
        if (!isNaN(localD.getTime())) return localD.toISOString();
      }

      // 2. Yalnızca tarih YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return dateString;
      }

      // 3. DD.MM.YYYY veya DD/MM/YYYY saatli
      var mDmyTime = dateString.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (mDmyTime) {
        var d1 = +mDmyTime[1], mo1 = +mDmyTime[2];
        if (mo1 > 12 && d1 <= 12) { var tmp = d1; d1 = mo1; mo1 = tmp; }
        if (hasOffset) {
          var isoStr = mDmyTime[3] + '-' + String(mo1).padStart(2, '0') + '-' + String(d1).padStart(2, '0') + 'T' +
                       mDmyTime[4].padStart(2, '0') + ':' + mDmyTime[5].padStart(2, '0') + ':' +
                       (mDmyTime[6] || '00').padStart(2, '0') + (dateString.match(/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i)?.[0] || '');
          var parsedOffset = new Date(isoStr);
          if (!isNaN(parsedOffset.getTime())) return parsedOffset.toISOString();
        }
        var localDmy = new Date(+mDmyTime[3], mo1 - 1, d1, +mDmyTime[4], +mDmyTime[5], +(mDmyTime[6] || 0));
        if (!isNaN(localDmy.getTime())) return localDmy.toISOString();
      }

      // 4. DD.MM.YYYY veya DD/MM/YYYY sadece tarih
      var pDot = dateString.split('.');
      if (pDot.length === 3) {
        return pDot[2] + '-' + pDot[1].padStart(2, '0') + '-' + pDot[0].padStart(2, '0');
      }
      var pSlash = dateString.split('/');
      if (pSlash.length === 3) {
        var p0 = +pSlash[0], p1 = +pSlash[1], p2 = pSlash[2];
        if (p0 > 12 && p1 <= 12) {
          return p2 + '-' + String(p1).padStart(2, '0') + '-' + String(p0).padStart(2, '0');
        }
        return p2 + '-' + String(p0).padStart(2, '0') + '-' + String(p1).padStart(2, '0');
      }

      // 5. JavaScript Date parsing fallback
      var d = new Date(dateString);
      if (!isNaN(d.getTime())) {
        return d.toISOString();
      }

      importLogs.push('❌ Satır ' + (rowNumber || '?') + ': Geçersiz tarih "' + dateString + '", bugün kullanıldı.');
      return new Date().toISOString();
    }

    function renderImportLog() {
      var el = document.getElementById('import-log');
      if (el) {
        if (importLogs.length > 0) {
          el.style.display = 'block';
          el.innerHTML = importLogs.map(function(l) { return '<div>' + l + '</div>'; }).join('');
        } else {
          el.style.display = 'none';
          el.innerHTML = '';
        }
      }
    }

    async function importCSV(file) {
      var progressDiv = document.getElementById('import-progress');
      if (progressDiv) progressDiv.style.display = 'flex';
      importLogs = [];
      renderImportLog();

      try {
        var text = await file.text();
        var lines = text.split('\n').filter(function(l) { return l.trim(); });

        if (lines.length < 2) {
          showToast(i18n.t('addtrade.csv_no_data'), 'error');
          if (progressDiv) progressDiv.style.display = 'none';
          return;
        }

        var headers = lines[0].split(',').map(function(h) { return h.trim().toLowerCase(); });
        var imported = 0, failed = 0, skippedDuplicates = 0;
        var activeJournalId = window.journal ? window.journal.getActiveJournalId() : null;

        // ⭐ Duplicate (Mükerrer İşlem) Önleme - Mevcut defterdeki işlemleri sayfalı çek
        var existingSignatures = new Map();
        try {
          var from = 0;
          var pageSize = 1000;
          var hasMore = true;

          while (hasMore) {
            // Mükerrer kontrolü yalnızca CANLI işlemlerle: bir backtest aynasıyla aynı imzalı gerçek işlem atlanmasın
            var { data: existingData, error: fetchErr } = await window.WwTrades.applyScope(
              sb.from('trades')
                .select('symbol, direction, entry_price, exit_price, lot, trade_date')
                .eq('journal_id', activeJournalId),
              'live'
            )
              .order('trade_date', { ascending: false })
              .order('id', { ascending: true })
              .range(from, from + pageSize - 1);

            if (fetchErr) {
              throw fetchErr;
            }

            if (existingData && existingData.length > 0) {
              existingData.forEach(function(et) {
                var sig = (et.symbol || '').toUpperCase() + '|' +
                          (et.direction || '').toUpperCase() + '|' +
                          Number(et.entry_price || 0).toFixed(4) + '|' +
                          (et.exit_price != null ? Number(et.exit_price).toFixed(4) : '') + '|' +
                          Number(et.lot || 0).toFixed(4) + '|' +
                          String(et.trade_date || '').substring(0, 10);
                existingSignatures.set(sig, (existingSignatures.get(sig) || 0) + 1);
              });
              if (existingData.length < pageSize) {
                hasMore = false;
              } else {
                from += pageSize;
              }
            } else {
              hasMore = false;
            }
          }
        } catch (fetchErr) {
          console.error('Mevcut işlemler sorgulanamadı:', fetchErr);
          if (progressDiv) progressDiv.style.display = 'none';
          showToast('Mevcut işlemler yüklenirken hata oluştu: ' + fetchErr.message + '. Yarım veriyle işleme devam edilmedi.', 'error');
          return;
        }

        var tradesToInsert = [];
        var sigOccurrences = new Map();

        for (var i = 1; i < lines.length; i++) {
          var values = lines[i].split(',');
          if (values.length < 5) {
            importLogs.push('⚠️ Satır ' + i + ': Yetersiz sütun (' + values.length + '), atlandı.');
            failed++; continue;
          }

          var row = {};
          for (var hIdx = 0; hIdx < headers.length; hIdx++) {
            row[headers[hIdx]] = values[hIdx] ? values[hIdx].trim() : '';
          }

          var symbol = (row.symbol || row.sembol || '').toUpperCase();
          var direction = (row.yon || row.direction || '').toUpperCase();
          var lot = parseFloat(row.lot || 0);
          var entry = parseFloat(row.entry || row.giris || row.entry_price || 0);
          var exit = parseFloat(row.exit || row.cikis || row.exit_price);
          var rawDate = row.tarih || row.date || '';
          var tradeDate = validateAndFormatDate(rawDate, i);

          if (!symbol || !direction || !lot || !entry) {
            importLogs.push('❌ Satır ' + i + ': Zorunlu alan eksik, atlandı.');
            failed++; continue;
          }
          if (!exit || isNaN(exit)) {
            importLogs.push('❌ Satır ' + i + ': Çıkış fiyatı yok (yalnızca kapanmış işlemler eklenir), atlandı.');
            failed++; continue;
          }

          var finalDir = importDirection(direction);
          if (!finalDir) {
            importLogs.push('❌ Satır ' + i + ': Yön anlaşılamadı ("' + direction + '"), atlandı.');
            failed++; continue;
          }

          // Duplicate kontrolü
          var sig = symbol + '|' + finalDir + '|' +
                    Number(entry || 0).toFixed(4) + '|' +
                    (exit != null ? Number(exit).toFixed(4) : '') + '|' +
                    Number(lot || 0).toFixed(4) + '|' +
                    String(tradeDate || '').substring(0, 10);

          if (existingSignatures.get(sig) > 0) {
            existingSignatures.set(sig, existingSignatures.get(sig) - 1);
            skippedDuplicates++;
            importLogs.push('ℹ️ Satır ' + i + ': ' + symbol + ' (' + tradeDate + ') mükerrer işlem, atlandı.');
            continue;
          }

          var baseHash = symbol + '|' + finalDir + '|' +
                         Number(entry || 0).toFixed(4) + '|' +
                         (exit != null ? Number(exit).toFixed(4) : '') + '|' +
                         Number(lot || 0).toFixed(4) + '|' +
                         String(tradeDate || '').trim();
          var occ = (sigOccurrences.get(baseHash) || 0) + 1;
          sigOccurrences.set(baseHash, occ);
          var ticket = row.ticket || row.order_id || row.id || occ;
          var importHash = baseHash + '|' + ticket;

          var calc = importTradeFields(symbol, finalDir, entry, exit, lot);
          tradesToInsert.push({
            user_id: currentUser.id, journal_id: activeJournalId, symbol: symbol, direction: finalDir,
            instrument: calc.instrument, multiplier: calc.multiplier, lot: lot, entry_price: entry,
            exit_price: exit, trade_date: tradeDate,
            gross_pnl: calc.gross_pnl, commission: calc.commission, swap: calc.swap, pnl: calc.pnl,
            notes: 'CSV Import - ' + new Date().toLocaleString('tr-TR'),
            import_hash: importHash
          });
        }

        // 200'lük chunk'lar halinde toplu insert
        var CHUNK_SIZE = 200;
        for (var cStart = 0; cStart < tradesToInsert.length; cStart += CHUNK_SIZE) {
          var chunk = tradesToInsert.slice(cStart, cStart + CHUNK_SIZE);
          var { error } = await sb.from('trades').insert(chunk);
          if (error) {
            var isDuplicateError = error.code === '23505' || (error.message && error.message.toLowerCase().includes('duplicate'));
            if (isDuplicateError) {
              for (var cItem = 0; cItem < chunk.length; cItem++) {
                var singleItem = chunk[cItem];
                var { error: sErr } = await sb.from('trades').insert([singleItem]);
                if (sErr) {
                  if (sErr.code === '23505' || (sErr.message && sErr.message.toLowerCase().includes('duplicate'))) {
                    skippedDuplicates++;
                    importLogs.push('ℹ️ ' + singleItem.symbol + ' (' + singleItem.trade_date + ') DB mükerrer kısıtı, atlandı.');
                  } else {
                    importLogs.push('❌ ' + singleItem.symbol + ': ' + sErr.message);
                    failed++;
                  }
                } else {
                  imported++;
                }
              }
            } else {
              importLogs.push('❌ Toplu kayıt hatası: ' + error.message);
              failed += chunk.length;
            }
          } else {
            imported += chunk.length;
          }
        }

        renderImportLog();
        if (progressDiv) progressDiv.style.display = 'none';
        if (csvFileInput) csvFileInput.value = '';

        if (imported > 0) {
          try {
            if (window.wwCache) window.wwCache.invalidate('trades');
            window.dispatchEvent(new CustomEvent('trade-saved'));
          } catch(e) {}
          var msg = imported + ' işlem içe aktarıldı' + 
                    (skippedDuplicates > 0 ? ' (' + skippedDuplicates + ' mükerrer atlandı)' : '') + 
                    (failed > 0 ? ', ' + failed + ' başarısız' : '') + '.';
          showToast(msg, failed > 0 ? 'error' : 'success');
          setTimeout(function() { window.location.href = '/trades'; }, 2000);
        } else if (skippedDuplicates > 0 && failed === 0) {
          showToast('Tüm işlemler (' + skippedDuplicates + ') zaten kayıtlı! Mükerrer kayıt oluşturulmadı.', 'info');
        } else {
          showToast('İşlem eklenemedi' + (failed > 0 ? ' (' + failed + ' başarısız)' : '') + '.', 'error');
        }
      } catch(e) {
        if (progressDiv) progressDiv.style.display = 'none';
        showToast('CSV okuma hatası: ' + e.message, 'error');
      }
    }

    // ============================================================
    // BULK IMPORT (TOPLU EKLEME)
    // ============================================================
    var bulkOverlay = document.getElementById('bulk-import-overlay');
    var bulkTextarea = document.getElementById('bulk-textarea');
    var bulkProgress = document.getElementById('bulk-progress');
    var bulkFill = document.getElementById('bulk-fill');
    var bulkStatus = document.getElementById('bulk-status');

    var bulkImportBtn = document.getElementById('bulk-import-btn');
    if (bulkImportBtn) {
      bulkImportBtn.addEventListener('click', function() {
        if (bulkOverlay) bulkOverlay.classList.add('active');
        if (bulkTextarea) bulkTextarea.value = '';
        if (bulkProgress) bulkProgress.style.display = 'none';
      });
    }

    var bulkCancelBtn = document.getElementById('bulk-cancel-btn');
    if (bulkCancelBtn) {
      bulkCancelBtn.addEventListener('click', function() {
        if (bulkOverlay) bulkOverlay.classList.remove('active');
      });
    }

    if (bulkOverlay) {
      bulkOverlay.addEventListener('click', function(e) {
        if (e.target === bulkOverlay) bulkOverlay.classList.remove('active');
      });
    }

    var bulkConfirmBtn = document.getElementById('bulk-confirm-btn');
    if (bulkConfirmBtn) {
      bulkConfirmBtn.addEventListener('click', async function() {
        if (!bulkTextarea) return;
        var text = bulkTextarea.value.trim();
        if (!text) {
          showToast('Lütfen en az bir işlem girin!', 'error');
          return;
        }

        var lines = text.split('\n').filter(function(l) { return l.trim(); });
        if (lines.length === 0) {
          showToast('Lütfen en az bir işlem girin!', 'error');
          return;
        }

        var trades = [];
        var errors = [];
        var skippedDuplicates = 0;
        var defaultDate = window.WwTime ? window.WwTime.todayKey() : new Date().toISOString().split('T')[0];
        var activeJournalId = window.journal ? window.journal.getActiveJournalId() : null;

        // Duplicate kontrolü için mevcut işlemleri sayfalı al
        var existingSignatures = new Map();
        try {
          var from = 0;
          var pageSize = 1000;
          var hasMore = true;

          while (hasMore) {
            // Mükerrer kontrolü yalnızca CANLI işlemlerle: bir backtest aynasıyla aynı imzalı gerçek işlem atlanmasın
            var { data: existingData, error: fetchErr } = await window.WwTrades.applyScope(
              sb.from('trades')
                .select('symbol, direction, entry_price, exit_price, lot, trade_date')
                .eq('journal_id', activeJournalId),
              'live'
            )
              .order('trade_date', { ascending: false })
              .order('id', { ascending: true })
              .range(from, from + pageSize - 1);

            if (fetchErr) throw fetchErr;

            if (existingData && existingData.length > 0) {
              existingData.forEach(function(et) {
                var sig = (et.symbol || '').toUpperCase() + '|' +
                          (et.direction || '').toUpperCase() + '|' +
                          Number(et.entry_price || 0).toFixed(4) + '|' +
                          (et.exit_price != null ? Number(et.exit_price).toFixed(4) : '') + '|' +
                          Number(et.lot || 0).toFixed(4) + '|' +
                          String(et.trade_date || '').substring(0, 10);
                existingSignatures.set(sig, (existingSignatures.get(sig) || 0) + 1);
              });
              if (existingData.length < pageSize) {
                hasMore = false;
              } else {
                from += pageSize;
              }
            } else {
              hasMore = false;
            }
          }
        } catch (fetchErr) {
          console.error('Mevcut işlemler sorgulanamadı:', fetchErr);
          showToast('Mevcut işlemler yüklenirken hata oluştu: ' + fetchErr.message + '. Yarım veriyle işleme devam edilmedi.', 'error');
          return;
        }

        var sigOccurrences = new Map();

        for (var lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          var parts = lines[lineIdx].split(',').map(function(p) { return p.trim(); });
          if (parts.length < 5) {
            errors.push('Satır ' + (lineIdx+1) + ': Yetersiz alan (' + parts.length + ' alan, en az 5 gerekli)');
            continue;
          }

          var symbol = parts[0].toUpperCase();
          var direction = parts[1].toUpperCase();
          var lot = parseFloat(parts[2]);
          var entry = parseFloat(parts[3]);
          var exit = parseFloat(parts[4]);
          var date = parts[5] ? validateAndFormatDate(parts[5], lineIdx+1) : defaultDate;
          var notes = parts[6] || 'Toplu ekleme - ' + new Date().toLocaleString('tr-TR');

          if (!symbol || !direction || isNaN(lot) || lot <= 0 || isNaN(entry) || isNaN(exit)) {
            errors.push('Satır ' + (lineIdx+1) + ': Zorunlu alanlar eksik (sembol, yön, lot, giriş, çıkış). Yalnızca kapanmış işlemler eklenir.');
            continue;
          }

          var finalDir = importDirection(direction);
          if (!finalDir) {
            errors.push('Satır ' + (lineIdx+1) + ': Yön anlaşılamadı ("' + direction + '")');
            continue;
          }

          // Duplicate kontrolü
          var sig = symbol + '|' + finalDir + '|' +
                    Number(entry || 0).toFixed(4) + '|' +
                    (exit != null ? Number(exit).toFixed(4) : '') + '|' +
                    Number(lot || 0).toFixed(4) + '|' +
                    String(date || '').substring(0, 10);

          if (existingSignatures.get(sig) > 0) {
            existingSignatures.set(sig, existingSignatures.get(sig) - 1);
            skippedDuplicates++;
            continue;
          }

          var baseHash = symbol + '|' + finalDir + '|' +
                         Number(entry || 0).toFixed(4) + '|' +
                         (exit != null ? Number(exit).toFixed(4) : '') + '|' +
                         Number(lot || 0).toFixed(4) + '|' +
                         String(date || '').trim();
          var occ = (sigOccurrences.get(baseHash) || 0) + 1;
          sigOccurrences.set(baseHash, occ);
          var importHash = baseHash + '|' + occ;

          var calc = importTradeFields(symbol, finalDir, entry, exit, lot);
          trades.push({
            user_id: currentUser.id,
            journal_id: activeJournalId,
            symbol: symbol,
            direction: finalDir,
            instrument: calc.instrument,
            lot: lot,
            entry_price: entry,
            exit_price: exit,
            trade_date: date,
            notes: notes || null,
            multiplier: calc.multiplier,
            gross_pnl: calc.gross_pnl,
            commission: calc.commission,
            swap: calc.swap,
            pnl: calc.pnl,
            import_hash: importHash
          });
        }

        if (errors.length > 0) {
          showToast(errors.length + ' hata var!', 'error');
          if (bulkProgress) bulkProgress.style.display = 'block';
          if (bulkFill) {
            bulkFill.style.width = '100%';
            bulkFill.style.background = 'var(--red)';
          }
          if (bulkStatus) bulkStatus.textContent = '❌ ' + errors.length + ' hata: ' + errors.join('; ');
          setTimeout(function() { 
            if (bulkProgress) bulkProgress.style.display = 'none'; 
            if (bulkFill) bulkFill.style.width = '0%'; 
          }, 3000);
          return;
        }

        if (trades.length === 0) {
          if (skippedDuplicates > 0) {
            showToast('Tüm işlemler (' + skippedDuplicates + ') zaten kayıtlı! Mükerrer kayıt eklenmedi.', 'info');
          } else {
            showToast('Geçerli işlem bulunamadı!', 'error');
          }
          return;
        }

        if (bulkProgress) bulkProgress.style.display = 'block';
        if (bulkFill) {
          bulkFill.style.width = '0%';
          bulkFill.style.background = 'linear-gradient(90deg, var(--accent), var(--accent2))';
        }
        if (bulkStatus) bulkStatus.textContent = '0 / ' + trades.length + ' işlem ekleniyor...';

        var success = 0;
        var failed = 0;
        var CHUNK_SIZE = 200;

        for (var tIdx = 0; tIdx < trades.length; tIdx += CHUNK_SIZE) {
          var chunk = trades.slice(tIdx, tIdx + CHUNK_SIZE);
          var { error } = await sb.from('trades').insert(chunk);
          if (error) {
            var isDuplicateError = error.code === '23505' || (error.message && error.message.toLowerCase().includes('duplicate'));
            if (isDuplicateError) {
              for (var cItem = 0; cItem < chunk.length; cItem++) {
                var singleItem = chunk[cItem];
                var { error: sErr } = await sb.from('trades').insert([singleItem]);
                if (sErr) {
                  if (sErr.code === '23505' || (sErr.message && sErr.message.toLowerCase().includes('duplicate'))) {
                    skippedDuplicates++;
                  } else {
                    failed++;
                    errors.push(singleItem.symbol + ': ' + sErr.message);
                  }
                } else {
                  success++;
                }
              }
            } else {
              failed += chunk.length;
              errors.push(error.message);
            }
          } else {
            success += chunk.length;
          }
          var progress = (Math.min(tIdx + CHUNK_SIZE, trades.length) / trades.length) * 100;
          if (bulkFill) bulkFill.style.width = progress + '%';
          if (bulkStatus) bulkStatus.textContent = success + ' / ' + trades.length + ' işlem eklendi (' + failed + ' başarısız)';
        }

        if (errors.length > 0) {
          if (bulkFill) {
            bulkFill.style.background = 'var(--red)';
          }
          if (bulkStatus) bulkStatus.textContent = '⚠️ ' + success + ' işlem eklendi, ' + failed + ' hata!';
          setTimeout(function() { 
            if (bulkProgress) bulkProgress.style.display = 'none'; 
            if (bulkFill) bulkFill.style.width = '0%'; 
          }, 3000);
          showToast(success + ' işlem eklendi, ' + failed + ' hata!', 'error');
        } else {
          if (bulkFill) {
            bulkFill.style.width = '100%';
            bulkFill.style.background = 'var(--green)';
          }
          if (bulkStatus) bulkStatus.textContent = '✅ ' + success + ' işlem başarıyla eklendi!';
          try {
            if (window.wwCache) window.wwCache.invalidate('trades');
            window.dispatchEvent(new CustomEvent('trade-saved'));
          } catch(e) {}
          setTimeout(function() {
            if (bulkOverlay) bulkOverlay.classList.remove('active');
            if (bulkProgress) bulkProgress.style.display = 'none';
            if (bulkFill) bulkFill.style.width = '0%';
            window.location.href = '/trades';
          }, 1500);
          showToast(success + ' işlem başarıyla eklendi!', 'success');
        }
      });
    }

    // ============================================================
    // SAVE TRADE
    // ============================================================
    var saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function() {
        var symbolEl = document.getElementById('symbol');
        var directionEl = document.getElementById('direction');
        var instrumentEl = document.getElementById('instrument');
        var lotEl = document.getElementById('lot');
        var entryEl = document.getElementById('entry');
        var exitEl = document.getElementById('exit');
        var slEl = document.getElementById('sl');
        var tpEl = document.getElementById('tp');
        var tradeDateEl = document.getElementById('trade-date');
        var notesEl = document.getElementById('notes');
        var strategyIdEl = document.getElementById('strategy-id-hidden');
        var errEl = document.getElementById('err');
        
        var symbol = symbolEl ? symbolEl.value.trim().toUpperCase() : '';
        var direction = directionEl ? directionEl.value : '';
        var instrument = instrumentEl ? instrumentEl.value : 'forex';
        var lot = lotEl ? parseFloat(lotEl.value) : 0;
        var entry = entryEl ? parseFloat(entryEl.value) : 0;
        var exit = exitEl ? parseFloat(exitEl.value) : null;
        var sl = slEl ? parseFloat(slEl.value) : null;
        var tp = tpEl ? parseFloat(tpEl.value) : null;
        var tradeDate = tradeDateEl ? tradeDateEl.value : '';
        var notes = notesEl ? notesEl.value.trim() : '';
        var strategyId = strategyIdEl ? strategyIdEl.value || null : null;
        var mult = getMultiplier();
        
        if (errEl) errEl.style.display = 'none';

        if (!symbol || !direction || !lot || !entry || !tradeDate) {
          if (errEl) {
            errEl.textContent = i18n.t('addtrade.required_fields');
            errEl.style.display = 'block';
          }
          return;
        }
        // 'Açık işlem' kavramı yok: çıkış fiyatı zorunlu
        if (!exit || isNaN(exit)) {
          if (errEl) {
            errEl.textContent = i18n.t('addtrade.exit_required');
            errEl.style.display = 'block';
          }
          return;
        }
        if (instrument === 'other' && !mult) {
          if (errEl) {
            errEl.textContent = i18n.t('addtrade.custom_multiplier_required');
            errEl.style.display = 'block';
          }
          return;
        }

        var btn = document.getElementById('save-btn');
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;margin:0 auto;"></div>';
        }

        var pnl = null;
        var rr = null;
        try {
          if (typeof calcPnL !== 'undefined' && exit) {
            pnl = calcPnL(entry, exit, lot, direction, 'other', mult);
          }
          if (typeof calcRR !== 'undefined' && sl && tp) {
            rr = calcRR(entry, sl, tp, direction);
          }
        } catch(e) {}

        var comm = parseFloat(document.getElementById('commission')?.value) || 0;
        var swp = parseFloat(document.getElementById('swap')?.value) || 0;
        var gross = pnl;
        var curr = (typeof window.getCurrencySymbol === 'function' ? window.getCurrencySymbol() : '') || localStorage.getItem('ww_currency') || '$';
        if (gross !== null && (curr === '€' || curr === 'EUR') && /^EURUSD/.test(String(symbol).toUpperCase().replace(/[^A-Z]/g, '')) && exit > 0) {
          gross = parseFloat((gross / exit).toFixed(2));
        } else if (gross !== null) {
          gross = parseFloat(gross.toFixed(2));
        }
        var net = gross !== null ? parseFloat((gross - comm + swp).toFixed(2)) : null;

        var { error } = await sb.from('trades').insert([{
          user_id: currentUser.id, journal_id: window.journal.getActiveJournalId(), symbol: symbol, direction: direction, instrument: instrument, lot: lot,
          entry_price: entry, exit_price: exit, stop_loss: sl, take_profit: tp,
          gross_pnl: gross, commission: comm, swap: swp,
          trade_date: tradeDate, notes: notes || null, pnl: net,
          rr_ratio: rr ? parseFloat(rr) : null, multiplier: mult, strategy_id: strategyId
        }]);

        if (error) {
          if (errEl) {
            errEl.textContent = i18n.t('addtrade.save_error') + error.message;
            errEl.style.display = 'block';
          }
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> ' + i18n.t('common.save');
          }
          return;
        }

        showToast(i18n.t('addtrade.save_success'));
        try {
          if (window.wwCache) window.wwCache.invalidate('trades');
          window.dispatchEvent(new CustomEvent('trade-saved'));
          if (window.PropService && window.journal) {
            var jid = window.journal.getActiveJournalId();
            window.PropService.syncPropAccountStatus(jid).then(function(pSync) {
              if (pSync && pSync.status) {
                window.PropService.checkAndNotifyPropAccount(pSync.account, pSync.status);
              }
            }).catch(function() {});
          }
        } catch (e) {}
        setTimeout(function() { window.location.href = '/trades'; }, 1200);
      });
    }

    // ============================================================
    // INIT
    // ============================================================
    (async function() {
      try {
        currentUser = await requireAuth();
        if (!currentUser) return;

  if (!window.journal) {
    if (typeof wwLog !== 'undefined') wwLog.warn('journal.js henüz yüklenmedi, atlanıyor');
    return;
  }
  await window.journal.ensureActiveJournal(currentUser.id);
        
        var dateEl = document.getElementById('trade-date');
        if (dateEl) dateEl.value = window.WwTime ? window.WwTime.todayKey() : new Date().toISOString().split('T')[0];

        if (typeof isAdmin === 'function' && isAdmin(currentUser)) {
          var adminLink = document.getElementById('admin-link');
          if (adminLink) adminLink.style.display = 'inline';
          var adminLinkMobile = document.getElementById('admin-link-mobile');
          if (adminLinkMobile) adminLinkMobile.style.display = 'block';
        }

        await loadStrategyGrid();
      } catch(e) {}
    })();

    // ============================================================
    // DECIMAL FIX
    // ============================================================
    // applyDecimalFix bundle.js'ten (defer modül) gelir; bu inline script ondan önce
    // çalıştığı için DOMContentLoaded'ı bekle (önceden "applyDecimalFix is not defined")
    document.addEventListener('DOMContentLoaded', function() {
      applyDecimalFix(['lot','entry','exit','sl','tp','custom-multiplier']);
    });

