import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  History,
  Search,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  HelpCircle,
  FileCheck,
} from 'lucide-react';
import {
  Reconciliation,
  ReconciliationStatus,
  DifferenceSuspect,
  EnvelopeBalance,
  LedgerEntryView,
} from '../../lib/db/types';
import { api } from '../../services/api';
import { formatTaka, formatDate } from '../../lib/utils';
import { useConfirmation } from '../../context/ConfirmationContext';

interface ReconciliationScreenProps {
  onRefresh: () => void;
  onError: (err: any) => void;
}

export const ReconciliationScreen: React.FC<ReconciliationScreenProps> = ({
  onRefresh,
  onError,
}) => {
  const { notify } = useConfirmation();
  const [status, setStatus] = useState<ReconciliationStatus | null>(null);
  const [balances, setBalances] = useState<EnvelopeBalance[]>([]);
  const [unverified, setUnverified] = useState<
    Array<LedgerEntryView & { net_effect: number; size: number }>
  >([]);
  const [pastChecks, setPastChecks] = useState<Reconciliation[]>([]);

  // Counted form
  const [countedTotal, setCountedTotal] = useState<string>('');
  const [note, setNote] = useState('');
  const [checkDate, setCheckDate] = useState(new Date().toISOString().split('T')[0]);
  const [envelopeCounts, setEnvelopeCounts] = useState<Record<number, string>>({});

  // Diagnosis suspects
  const [suspects, setSuspects] = useState<DifferenceSuspect[]>([]);
  const [activeDifference, setActiveDifference] = useState<number | null>(null);

  const loadData = async () => {
    try {
      const [st, envs, unv, recs] = await Promise.all([
        api.getReconciliationStatus(),
        api.getEnvelopeBalances(),
        api.getUnverifiedEntries(),
        api.getReconciliations(),
      ]);
      setStatus(st);
      setBalances(envs);
      setUnverified(unv);
      setPastChecks(recs);

      const sysTotal = envs.reduce((sum, b) => sum + b.balance, 0);
      setCountedTotal(String(sysTotal));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const systemTotal = balances.reduce((sum, b) => sum + b.balance, 0);
  const enteredCounted = parseInt(countedTotal, 10) || 0;
  const currentDiff = enteredCounted - systemTotal;

  // Run difference suspect diagnosis whenever difference changes
  useEffect(() => {
    if (currentDiff !== 0) {
      api.getDifferenceSuspects(currentDiff).then(setSuspects);
      setActiveDifference(currentDiff);
    } else {
      setSuspects([]);
      setActiveDifference(0);
    }
  }, [currentDiff]);

  const handleRecordMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const perEnv: Record<number, number> = {};
      for (const [k, v] of Object.entries(envelopeCounts)) {
        if (v) perEnv[Number(k)] = parseInt(v, 10);
      }

      const rec = await api.recordReconciliation({
        by: 'Treasurer',
        countedTotal: enteredCounted,
        note: note.trim() || (currentDiff === 0 ? 'Monthly cash match verified' : 'Check recorded with discrepancy'),
        countedEnvelopes: Object.keys(perEnv).length > 0 ? perEnv : undefined,
        date: checkDate,
      });

      if (rec.matched) {
        notify({
          title: 'Reconciliation Verified',
          description: 'Reconciliation MATCH verified! The screen agrees with physical cash and notes. Checkpoint saved.',
          variant: 'success',
        });
      } else {
        notify({
          title: 'Discrepancy Recorded',
          description: `Discrepancy of ৳${rec.difference.toLocaleString()} recorded. Use the diagnosed suspect entries below to fix it.`,
          variant: 'warning',
        });
      }

      await loadData();
      onRefresh();
    } catch (err) {
      onError(err);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-zinc-500" />
          Monthly Reconciliation (Match Screen to Notes)
        </h2>
        <p className="text-xs text-zinc-500 mt-1">
          Once a month, confirm the screen matches your notes and cash box. After a match, you only ever need to review entries recorded after it.
        </p>
      </div>

      {/* Timer & Health Status Card */}
      {status && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
            <div className="text-xs text-zinc-500 font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>Days Since Last Match</span>
            </div>
            <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
              {status.days_since_last_match !== null ? `${status.days_since_last_match} days` : 'None yet'}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">
              {status.last_match_date ? `Last verified on ${formatDate(status.last_match_date)}` : 'First verification'}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
            <div className="text-xs text-zinc-500 font-medium">Entries to Verify</div>
            <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
              {status.entries_since_last_match}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">
              Transactions recorded since the last verified match
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
            <div className="text-xs text-zinc-500 font-medium">Screen Total (All Envelopes)</div>
            <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
              {formatTaka(systemTotal)}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">Sum across all virtual envelopes</div>
          </div>
        </div>
      )}

      {/* Main Reconciliation Check Form */}
      <form onSubmit={handleRecordMatch} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div>
            <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
              Record Verification Check
            </h3>
            <p className="text-xs text-zinc-500">
              Count your physical cash / check your passbook notes and enter the total.
            </p>
          </div>
          <span className="text-xs text-zinc-400">Date: {checkDate}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Screen Total
            </label>
            <div className="mt-1 font-mono text-xl font-bold text-zinc-900 dark:text-zinc-100">
              {formatTaka(systemTotal)}
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">Computed by app ledger</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Counted Total from Notes (whole ৳)
            </label>
            <div className="relative mt-1">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs font-mono text-zinc-400">
                ৳
              </span>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={countedTotal}
                onChange={(e) => setCountedTotal(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 pl-7 pr-3 py-2 text-base font-mono text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400 font-bold"
              />
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">Your cash box or bank notes</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Difference (Counted - Screen)
            </label>
            <div
              className={`mt-1 font-mono text-xl font-bold flex items-center gap-2 ${
                currentDiff === 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {currentDiff === 0 ? '৳0 (MATCH!)' : formatTaka(currentDiff)}
              {currentDiff === 0 && <CheckCircle2 className="h-5 w-5" />}
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {currentDiff === 0 ? 'Everything agrees' : 'Discrepancy detected'}
            </p>
          </div>
        </div>

        {/* Note and Submit */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Verification Note (optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Month-end cash count in presence of committee"
              className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className={`w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold shadow-sm transition-colors ${
                currentDiff === 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800'
              }`}
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{currentDiff === 0 ? 'Save Verified Match' : 'Record Check Discrepancy'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Suspect Diagnoses Alert Card (When difference != 0) */}
      {currentDiff !== 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 p-5 space-y-3 animate-in fade-in">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-sm">
            <Sparkles className="h-4 w-4 text-amber-600" />
            <span>Automated Typo Diagnostic (Difference: {formatTaka(currentDiff)})</span>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            The system searched the entries recorded since the last match for standard human typing mistakes:
          </p>

          {suspects.length === 0 ? (
            <div className="rounded-lg bg-white dark:bg-zinc-900 p-3 text-xs text-zinc-600 dark:text-zinc-400 border border-amber-200/60 dark:border-amber-800/40">
              No single transaction mathematically explains this exact difference. It may be an entry you forgot to record, or multiple entries combined. Review the unverified entries below.
            </div>
          ) : (
            <div className="space-y-2">
              {suspects.map((s, idx) => (
                <div
                  key={idx}
                  className="rounded-lg bg-white dark:bg-zinc-900 p-3.5 border border-amber-200 dark:border-amber-800/60 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                      <span>Suspect Entry #{s.entry_id}</span>
                      <span className="font-mono text-zinc-500">({s.occurred_on})</span>
                      <span className="font-mono text-zinc-700 dark:text-zinc-300">
                        Amount: {formatTaka(s.effect)}
                      </span>
                    </div>
                    <div className="text-xs text-amber-800 dark:text-amber-300 mt-1 font-medium">
                      👉 {s.why}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">Note: {s.note}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Unverified Entries Since Last Match */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Unverified Entries ({unverified.length})
            </h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Only entries recorded after the last verified match. Ordered by recording time.
            </p>
          </div>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 uppercase tracking-wider text-[10px] font-semibold border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className="py-2.5 px-4">ID</th>
              <th className="py-2.5 px-4">Date</th>
              <th className="py-2.5 px-4">Type</th>
              <th className="py-2.5 px-4">Description</th>
              <th className="py-2.5 px-4 text-right">Net Effect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono">
            {unverified.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-zinc-400 font-sans italic">
                  No new entries recorded since the last match. Everything is clean!
                </td>
              </tr>
            ) : (
              unverified.map((tx) => (
                <tr key={tx.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                  <td className="py-2.5 px-4 text-zinc-500">#{tx.id}</td>
                  <td className="py-2.5 px-4 font-sans text-zinc-600 dark:text-zinc-400">
                    {tx.occurred_on}
                  </td>
                  <td className="py-2.5 px-4 font-sans capitalize text-zinc-700 dark:text-zinc-300">
                    {tx.kind}
                  </td>
                  <td className="py-2.5 px-4 font-sans text-zinc-900 dark:text-zinc-100">
                    {tx.note}
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold">
                    {formatTaka(tx.net_effect)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
