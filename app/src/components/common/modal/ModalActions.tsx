import React, { ReactNode } from 'react';

export interface ModalActionsProps {
  children: ReactNode;
  align?: 'left' | 'center' | 'right';
}

export default function ModalActions({ 
  children, 
  align = 'right' 
}: ModalActionsProps) {
  const getAlignClass = () => {
    switch (align) {
      case 'left':
        return 'modal-actions-left';
      case 'center':
        return 'modal-actions-center';
      default:
        return '';
    }
  };

  return (
    <div className={`modal-actions ${getAlignClass()}`}>
      {children}
    </div>
  );
}

// Common button combinations
export interface StandardActionsProps {
  onCancel: () => void;
  onConfirm: () => void;
  cancelText?: string;
  confirmText?: string;
  isLoading?: boolean;
  isConfirmDisabled?: boolean;
  confirmVariant?: 'primary' | 'danger';
}

export function StandardActions({
  onCancel,
  onConfirm,
  cancelText = 'Cancel',
  confirmText = 'Confirm',
  isLoading = false,
  isConfirmDisabled = false,
  confirmVariant = 'primary'
}: StandardActionsProps) {
  return (
    <ModalActions>
      <button
        type="button"
        onClick={onCancel}
        className="btn-md outline"
        disabled={isLoading}
      >
        {cancelText}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className={`btn-md ${confirmVariant}`}
        disabled={isConfirmDisabled || isLoading}
      >
        {isLoading ? 'Processing...' : confirmText}
      </button>
    </ModalActions>
  );
}
