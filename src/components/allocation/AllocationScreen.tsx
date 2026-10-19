import React, { useState, useEffect } from 'react';
import {
  Scale,
  Sparkles,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Coins,
  Sliders,
} from 'lucide-react';
import {
  AllocationContext,
  AllocationSuggestionRow,
  EnvelopeBalance,
} from '../../lib/db/types';
import { api } from '../../services/api';
import { formatTaka } from '../../lib/utils';

interface AllocationScreenProps {
  onAllocated: () => void;
  onError: (err: any) => void;
}

export const AllocationScreen: React.FC<AllocationScreenProps> = ({
  onAllocated,
  onError,
}) => {
  const [context, setContext] = useState<AllocationContext | null>(null);
  const [envelopes, setEnvelopes] = useState<EnvelopeBalance[]>([]);
  const [amountToSplit, setAmountToSplit] = useState<string>('');
  const [suggestion, setSuggestion] = useState<AllocationSuggestionRow[]>([]);
  const [editedAmounts, setEditedAmounts] = useState<Record<number, number>>({});
  const [meetingNote, setMeetingNote] = useState('Monthly Committee Budget Allocation');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [recordedBy, setRecordedBy] = useState('Treasurer');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadContext = async () => {
    try {
      const [ctx, envs] = await Promise.all([
        api.getAllocationContext(),
        api.getEnvelopeBalances(),
      ]);
      setContext(ctx);
      setEnvelopes(envs.filter((e) => e.active && !e.is_pool));

      // Default amount to split is the safe pool balance
      const safeAmount = Math.max(0, ctx.pool_after_member_credit);
      setAmountToSplit(String(safeAmount));
      generateDraft(safeAmount);
    } catch (e) {
      console.error(e);
    }
  };

  const generateDraft = async (amt: number) => {
    if (amt <= 0) {
      setSuggestion([]);
      setEditedAmounts({});
      return;
    }
    try {
      const rows = await api.getAllocationSuggestion(amt);
      setSuggestion(rows);
      const initialMap: Record<number, number> = {};
      for (const r of rows) {
        initialMap[r.envelope_id] = r.suggested;
      }
      setEditedAmounts(initialMap);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadContext();
  }, []);

  const handleAmountToSplitChange = (val: string) => {
    setAmountToSplit(val);
    const num = parseInt(val, 10);
    if (!isNaN(num)) {
      generateDraft(num);
    }
  };

  const handleEnvelopeAmountChange = (envelopeId: number, val: number) => {
    setEditedAmounts((prev) => ({
      ...prev,
      [envelopeId]: Math.max(0, val),
    }));
  };

  const totalAllocated = Object.values(editedAmounts).reduce((sum, v) => sum + v, 0);
  const poolBalance = context?.pool_balance ?? 0;
  const poolRemaining = poolBalance - totalAllocated;
  const isOverdrawn = poolRemaining < 0;

  const handleCommitAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOverdrawn) {
      alert(`Cannot allocate more than current pool balance (৳${poolBalance.toLocaleString()}).`);
      return;
    }
    if (totalAllocated <= 0) {
      alert('Please allocate at least ৳1 to envelopes.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.allocate({
        by: recordedBy,
        date: sessionDate,
        note: meetingNote.trim() || 'Committee allocation session',
        amounts: editedAmounts,
      });
      alert(`Allocation session successfully committed! ৳${totalAllocated.toLocaleString()} distributed across envelopes.`);
      await loadContext();
      onAllocated();
    } catch (err) {
      onError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <Scale className="h-5 w-5 text-zinc-500" />
          Committee Allocation Session
        </h2>
        <p className="text-xs text-zinc-500 mt-1">
          Decide in a meeting how to split the lab's general pool across purpose envelopes. The system computes a mathematically principled draft, and the committee edits it live.
        </p>
      </div>

      {/* Pool Context Stats */}
      {context && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
            <div className="text-xs text-zinc-500 font-medium">Unallocated Pool Balance</div>
            <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
              {formatTaka(context.pool_balance)}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">General funds awaiting purpose</div>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
            <div className="text-xs text-zinc-500 font-medium flex items-center gap-1.5">
              <span>Member Credit Held</span>
              <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
              {formatTaka(context.member_credit_held)}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">
              Member advance fees (not safe to spend on projects)
            </div>
          </div>

          <div className="rounded-xl border border-zinc-900 dark:border-zinc-700 bg-zinc-900/5 dark:bg-zinc-800/40 p-4 shadow-sm">
            <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              Safe Pool Available
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              {formatTaka(context.pool_after_member_credit)}
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">
              Pool minus member advance credits
            </div>
          </div>
        </div>
      )}

      {/* Draft Split Settings Bar */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Automated Draft Split Generator
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              1) Fills capped envelopes by priority rank. 2) Prods remaining cash to uncapped envelopes by historical shares.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-zinc-500">Draft from Pool:</div>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs font-mono text-zinc-400">
                ৳
              </span>
              <input
                type="number"
                min="0"
                step="100"
                value={amountToSplit}
                onChange={(e) => handleAmountToSplitChange(e.target.value)}
                className="w-36 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 pl-7 pr-3 py-1.5 text-xs font-mono text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
              />
            </div>
            <button
              type="button"
              onClick={() => handleAmountToSplitChange(String(Math.max(0, context?.pool_after_member_credit ?? 0)))}
              className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
            >
              Set Safe Pool
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Envelopes Table */}
      <form onSubmit={handleCommitAllocation} className="space-y-6">
        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
          <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Envelope Allocations
            </span>
            <span className="text-xs text-zinc-400">
              Committee can tweak numbers below; caps are guidance only
            </span>
          </div>

          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 uppercase tracking-wider text-[10px] font-semibold border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="py-3 px-4">Envelope & Rule</th>
                <th className="py-3 px-4 text-right">Current Balance</th>
                <th className="py-3 px-4 text-right">Target Cap</th>
                <th className="py-3 px-4 text-center">Draft Suggestion</th>
                <th className="py-3 px-4 text-right w-48">Committee Decision (৳)</th>
                <th className="py-3 px-4 text-right">New Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {envelopes.map((env) => {
                const sug = suggestion.find((s) => s.envelope_id === env.id);
                const currentVal = editedAmounts[env.id] ?? 0;
                const newBalance = env.balance + currentVal;

                return (
                  <tr key={env.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {env.name}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {env.alloc_priority ? `Priority #${env.alloc_priority} ` : 'Uncapped '}
                        {sug?.phase === 'cap_fill' && (
                          <span className="text-blue-600 dark:text-blue-400">(Cap Top-up)</span>
                        )}
                        {sug?.phase === 'share' && (
                          <span className="text-purple-600 dark:text-purple-400">(Proportional Share)</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right font-mono text-zinc-600 dark:text-zinc-400">
                      {formatTaka(env.balance)}
                    </td>

                    <td className="py-3 px-4 text-right font-mono text-zinc-500">
                      {env.target_cap ? formatTaka(env.target_cap) : 'None'}
                    </td>

                    <td className="py-3 px-4 text-center font-mono text-zinc-600 dark:text-zinc-400">
                      {sug ? formatTaka(sug.suggested) : '—'}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-xs font-mono text-zinc-400">
                          ৳
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="50"
                          value={currentVal}
                          onChange={(e) =>
                            handleEnvelopeAmountChange(env.id, parseInt(e.target.value, 10) || 0)
                          }
                          className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 pl-6 pr-2.5 py-1 text-xs font-mono text-right text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400 font-semibold"
                        />
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100">
                      {formatTaka(newBalance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Allocation Footer Summary */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-6 text-xs">
              <div>
                <span className="text-zinc-500">Total Allocated: </span>
                <strong className="font-mono text-sm text-zinc-900 dark:text-zinc-100">
                  {formatTaka(totalAllocated)}
                </strong>
              </div>

              <div>
                <span className="text-zinc-500">Pool Remaining: </span>
                <strong
                  className={`font-mono text-sm ${
                    isOverdrawn
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-zinc-900 dark:text-zinc-100'
                  }`}
                >
                  {formatTaka(poolRemaining)}
                </strong>
              </div>
            </div>

            {isOverdrawn && (
              <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
                <AlertCircle className="h-4 w-4" />
                <span>Overdrawn by ৳{Math.abs(poolRemaining).toLocaleString()}. Envelopes cannot exceed Pool!</span>
              </div>
            )}
          </div>
        </div>

        {/* Meeting Notes and Commit Bar */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Committee Session Notes
              </label>
              <input
                type="text"
                required
                value={meetingNote}
                onChange={(e) => setMeetingNote(e.target.value)}
                placeholder="e.g. Budget meeting before Robotics Contest 2026"
                className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Session Date
              </label>
              <input
                type="date"
                required
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isOverdrawn || totalAllocated === 0 || isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-5 py-2.5 text-xs font-semibold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Commit Allocation Decision</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
