import React, { useState } from 'react';
import { EnvelopeBalance } from '../../lib/db/types';
import { formatTaka } from '../../lib/utils';
import { Layers, Plus, Sparkles, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';

interface EnvelopeCardGridProps {
  envelopes: EnvelopeBalance[];
  onEnvelopeCreated: () => void;
  onError: (err: any) => void;
}

export const EnvelopeCardGrid: React.FC<EnvelopeCardGridProps> = ({
  envelopes,
  onEnvelopeCreated,
  onError,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [targetCap, setTargetCap] = useState<string>('');
  const [allocPriority, setAllocPriority] = useState<string>('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const capNum = targetCap ? parseInt(targetCap, 10) : null;
      const prioNum = allocPriority ? parseInt(allocPriority, 10) : null;
      await api.createEnvelope(name, capNum, prioNum);
      setName('');
      setTargetCap('');
      setAllocPriority('');
      setShowAddModal(false);
      onEnvelopeCreated();
    } catch (err) {
      onError(err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Layers className="h-4 w-4 text-zinc-500" />
            Virtual Envelopes & Pots
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Hard financial limits. Money in an envelope cannot be overspent.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Envelope</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {envelopes.map((env) => {
          const cap = env.target_cap;
          const pct = cap ? Math.min(100, Math.round((env.balance / cap) * 100)) : null;
          const isFilled = cap !== null && env.balance >= cap;

          return (
            <div
              key={env.id}
              className={`relative flex flex-col justify-between rounded-xl border p-4 transition-all shadow-sm ${
                env.is_pool
                  ? 'border-zinc-900 dark:border-zinc-600 bg-zinc-900/5 dark:bg-zinc-800/40'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 leading-snug truncate">
                    {env.name}
                  </h3>
                  {env.is_pool ? (
                    <span className="shrink-0 rounded-full bg-zinc-900 dark:bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-white dark:text-zinc-900">
                      Pool
                    </span>
                  ) : env.alloc_priority ? (
                    <span className="shrink-0 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-mono font-medium text-zinc-600 dark:text-zinc-400">
                      Prio #{env.alloc_priority}
                    </span>
                  ) : null}
                </div>

                {/* Balance display */}
                <div className="mt-3">
                  <div className="text-xs text-zinc-400 font-medium">Available Balance</div>
                  <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100 tracking-tight mt-0.5">
                    {formatTaka(env.balance)}
                  </div>
                </div>
              </div>

              {/* Target Cap Progress Bar */}
              <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
                {cap !== null ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span>Cap: {formatTaka(cap)}</span>
                      <span className="font-mono">{pct}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isFilled ? 'bg-emerald-500' : 'bg-zinc-700 dark:bg-zinc-300'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-zinc-400 italic">No cap limit set</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New Envelope Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Create Virtual Envelope</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Envelopes partition the lab's money into virtual wallets for specific purposes.
            </p>

            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Envelope Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Soldering Equipment, PCB Printing..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:border-zinc-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Target Cap (৳, optional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 10000"
                    value={targetCap}
                    onChange={(e) => setTargetCap(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:border-zinc-400"
                  />
                  <p className="text-[10px] text-zinc-400 mt-1">Used by allocation meeting drafts</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Priority Rank (optional)
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="1, 2, 3..."
                    value={allocPriority}
                    onChange={(e) => setAllocPriority(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:border-zinc-400"
                  />
                  <p className="text-[10px] text-zinc-400 mt-1">1 gets topped up first</p>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
                >
                  Create Envelope
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
