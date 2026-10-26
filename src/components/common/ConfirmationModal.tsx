import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { SettleModal } from '../ui/SettleModal';

export interface ConfirmationOptions {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info' | 'success';
  isAlert?: boolean;
}

export interface ConfirmationModalProps extends ConfirmationOptions {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'warning',
  isAlert = false,
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: <AlertTriangle className="h-5 w-5" />,
          iconBg: 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400',
          subtitle: 'Destructive Action Confirmation',
          confirmBtn:
            'bg-rose-600 hover:bg-rose-700 text-white dark:bg-rose-600 dark:hover:bg-rose-500 shadow-sm shadow-rose-500/20',
          defaultTitle: 'Are you sure?',
        };
      case 'warning':
        return {
          icon: <AlertCircle className="h-5 w-5" />,
          iconBg: 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400',
          subtitle: 'Financial Action Confirmation',
          confirmBtn:
            'bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-500 shadow-sm shadow-amber-500/20',
          defaultTitle: 'Please Confirm',
        };
      case 'success':
        return {
          icon: <CheckCircle2 className="h-5 w-5" />,
          iconBg: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400',
          subtitle: 'Action Succeeded',
          confirmBtn:
            'bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-500 shadow-sm shadow-emerald-500/20',
          defaultTitle: 'Success',
        };
      case 'info':
      default:
        return {
          icon: <HelpCircle className="h-5 w-5" />,
          iconBg: 'bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400',
          subtitle: 'Confirmation Required',
          confirmBtn:
            'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-sm',
          defaultTitle: 'Confirm Action',
        };
    }
  };

  const style = getVariantStyles();

  return (
    <SettleModal
      open={isOpen}
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${style.iconBg}`}>
            {style.icon}
          </div>
          <div>
            <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {title || style.defaultTitle}
            </div>
            <p className="text-xs text-zinc-500 font-normal">{style.subtitle}</p>
          </div>
        </div>
      }
      footer={
        <>
          {!isAlert && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${style.confirmBtn}`}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-4 border border-zinc-100 dark:border-zinc-800">
        <p className="text-sm font-medium leading-relaxed text-zinc-800 dark:text-zinc-200">
          {description}
        </p>
      </div>
    </SettleModal>
  );
};
