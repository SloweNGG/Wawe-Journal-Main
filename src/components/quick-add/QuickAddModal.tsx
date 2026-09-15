import React, { useState, useEffect, useMemo, useCallback } from 'react';
import styles from './QuickAddModal.module.css';

export type InstrumentType = 'forex' | 'gold' | 'index' | 'crypto' | 'other';
export type TradeSide = 'BUY' | 'SELL';
export type ModalTab = 'price' | 'csv' | 'bulk';

interface StrategyOption {
  id: string;
  name: string;
}

export interface QuickAddModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  const [activeTab, setActiveTab] = useState<ModalTab>('price');
  const [side, setSide] = useState<TradeSide>('BUY');
  const [instrument, setInstrument] = useState<InstrumentType>('forex');
  const [customMultiplier, setCustomMultiplier] = useState<string>('1000');

  // Form alanları
  const [symbol, setSymbol] = useState<string>('EURUSD');
  const [lot, setLot] = useState<string>('1.00');
  const [entryPrice, setEntryPrice] = useState<string>('1.08500');
  const [exitPrice, setExitPrice] = useState<string>('1.09000');
  const [stopLoss, setStopLoss] = useState<string>('1.08000');
  const [takeProfit, setTakeProfit] = useState<string>('1.09500');
  const [strategyId, setStrategyId] = useState<string>('');
  const [strategies, setStrategies] = useState<StrategyOption[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [tradeDate, setTradeDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });

  // Bulk metin
  const [bulkText, setBulkText] = useState<string>('');

  // Durumlar
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Global window.quickAddOpen ve window.quickAddClose köprüsü
  const handleOpen = useCallback(() => {
    setErrorMsg(null);
    setInternalIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    if (controlledOnClose) {
      controlledOnClose();
    } else {
      setInternalIsOpen(false);
    }
  }, [controlledOnClose]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.quickAddOpen = handleOpen;
      window.quickAddClose = handleClose;
    }
  }, [handleOpen, handleClose]);

  // ESC tuşu ile kapatma
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, handleClose]);

  // Stratejileri yükle
  useEffect(() => {
    if (!isOpen) return;

    const loadStrategies = async () => {
      try {
        const sb = (window as any).sb;
        if (sb && typeof sb.from === 'function') {
          const { data } = await sb.from('strategies').select('id, name').order('name');
          if (data && Array.isArray(data)) {
            setStrategies(data);
          }
        }
      } catch (err) {
        console.warn('Stratejiler yüklenemedi:', err);
      }
    };

    loadStrategies();
  }, [isOpen]);

  // Enstrüman çarpanı
  const multiplier = useMemo(() => {
    switch (instrument) {
      case 'forex':
        return 100000;
      case 'gold':
        return 100;
      case 'index':
        return 10;
      case 'crypto':
        return 1;
      case 'other':
        return parseFloat(customMultiplier) || 1;
      default:
        return 100000;
    }
  }, [instrument, customMultiplier]);

  // Anlık PnL ve Risk / Reward hesaplaması
  const calculations = useMemo(() => {
    const entry = parseFloat(entryPrice);
    const exit = parseFloat(exitPrice);
    const l = parseFloat(lot);
    const sl = parseFloat(stopLoss);
    const tp = parseFloat(takeProfit);

    let pnl: number | null = null;
    let rr: string | null = null;

    if (!isNaN(entry) && !isNaN(exit) && !isNaN(l) && l > 0) {
      const direction = side === 'BUY' ? 1 : -1;
      pnl = direction * (exit - entry) * l * multiplier;
    }

    if (!isNaN(entry) && !isNaN(sl) && !isNaN(tp)) {
      const risk = Math.abs(entry - sl);
      const reward = Math.abs(tp - entry);
      if (risk > 0) {
        rr = (reward / risk).toFixed(2);
      }
    }

    return { pnl, rr };
  }, [entryPrice, exitPrice, lot, side, multiplier, stopLoss, takeProfit]);

  // Kaydetme işlemi
  const handleSaveTrade = async () => {
    setErrorMsg(null);

    const cleanSymbol = symbol.trim().toUpperCase();
    const cleanLot = parseFloat(lot);
    const cleanEntry = parseFloat(entryPrice);
    const cleanExit = parseFloat(exitPrice) || null;
    const cleanSl = parseFloat(stopLoss) || null;
    const cleanTp = parseFloat(takeProfit) || null;

    if (!cleanSymbol) {
      setErrorMsg('Lütfen sembol giriniz (örn: EURUSD, BTCUSDT).');
      return;
    }
    if (isNaN(cleanLot) || cleanLot <= 0) {
      setErrorMsg('Geçerli bir lot miktarı giriniz.');
      return;
    }
    if (isNaN(cleanEntry) || cleanEntry <= 0) {
      setErrorMsg('Geçerli bir giriş fiyatı giriniz.');
      return;
    }

    setIsSubmitting(true);

    try {
      const sb = (window as any).sb;
      const requireAuth = (window as any).requireAuth;
      const showToast = (window as any).showToast;

      let userId = null;
      if (typeof requireAuth === 'function') {
        const user = await requireAuth();
        if (user) userId = user.id;
      }

      const tradeData = {
        user_id: userId,
        symbol: cleanSymbol,
        direction: side === 'BUY' ? 'LONG' : 'SHORT',
        instrument: instrument,
        lot: cleanLot,
        entry_price: cleanEntry,
        exit_price: cleanExit,
        stop_loss: cleanSl,
        take_profit: cleanTp,
        pnl: calculations.pnl,
        rr_ratio: calculations.rr ? parseFloat(calculations.rr) : null,
        trade_date: tradeDate,
        strategy_id: strategyId || null,
        notes: notes.trim() || null,
        multiplier: multiplier,
        is_quick_entry: true,
      };

      if (sb && typeof sb.from === 'function') {
        const { error } = await sb.from('trades').insert([tradeData]);
        if (error) throw error;
      } else {
        console.log('Simüle edilen kayıt (Supabase bağlantısı yok):', tradeData);
      }

      if (typeof showToast === 'function') {
        showToast('İşlem başarıyla eklendi!', 'success');
      }

      handleClose();

      // Sayfadaki işlem listesini yenile
      if (typeof (window as any).loadTrades === 'function') {
        (window as any).loadTrades();
      } else if (typeof (window as any).initCalendar === 'function') {
        (window as any).initCalendar();
      }
    } catch (err: any) {
      console.error('İşlem kaydetme hatası:', err);
      setErrorMsg(err.message || 'Kayıt sırasında bir hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className={styles.header}>
          <h2>Yeni İşlem Ekle</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={handleClose}
            aria-label="Kapat"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 18, height: 18 }}>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* TABS */}
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'price' ? styles.active : ''}`}
            onClick={() => setActiveTab('price')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Fiyattan Hesapla
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'csv' ? styles.active : ''}`}
            onClick={() => setActiveTab('csv')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            CSV İçe Aktar
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'bulk' ? styles.active : ''}`}
            onClick={() => setActiveTab('bulk')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            Toplu Metin
          </button>
        </div>

        {/* BODY */}
        <div className={styles.body}>
          {errorMsg && (
            <div className={styles.errorAlert}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}

          {activeTab === 'price' && (
            <>
              {/* ENSTRÜMAN */}
              <div className={styles.field}>
                <label>Enstrüman Tipi</label>
                <div className={styles.instrumentGrid}>
                  <button
                    type="button"
                    className={`${styles.instrumentBtn} ${instrument === 'forex' ? styles.active : ''}`}
                    onClick={() => setInstrument('forex')}
                  >
                    Forex
                    <span className={styles.instLabel}>100.000</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.instrumentBtn} ${instrument === 'gold' ? styles.active : ''}`}
                    onClick={() => setInstrument('gold')}
                  >
                    Altın
                    <span className={styles.instLabel}>100</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.instrumentBtn} ${instrument === 'index' ? styles.active : ''}`}
                    onClick={() => setInstrument('index')}
                  >
                    Endeks
                    <span className={styles.instLabel}>10</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.instrumentBtn} ${instrument === 'crypto' ? styles.active : ''}`}
                    onClick={() => setInstrument('crypto')}
                  >
                    Kripto
                    <span className={styles.instLabel}>1</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.instrumentBtn} ${instrument === 'other' ? styles.active : ''}`}
                    onClick={() => setInstrument('other')}
                  >
                    Diğer
                    <span className={styles.instLabel}>Manuel</span>
                  </button>
                </div>
              </div>

              {instrument === 'other' && (
                <div className={styles.field}>
                  <label>Manuel Çarpan</label>
                  <input
                    type="number"
                    value={customMultiplier}
                    onChange={(e) => setCustomMultiplier(e.target.value)}
                    placeholder="1000"
                  />
                </div>
              )}

              {/* SEMBOL & LOT */}
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Sembol *</label>
                  <input
                    type="text"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="EURUSD"
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
                <div className={styles.field}>
                  <label>Lot *</label>
                  <div className={styles.lotWrap}>
                    <input
                      type="text"
                      value={lot}
                      onChange={(e) => setLot(e.target.value)}
                      placeholder="1.00"
                    />
                    <div className={styles.lotPresets}>
                      {['0.01', '0.10', '1.00'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className={`${styles.lotPreset} ${lot === preset ? styles.active : ''}`}
                          onClick={() => setLot(preset)}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* YÖN */}
              <div className={styles.field}>
                <label>İşlem Yönü</label>
                <div className={styles.sideToggle}>
                  <button
                    type="button"
                    className={`${styles.sideBtn} ${side === 'BUY' ? styles.activeBuy : ''}`}
                    onClick={() => setSide('BUY')}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                      <polyline points="3 17 9 11 13 15 21 6" />
                      <polyline points="15 6 21 6 21 12" />
                    </svg>
                    Alış (Buy)
                  </button>
                  <button
                    type="button"
                    className={`${styles.sideBtn} ${side === 'SELL' ? styles.activeSell : ''}`}
                    onClick={() => setSide('SELL')}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                      <polyline points="3 7 9 13 13 9 21 18" />
                      <polyline points="15 18 21 18 21 12" />
                    </svg>
                    Satış (Sell)
                  </button>
                </div>
              </div>

              {/* GİRİŞ & ÇIKIŞ FİYATLARI */}
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Giriş Fiyatı *</label>
                  <input
                    type="text"
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(e.target.value)}
                    placeholder="1.08500"
                  />
                </div>
                <div className={styles.field}>
                  <label>Çıkış Fiyatı</label>
                  <input
                    type="text"
                    value={exitPrice}
                    onChange={(e) => setExitPrice(e.target.value)}
                    placeholder="1.09000"
                  />
                </div>
              </div>

              {/* STOP LOSS & TAKE PROFIT */}
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Stop Loss</label>
                  <input
                    type="text"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    placeholder="1.08000"
                  />
                </div>
                <div className={styles.field}>
                  <label>Take Profit</label>
                  <input
                    type="text"
                    value={takeProfit}
                    onChange={(e) => setTakeProfit(e.target.value)}
                    placeholder="1.09500"
                  />
                </div>
              </div>

              {/* CANLI HESAPLAMA ÖNİZLEMESİ */}
              {(calculations.pnl !== null || calculations.rr !== null) && (
                <div
                  className={`${styles.previewBox} ${
                    calculations.pnl !== null
                      ? calculations.pnl >= 0
                        ? styles.pos
                        : styles.neg
                      : ''
                  }`}
                >
                  <div className={styles.previewRail} />
                  {calculations.pnl !== null && (
                    <div className={styles.previewItem}>
                      <span className={styles.previewLabel}>Tahmini K/Z</span>
                      <span
                        className={`${styles.previewVal} ${
                          calculations.pnl >= 0 ? styles.pos : styles.neg
                        }`}
                      >
                        {calculations.pnl >= 0 ? '+' : ''}$
                        {calculations.pnl.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  )}
                  {calculations.pnl !== null && calculations.rr !== null && (
                    <div className={styles.previewDivider} />
                  )}
                  {calculations.rr !== null && (
                    <div className={styles.previewItem}>
                      <span className={styles.previewLabel}>Risk / Reward</span>
                      <span className={`${styles.previewVal} ${styles.accent}`}>
                        1 : {calculations.rr}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* STRATEJİ & TARİH */}
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Strateji</label>
                  <div className={styles.strategyWrap}>
                    <select
                      value={strategyId}
                      onChange={(e) => setStrategyId(e.target.value)}
                    >
                      <option value="">— Strateji Yok —</option>
                      {strategies.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Tarih</label>
                  <input
                    type="date"
                    value={tradeDate}
                    onChange={(e) => setTradeDate(e.target.value)}
                  />
                </div>
              </div>

              {/* NOTLAR */}
              <div className={`${styles.field} ${styles.notesArea}`}>
                <label>Notlar</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="İşlem notları, psikolojik durum, gözlemler…"
                />
              </div>
            </>
          )}

          {activeTab === 'csv' && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <p style={{ color: 'var(--qa-muted)', fontSize: 13, marginBottom: '1.2rem' }}>
                MT4/MT5 veya Excel dışa aktarım CSV dosyasını yükleyin.
              </p>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={() => alert('CSV dosyası seçme özelliği hazır.')}
              >
                CSV Dosyası Seç
              </button>
            </div>
          )}

          {activeTab === 'bulk' && (
            <div>
              <p style={{ color: 'var(--qa-muted)', fontSize: 12, marginBottom: 8 }}>
                Her satıra bir işlem gelecek şekilde girin (sembol,yön,lot,giriş,çıkış,tarih):
              </p>
              <textarea
                rows={5}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder="EURUSD,LONG,0.10,1.08500,1.09000,2026-01-15"
                style={{
                  width: '100%',
                  background: 'var(--qa-surface2)',
                  border: '1px solid var(--qa-border)',
                  borderRadius: 'var(--qa-r-sm)',
                  padding: '0.65rem',
                  color: 'var(--qa-text)',
                  fontFamily: 'var(--qa-font-mono)',
                  fontSize: 12,
                }}
              />
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.btnCancel}
            onClick={handleClose}
            disabled={isSubmitting}
          >
            İptal
          </button>
          <button
            type="button"
            className={styles.btnSave}
            onClick={handleSaveTrade}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span>Kaydediliyor…</span>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Kaydet</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickAddModal;

