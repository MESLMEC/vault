import React from 'react';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { SettleModal } from '../ui/SettleModal';

interface RefusalModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  reason: string;
  remediation?: string;
}

export const RefusalModal: React.FC<RefusalModalProps> = ({
  isOpen,
  onClose,
  title = 'Action Refused',
  reason,
  remediation,
}) => {
  return (
    <SettleModal
      open={isOpen}
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</div>
            <p className="text-xs text-zinc-500 font-normal">Protected Lab Financial Invariant</p>
          </div>
        </div>
      }
      footer={
        <button
          onClick={onClose}
          className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-semibold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-sm cursor-pointer"
        >
          Understood
        </button>
      }
    >
      <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-4 border border-zinc-100 dark:border-zinc-800">
        <p className="text-sm font-medium leading-relaxed text-zinc-800 dark:text-zinc-200">
          {reason}
        </p>
      </div>

      {remediation && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 p-3.5 text-xs text-blue-800 dark:text-blue-300 border border-blue-100 dark:border-blue-900/40">
          <ArrowRight className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="font-semibold">How to proceed: </strong>
            {remediation}
          </div>
        </div>
      )}
    </SettleModal>
  );
};
