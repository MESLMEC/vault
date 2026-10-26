import React, { useState, useEffect } from 'react';
import { Users, ArrowDownRight, CheckCircle2, AlertTriangle, Share2 } from 'lucide-react';
import { Member, MemberStanding, LedgerEntryView } from '../../lib/db/types';
import { api } from '../../services/api';
import { formatTaka } from '../../lib/utils';
import { FeeReceiptModal } from './FeeReceiptModal';
import { SettleModal } from '../ui/SettleModal';

interface QuickFeeCollectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedMemberId?: number | null;
  onSuccess: () => void;
  onError: (err: any) => void;
}

export const QuickFeeCollectorModal: React.FC<QuickFeeCollectorModalProps> = ({
  isOpen,
  onClose,
  preselectedMemberId,
  onSuccess,
  onError,
}) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [standing, setStanding] = useState<MemberStanding[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [amount, setAmount] = useState<string>('50');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState<string>('Weekly membership dues');
  const [recordedBy, setRecordedBy] = useState('Treasurer');
  const [error, setError] = useState<{ reason: string; remediation?: string } | null>(null);
  const [receiptTx, setReceiptTx] = useState<LedgerEntryView | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    const load = async () => {
      try {
        const [mems, st] = await Promise.all([api.getMembers(), api.getDuesOverview()]);
        setMembers(mems);
        setStanding(st);
        if (preselectedMemberId) {
          setSelectedMemberId(String(preselectedMemberId));
        } else if (mems.length > 0) {
          // Preselect first member with arrears if any
          const overdue = st.find((s) => s.balance < 0);
          setSelectedMemberId(String(overdue ? overdue.who_id : mems[0].id));
        }
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, [isOpen, preselectedMemberId]);

  if (!isOpen) return null;

  const currentMemberStanding = standing.find((s) => s.who_id === parseInt(selectedMemberId, 10));
  const enteredAmount = parseInt(amount, 10) || 0;
  const projectedBalance = (currentMemberStanding?.balance ?? 0) + enteredAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enteredAmount <= 0) {
      setError({
        reason: 'Invalid Amount',
        remediation: 'Please enter a positive taka amount greater than 0.',
      });
      return;
    }
    const memId = parseInt(selectedMemberId, 10);
    if (!memId) return;

    setError(null);
    try {
      const pool = (await api.getEnvelopes()).find((e) => e.is_pool);
      if (!pool) throw new Error('General Pool envelope not found');

      const createdTx = await api.recordTransaction({
        kind: 'deposit',
        occurred_on: date,
        recorded_by: recordedBy,
        note: note.trim() || 'Weekly fee collection',
        tag: 'fees',
        source: 'weekly_fee',
        member_id: memId,
        lines: [{ envelope_id: pool.id, amount: enteredAmount }],
      });

      const memberObj = members.find((m) => m.id === memId);
      const viewTx: LedgerEntryView = {
        ...createdTx,
        lines: [{ id: 1, transaction_id: createdTx.id, envelope_id: pool.id, amount: enteredAmount }],
        is_voided: false,
        corrected_from: null,
        member_name: memberObj?.name || currentMemberStanding?.who_name || 'Member',
      };

      onSuccess();
      setReceiptTx(viewTx);
    } catch (err: any) {
      setError({
        reason: err?.reason || err?.message || 'Failed to collect fees.',
        remediation: err?.remediation,
      });
      onError(err);
    }
  };

  return (
    <>
      <FeeReceiptModal
        isOpen={!!receiptTx}
        onClose={() => {
          setReceiptTx(null);
          onClose();
        }}
        transaction={receiptTx}
        member={members.find((m) => m.id === parseInt(selectedMemberId, 10))}
        standing={currentMemberStanding}
      />

      <SettleModal
        open={isOpen}
        onClose={onClose}
        size="md"
        title={
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-zinc-500" />
            <span>Collect Member Fees</span>
          </div>
        }
      >

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
              Member
            </label>
            <select
              required
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
            >
              {members.map((m) => {
                const s = standing.find((x) => x.who_id === m.id);
                return (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.batch ? `(Batch ${m.batch})` : ''} — Current:{' '}
                    {formatTaka(s?.balance ?? 0)}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Current vs Projected Standing Card */}
          {currentMemberStanding && (
            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-3 border border-zinc-100 dark:border-zinc-800 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Current Standing:</span>
                <span
                  className={`font-mono font-semibold ${
                    currentMemberStanding.balance < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {formatTaka(currentMemberStanding.balance)}
                  {currentMemberStanding.weeks_overdue > 0 &&
                    ` (${currentMemberStanding.weeks_overdue} wks overdue)`}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-zinc-200/60 dark:border-zinc-700/60 pt-1.5">
                <span className="text-zinc-500">Projected After Payment:</span>
                <span
                  className={`font-mono font-semibold ${
                    projectedBalance < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {formatTaka(projectedBalance)}
                </span>
              </div>
            </div>
          )}

          {/* Amount buttons for quick entry */}
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Amount to Collect (whole ৳)
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
            {/* Quick amount chips */}
            <div className="mt-2 flex gap-1.5">
              {[50, 100, 200, 500, 1000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(String(preset))}
                  className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-1 text-[11px] font-mono text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                >
                  +{preset}
                </button>
              ))}
              {currentMemberStanding && currentMemberStanding.balance < 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(String(Math.abs(currentMemberStanding.balance)))}
                  className="rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 px-2 py-1 text-[11px] font-mono hover:bg-amber-200"
                >
                  Clear Arrears (৳{Math.abs(currentMemberStanding.balance)})
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Payment Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Collector
              </label>
              <input
                type="text"
                value={recordedBy}
                onChange={(e) => setRecordedBy(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Note (optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Cash in lab envelope"
              className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
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
              Record Fee Payment
            </button>
          </div>
        </form>
      </SettleModal>
    </>
  );
};
