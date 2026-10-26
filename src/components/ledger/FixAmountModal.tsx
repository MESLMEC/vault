import React, { useState } from 'react';
import { History } from 'lucide-react';
import { LedgerEntryView } from '../../lib/db/types';
import { api } from '../../services/api';
import { formatTaka } from '../../lib/utils';
import { SettleModal } from '../ui/SettleModal';

interface FixAmountModalProps {
  transaction: LedgerEntryView | null;
  onClose: () => void;
  onSuccess: () => void;
  onError: (err: any) => void;
}

export const FixAmountModal: React.FC<FixAmountModalProps> = ({
  transaction,
  onClose,
  onSuccess,
  onError,
}) => {
  if (!transaction) return null;

  const currentAmt = Math.abs(transaction.lines[0]?.amount ?? 0);
  const [newAmount, setNewAmount] = useState(String(currentAmt));
  const [newNote, setNewNote] = useState(transaction.note);
  const [recordedBy, setRecordedBy] = useState('Treasurer');

  const handleFix = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseInt(newAmount, 10);
    if (isNaN(amt) || amt <= 0) {
      onError({
        reason: 'Invalid Corrected Amount',
        remediation: 'Please enter a valid positive whole taka amount greater than 0.',
      });
      return;
    }

    try {
      // Re-sign according to original line direction
      const updatedLines = transaction.lines.map((l) => ({
        envelope_id: l.envelope_id,
        amount: l.amount < 0 ? -amt : amt,
      }));

      await api.fixAmount({
        transactionId: transaction.id,
        newLines: updatedLines,
        newNote,
        by: recordedBy,
      });

      onSuccess();
      onClose();
    } catch (err) {
      onError(err);
    }
  };

  return (
    <SettleModal
      open={!!transaction}
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-zinc-500" />
          <span>Fix Amount on Entry #{transaction.id}</span>
        </div>
      }
    >
      <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/40 p-3 border border-zinc-100 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
        <strong>Immutable Ledger Rule: </strong>
        The app will atomically record an exact reversal of the original entry, then append the corrected entry. Nothing is silently overwritten, and the complete audit trail is preserved.
      </div>

      <form onSubmit={handleFix} className="mt-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Current Recorded Amount
          </label>
          <div className="mt-1 font-mono text-sm text-zinc-500 line-through">
            {formatTaka(currentAmt)}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Corrected Amount (whole ৳)
          </label>
          <div className="relative mt-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs font-mono text-zinc-400">
              ৳
            </span>
            <input
              type="number"
              min="1"
              step="1"
              required
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 pl-7 pr-3 py-2 text-sm font-mono text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Explanation Note
          </label>
          <input
            type="text"
            required
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="e.g. Corrected typo in receipt amount"
            className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
          />
        </div>

        <div className="mt-6 flex justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-sm cursor-pointer"
          >
            Apply Correction
          </button>
        </div>
      </form>
    </SettleModal>
  );
};
