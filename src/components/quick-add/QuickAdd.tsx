import React, { useState, useEffect, useCallback } from 'react';
import QuickAddFAB from '../QuickAddFAB';
import QuickAddModal from './QuickAddModal';

export const QuickAdd: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.quickAddOpen = openModal;
      window.quickAddClose = closeModal;
    }
  }, [openModal, closeModal]);

  return (
    <>
      <QuickAddFAB onClick={openModal} />
      <QuickAddModal isOpen={isOpen} onClose={closeModal} />
    </>
  );
};

export default QuickAdd;

