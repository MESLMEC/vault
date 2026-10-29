import React, { useState, useEffect } from 'react';
import { TrendingUp, Plus, Calendar, Clock, CheckCircle, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { FeeRate, Tenure } from '../../lib/db/types';
import { formatTaka, sundayOnOrBefore, sundayOnOrAfter, toLocalDateStr, isSunday } from '../../lib/utils';
import { SettleModal } from '../ui/SettleModal';

interface FeeRatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onError: (err: any) => void;
}

export const FeeRatesModal: React.FC<FeeRatesModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onError,
}) => {
  const [rates, setRates] = useState<FeeRate[]>([]);
  const [openTenure, setOpenTenure] = useState<Tenure | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(
    sundayOnOrBefore(toLocalDateStr(new Date()))
  );
  const [amount, setAmount] = useState('50');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ reason: string; remediation?: string } | null>(null);

  const loadRates = async () => {
    try {
      const [data, tenure] = await Promise.all([api.getFeeRates(), api.getOpenTenure()]);
      setRates([...data].sort((a, b) => b.effective_from.localeCompare(a.effective_from)));
      setOpenTenure(tenure);

      // If no rate exists yet, default to the tenure's opening Sunday
      if (data.length === 0 && tenure?.opened_on) {
        const tenureSunday = isSunday(tenure.opened_on)
          ? tenure.opened_on
          : sundayOnOrAfter(tenure.opened_on);
        setEffectiveFrom(tenureSunday);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setEffectiveFrom(sundayOnOrBefore(toLocalDateStr(new Date())));
      loadRates();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isBeforeTenure = !!(openTenure && effectiveFrom && effectiveFrom < openTenure.opened_on);
  const isDaySunday = effectiveFrom ? isSunday(effectiveFrom) : false;

  const handleAddRate = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseInt(amount, 10);
    if (isNaN(amt) || amt < 0) {
      setError({
        reason: 'Invalid Weekly Fee Rate',
        remediation: 'Please enter a valid positive weekly rate amount in whole Taka.',
      });
      return;
    }

    if (openTenure && effectiveFrom < openTenure.opened_on) {
      setError({
        reason: 'Effective Date Precedes Tenure Start',
        remediation: `The active tenure opened on ${openTenure.opened_on}. Fee rates cannot be set before the tenure started. Please select ${openTenure.opened_on} or a later Sunday.`,
      });
      return;
    }

    if (!isDaySunday) {
      setError({
        reason: 'Invalid Effective Date',
        remediation: 'Weekly fee rates must take effect on a Sunday.',
      });
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.addFeeRate(effectiveFrom, amt, 'Treasurer');
      setAmount('50');
      await loadRates();
      onSuccess();
    } catch (err: any) {
      setError({
        reason: err?.reason || err?.message || 'Failed to update fee rate.',
        remediation: err?.remediation,
      });
      onError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettleModal
      open={isOpen}
      onClose={onClose}
      size="lg"
      title={
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-zinc-900 dark:text-zinc-100" />
          <span>Weekly Fee Rates Schedule</span>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Active Tenure Banner */}
        {openTenure && (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-100/80 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200">
              <Calendar className="h-3.5 w-3.5 text-zinc-500" />
              <span>
                Active Tenure: <strong className="text-zinc-900 dark:text-zinc-100">{openTenure.name}</strong>
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              Opened on: <strong className="text-zinc-700 dark:text-zinc-300">{openTenure.opened_on}</strong>
            </span>
          </div>
        )}

        {/* Existing Rates History */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Effective Fee History
          </label>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
            {rates.length === 0 ? (
              <div className="p-4 text-center text-zinc-400 italic">No fee rates recorded yet.</div>
            ) : (
              rates.map((r, idx) => (
                <div key={r.id} className="flex items-center justify-between p-3 bg-white dark:bg-zinc-900/60">
                  <div className="flex items-center gap-2">
                    {idx === 0 ? (
                      <span className="rounded bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                        Current
                      </span>
                    ) : (
                      <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                        Historical
                      </span>
                    )}
                    <span className="font-mono text-zinc-700 dark:text-zinc-300">
                      From {r.effective_from}
                    </span>
                  </div>
                  <div className="font-mono font-bold text-sm text-zinc-900 dark:text-zinc-100">
                    {formatTaka(r.amount)} <span className="text-[11px] font-normal text-zinc-400">/ wk</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Error / Refusal Banner */}
        {error && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3.5 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-1 animate-in fade-in">
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

        {/* Form: Add Rate */}
        <form onSubmit={handleAddRate} className="rounded-lg bg-zinc-50 dark:bg-zinc-950 p-4 border border-zinc-200 dark:border-zinc-800 space-y-3">
          <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Schedule Rate Change
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                Effective Sunday
              </label>
              <input
                type="date"
                required
                min={openTenure?.opened_on || undefined}
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                New Rate (৳ / week)
              </label>
              <input
                type="number"
                min="0"
                required
                placeholder="50"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
              />
            </div>
          </div>

          {/* Real-time Warning if Date Precedes Tenure Start */}
          {isBeforeTenure && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs animate-in fade-in">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <span className="font-semibold">Cannot start before tenure opening:</span>{' '}
                This tenure opened on <strong>{openTenure?.opened_on}</strong>. Fee rates cannot precede the tenure start. Please select <strong>{openTenure?.opened_on}</strong> or a subsequent Sunday.
              </div>
            </div>
          )}

          {/* Sunday Helper with Snap Button */}
          {!isBeforeTenure && !isDaySunday && effectiveFrom && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-200 text-xs">
              <div className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                <span>Effective date must be a Sunday.</span>
              </div>
              <button
                type="button"
                onClick={() => setEffectiveFrom(sundayOnOrBefore(effectiveFrom))}
                className="text-[11px] font-semibold underline text-sky-700 dark:text-sky-300 hover:text-sky-900 dark:hover:text-sky-100 cursor-pointer"
              >
                Snap to Sunday ({sundayOnOrBefore(effectiveFrom)})
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || isBeforeTenure || !isDaySunday}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-3 py-2 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
            <span>
              {loading
                ? 'Recording Fee Rate...'
                : isBeforeTenure
                ? `Cannot Set Before Tenure Starts (${openTenure?.opened_on})`
                : !isDaySunday
                ? 'Must Be A Sunday'
                : 'Save New Fee Rate'}
            </span>
          </button>
        </form>

        <div className="flex justify-end pt-3 mt-4 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </SettleModal>
  );
};
