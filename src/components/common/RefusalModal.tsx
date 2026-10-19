import React from 'react';
import { AlertCircle, ArrowRight, X } from 'lucide-react';

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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
              <p className="text-xs text-zinc-500">Protected Lab Financial Invariant</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-4 border border-zinc-100 dark:border-zinc-800">
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

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-sm"
          >
            Understood
          </button>
        </div>
      </div>
    </div>
  );
};
