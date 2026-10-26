import React, { useState, useEffect } from 'react';
import { TrendingUp, Plus, Calendar, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';
import { FeeRate } from '../../lib/db/types';
import { formatTaka, sundayOnOrBefore, toLocalDateStr } from '../../lib/utils';
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
  const [effectiveFrom, setEffectiveFrom] = useState(
    sundayOnOrBefore(toLocalDateStr(new Date()))
  );
  const [amount, setAmount] = useState('50');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ reason: string; remediation?: string } | null>(null);

  const loadRates = async () => {
    try {
      const data = await api.getFeeRates();
      // Sort newest first
      setRates([...data].sort((a, b) => b.effective_from.localeCompare(a.effective_from)));
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

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-zinc-900 dark:bg-zinc-100 px-3 py-2 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {loading ? 'Recording...' : 'Save New Fee Rate'}
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
    </SettleModal>
  );
};
