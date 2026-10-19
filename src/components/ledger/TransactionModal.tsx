import React, { useState, useEffect } from 'react';
import { X, ArrowDownRight, ArrowUpRight, ArrowRightLeft, Sparkles, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';
import { Envelope, CostCenter, Member, IncomeSource, EntryKind } from '../../lib/db/types';
import { formatTaka } from '../../lib/utils';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: 'deposit' | 'expense' | 'transfer' | 'sweep';
  onTransactionSaved: () => void;
  onError: (err: any) => void;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  initialType = 'deposit',
  onTransactionSaved,
  onError,
}) => {
  const [kind, setKind] = useState<'deposit' | 'expense' | 'transfer' | 'sweep'>(initialType);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  // Form states
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [tag, setTag] = useState('');
  const [costCenterId, setCostCenterId] = useState<string>('');
  const [recordedBy, setRecordedBy] = useState('Treasurer');

  // Deposit specific
  const [source, setSource] = useState<IncomeSource>('donation');
  const [memberId, setMemberId] = useState<string>('');

  // Expense / Transfer specific
  const [selectedEnvelopeId, setSelectedEnvelopeId] = useState<string>('');
  const [targetEnvelopeId, setTargetEnvelopeId] = useState<string>('');

  useEffect(() => {
    setKind(initialType);
  }, [initialType]);

  useEffect(() => {
    if (!isOpen) return;
    const loadDependencies = async () => {
      try {
        const [envs, ccs, mems] = await Promise.all([
          api.getEnvelopes(),
          api.getCostCenters(),
          api.getMembers(),
        ]);
        setEnvelopes(envs.filter((e) => e.active));
        setCostCenters(ccs.filter((c) => c.status === 'active'));
        setMembers(mems);

        // Set default envelope
        const nonPool = envs.find((e) => !e.is_pool && e.active);
        const pool = envs.find((e) => e.is_pool);
        if (nonPool) setSelectedEnvelopeId(String(nonPool.id));
        if (pool) setTargetEnvelopeId(String(pool.id));
      } catch (e) {
        console.error(e);
      }
    };
    loadDependencies();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseInt(amount, 10);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid positive taka amount.');
      return;
    }

    try {
      const ccId = costCenterId ? parseInt(costCenterId, 10) : null;
      const memId = memberId ? parseInt(memberId, 10) : null;

      if (kind === 'deposit') {
        const pool = envelopes.find((e) => e.is_pool);
        if (!pool) throw new Error('General Pool envelope not found.');

        await api.recordTransaction({
          kind: 'deposit',
          occurred_on: date,
          recorded_by: recordedBy,
          note: note.trim(),
          tag: tag.trim() || null,
          cost_center_id: ccId,
          source,
          member_id: source === 'weekly_fee' ? memId : null,
          lines: [{ envelope_id: pool.id, amount: amt }],
        });
      } else if (kind === 'expense') {
        const envId = parseInt(selectedEnvelopeId, 10);
        await api.recordTransaction({
          kind: 'expense',
          occurred_on: date,
          recorded_by: recordedBy,
          note: note.trim(),
          tag: tag.trim() || null,
          cost_center_id: ccId,
          source: null,
          member_id: null,
          lines: [{ envelope_id: envId, amount: -amt }],
        });
      } else if (kind === 'transfer') {
        const fromId = parseInt(selectedEnvelopeId, 10);
        const toId = parseInt(targetEnvelopeId, 10);
        if (fromId === toId) {
          alert('Cannot transfer money into the same envelope.');
          return;
        }
        await api.recordTransaction({
          kind: 'transfer',
          occurred_on: date,
          recorded_by: recordedBy,
          note: note.trim() || 'Envelope transfer',
          tag: tag.trim() || null,
          cost_center_id: ccId,
          source: null,
          member_id: null,
          lines: [
            { envelope_id: fromId, amount: -amt },
            { envelope_id: toId, amount: amt },
          ],
        });
      }

      onTransactionSaved();
      onClose();
    } catch (err: any) {
      onError(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100">
              Record Money Movement
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="mt-4 flex rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setKind('deposit')}
            className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-all ${
              kind === 'deposit'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <ArrowDownRight className="h-3.5 w-3.5 text-emerald-600" />
            <span>Money In (Deposit)</span>
          </button>
          <button
            type="button"
            onClick={() => setKind('expense')}
            className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-all ${
              kind === 'expense'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <ArrowUpRight className="h-3.5 w-3.5 text-red-500" />
            <span>Money Out (Expense)</span>
          </button>
          <button
            type="button"
            onClick={() => setKind('transfer')}
            className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-all ${
              kind === 'transfer'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <ArrowRightLeft className="h-3.5 w-3.5 text-blue-500" />
            <span>Transfer</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Amount and Date */}
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
                  placeholder="500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 pl-7 pr-3 py-2 text-sm font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:border-zinc-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Date Occurred
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
              />
            </div>
          </div>

          {/* Deposit specific fields */}
          {kind === 'deposit' && (
            <div className="space-y-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 p-3 border border-zinc-100 dark:border-zinc-800">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Income Source
                  </label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value as IncomeSource)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                  >
                    <option value="weekly_fee">Weekly Member Fee</option>
                    <option value="admin_grant">Admin / College Grant</option>
                    <option value="sponsorship">Sponsorship</option>
                    <option value="registration">Event Registration</option>
                    <option value="donation">Donation</option>
                    <option value="other">Other Income</option>
                  </select>
                </div>

                {source === 'weekly_fee' ? (
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Paying Member
                    </label>
                    <select
                      required
                      value={memberId}
                      onChange={(e) => setMemberId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                    >
                      <option value="">Select Member...</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.batch ? `Batch ${m.batch}` : 'Member'})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Destination Pot
                    </label>
                    <div className="mt-1 text-xs text-zinc-500 py-2">
                      Deposits flow into <strong>General Pool</strong>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Expense specific fields */}
          {kind === 'expense' && (
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Deduct from Envelope
              </label>
              <select
                required
                value={selectedEnvelopeId}
                onChange={(e) => setSelectedEnvelopeId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
              >
                {envelopes.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Transfer specific fields */}
          {kind === 'transfer' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Transfer From
                </label>
                <select
                  required
                  value={selectedEnvelopeId}
                  onChange={(e) => setSelectedEnvelopeId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                >
                  {envelopes.map((env) => (
                    <option key={env.id} value={env.id}>
                      {env.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Transfer To
                </label>
                <select
                  required
                  value={targetEnvelopeId}
                  onChange={(e) => setTargetEnvelopeId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                >
                  {envelopes.map((env) => (
                    <option key={env.id} value={env.id}>
                      {env.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Note & Cost Center */}
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Human Description Note {['transfer', 'reversal'].includes(kind) ? '(Required)' : ''}
            </label>
            <input
              type="text"
              required={['transfer'].includes(kind)}
              placeholder="e.g. Solder wire and flux purchased from Nawabpur"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:border-zinc-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Attach to Event / Project (optional)
              </label>
              <select
                value={costCenterId}
                onChange={(e) => setCostCenterId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
              >
                <option value="">None (General Lab)</option>
                {costCenters.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.name} ({cc.kind})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Tag / Sub-label (optional)
              </label>
              <input
                type="text"
                placeholder="e.g. tools, transport, meal"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:border-zinc-400"
              />
            </div>
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
              Record Transaction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
