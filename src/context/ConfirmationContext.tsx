import React, { createContext, useContext, useState, useCallback } from 'react';
import { ConfirmationModal, ConfirmationOptions } from '../components/common/ConfirmationModal';

interface ConfirmationContextType {
  confirm: (options: ConfirmationOptions | string) => Promise<boolean>;
  notify: (options: ConfirmationOptions | string) => Promise<boolean>;
}

const ConfirmationContext = createContext<ConfirmationContextType | null>(null);

export const ConfirmationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    options: ConfirmationOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm = useCallback((options: ConfirmationOptions | string): Promise<boolean> => {
    const opts: ConfirmationOptions =
      typeof options === 'string'
        ? { description: options, isAlert: false }
        : { ...options, isAlert: false };

    return new Promise<boolean>((resolve) => {
      setModalState({
        isOpen: true,
        options: opts,
        resolve,
      });
    });
  }, []);

  const notify = useCallback((options: ConfirmationOptions | string): Promise<boolean> => {
    const opts: ConfirmationOptions =
      typeof options === 'string'
        ? { description: options, isAlert: true, confirmLabel: 'OK', variant: 'info' }
        : { ...options, isAlert: true, confirmLabel: options.confirmLabel || 'OK' };

    return new Promise<boolean>((resolve) => {
      setModalState({
        isOpen: true,
        options: opts,
        resolve,
      });
    });
  }, []);

  const handleClose = () => {
    if (modalState) {
      modalState.resolve(false);
      setModalState(null);
    }
  };

  const handleConfirm = () => {
    if (modalState) {
      modalState.resolve(true);
      setModalState(null);
    }
  };

  return (
    <ConfirmationContext.Provider value={{ confirm, notify }}>
      {children}
      {modalState && (
        <ConfirmationModal
          isOpen={modalState.isOpen}
          onClose={handleClose}
          onConfirm={handleConfirm}
          {...modalState.options}
        />
      )}
    </ConfirmationContext.Provider>
  );
};

export const useConfirmation = (): ConfirmationContextType => {
  const context = useContext(ConfirmationContext);
  if (!context) {
    throw new Error('useConfirmation must be used within a ConfirmationProvider');
  }
  return context;
};
