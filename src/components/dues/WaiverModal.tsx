import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle } from 'lucide-react';
import { Member, AdjustmentKind } from '../../lib/db/types';
import { api } from '../../services/api';
import { formatTaka } from '../../lib/utils';
import { SettleModal } from '../ui/SettleModal';

interface WaiverModalProps {
  member: Member | null;
  onClose: () => void;
  onSuccess: () => void;
  onError: (err: any) => void;
}

export const WaiverModal: React.FC<WaiverModalProps> = ({
  member,
  onClose,
  onSuccess,
  onError,
}) => {
  if (!member) return null;

  const [kind, setKind] = useState<AdjustmentKind>('waiver');
  const [amount, setAmount] = useState<string>('50');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState<string>('');
  const [recordedBy, setRecordedBy] = useState('Treasurer');
  const [error, setError] = useState<{ reason: string; remediation?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawAmt = parseInt(amount, 10);
    if (isNaN(rawAmt) || rawAmt <= 0) {
      setError({
        reason: 'Invalid Adjustment Amount',
        remediation: 'Please enter a positive whole taka amount greater than 0.',
      });
      return;
    }

    // Sign according to schema rule:
    // kind <> 'waiver' OR amount > 0
    // kind <> 'credit_donation' OR amount < 0
    const finalAmt = kind === 'credit_donation' ? -rawAmt : rawAmt;
    setError(null);

    try {
      await api.addMemberAdjustment({
        memberId: member.id,
        kind,
        amount: finalAmt,
        occurredOn: date,
        recordedBy,
        note: note.trim(),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError({
        reason: err?.reason || err?.message || 'Failed to record adjustment.',
        remediation: err?.remediation,
      });
      onError(err);
    }
  };

  return (
    <SettleModal
      open={!!member}
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-zinc-500" />
          <span>Member Adjustment / Waiver</span>
        </div>
      }
    >

        <div className="mt-3 text-xs text-zinc-500">
          Recording adjustment for <strong className="text-zinc-800 dark:text-zinc-200">{member.name}</strong>.
          Adjustments change member credit standing without moving physical money in the lab ledger.
        </div>

        {/* Error / Refusal Alert */}
        {error && (
          <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3.5 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-1 animate-in fade-in">
            <div className="flex items-center gap-2 font-semibold text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>Action Refused</span>
            </div>
            <p className="text-xs leading-relaxed">{error.reason}</p>
            {error.remediation && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400 pt-1 border-t border-amber-200/50 dark:border-amber-800/50">
                <strong>How to proceed: </strong>{error.remediation}
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Adjustment Type
            </label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as AdjustmentKind)}
              className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
            >
              <option value="waiver">Waiver (Forgive dues / add credit)</option>
              <option value="credit_donation">Credit Donation (Remove excess credit)</option>
              <option value="opening">Opening Balance Credit</option>
              <option value="correction">Standing Correction</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Amount (whole ৳)
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
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 pl-7 pr-3 py-2 text-sm font-mono text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Required Human Reason Note
            </label>
            <input
              type="text"
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Waived 2 weeks for representing university at RoboSub"
              className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
            />
          </div>

          <div className="mt-6 flex justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-sm"
            >
              Record Adjustment
            </button>
          </div>
        </form>
    </SettleModal>
  );
};
