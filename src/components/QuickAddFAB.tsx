import React, { useState } from 'react';
import styles from './quick-add/QuickAddModal.module.css';

export interface QuickAddFABProps {
  id?: string;
  className?: string;
  ariaLabel?: string;
  title?: string;
  onClick?: () => void;
}

declare global {
  interface Window {
    quickAddOpen?: () => void;
    wwLog?: {
      log: (...args: any[]) => void;
      warn: (...args: any[]) => void;
      error: (...args: any[]) => void;
    };
  }
}

export const QuickAddFAB: React.FC<QuickAddFABProps> = ({
  id = 'quick-add-fab',
  className = styles.quickAddFab,
  ariaLabel = 'Hızlı İşlem Ekle',
  title = 'Hızlı İşlem Ekle',
  onClick,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (onClick) {
      onClick();
      return;
    }

    // Mevcut Vanilla JS Quick Add Modal'ı tetikle
    if (typeof window !== 'undefined' && typeof window.quickAddOpen === 'function') {
      window.quickAddOpen();
      if (window.wwLog?.log) {
        window.wwLog.log('🚀 QuickAddFAB (TSX) tetiklendi.');
      }
    } else {
      console.warn('quickAddOpen fonksiyonu henüz yüklenmedi veya bulunamadı.');
      // 300ms sonra tekrar deneme
      setTimeout(() => {
        if (typeof window !== 'undefined' && typeof window.quickAddOpen === 'function') {
          window.quickAddOpen();
        } else {
          alert('Hızlı işlem penceresi yüklenemedi. Lütfen sayfayı yenileyiniz.');
        }
      }, 300);
    }
  };

  return (
    <button
      type="button"
      id={id}
      className={className}
      aria-label={ariaLabel}
      title={title}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        transform: isHovered ? 'scale(1.08)' : 'scale(1)',
        transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.15s ease, border-color 0.15s ease',
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  );
};

export default QuickAddFAB;

