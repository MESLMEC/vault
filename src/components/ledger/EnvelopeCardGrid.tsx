import React, { useState } from 'react';
import { EnvelopeBalance } from '../../lib/db/types';
import { formatTaka } from '../../lib/utils';
import { Layers, Plus, Sparkles, AlertCircle, Settings2, Trash2, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { useConfirmation } from '../../context/ConfirmationContext';

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
  const { confirm } = useConfirmation();
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [targetCap, setTargetCap] = useState<string>('');
  const [allocPriority, setAllocPriority] = useState<string>('');

  // Edit / Settings modal state
  const [editEnv, setEditEnv] = useState<EnvelopeBalance | null>(null);
  const [editName, setEditName] = useState('');
  const [editCap, setEditCap] = useState<string>('');
  const [editPriority, setEditPriority] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
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
    } finally {
      setIsCreating(false);
    }
  };

  const openEditModal = (env: EnvelopeBalance) => {
    setEditEnv(env);
    setEditName(env.name);
    setEditCap(env.target_cap !== null ? String(env.target_cap) : '');
    setEditPriority(env.alloc_priority !== null ? String(env.alloc_priority) : '');
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEnv) return;
    setIsSavingSettings(true);
    try {
      if (editName.trim() && editName.trim() !== editEnv.name) {
        await api.renameEnvelope(editEnv.id, editName.trim());
      }
      const capNum = editCap ? parseInt(editCap, 10) : null;
      const prioNum = editPriority ? parseInt(editPriority, 10) : null;
      await api.updateEnvelopeSettings(editEnv.id, {
        target_cap: capNum,
        alloc_priority: prioNum,
      });
      setEditEnv(null);
      onEnvelopeCreated();
    } catch (err) {
      onError(err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleDeactivate = async () => {
    if (!editEnv) return;
    if (editEnv.balance > 0) {
      onError({
        reason: 'Envelope has positive balance',
        remediation: `Cannot deactivate "${editEnv.name}" while it holds ৳${editEnv.balance.toLocaleString()}. Transfer remaining funds to another envelope or pool first.`,
      });
      return;
    }

    const ok = await confirm({
      title: 'Deactivate Virtual Envelope',
      description: `Deactivate envelope "${editEnv.name}"? It will no longer receive allocations, sweeps, or transfers.`,
      confirmLabel: 'Deactivate',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await api.deactivateEnvelope(editEnv.id);
      setEditEnv(null);
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
                  <div className="flex items-center gap-1.5 shrink-0">
                    {env.is_pool ? (
                      <span className="rounded-full bg-zinc-900 dark:bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-white dark:text-zinc-900">
                        Pool
                      </span>
                    ) : (
                      <>
                        {env.alloc_priority ? (
                          <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-mono font-medium text-zinc-600 dark:text-zinc-400">
                            Prio #{env.alloc_priority}
                          </span>
                        ) : null}
                        <button
                          onClick={() => openEditModal(env)}
                          className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          title="Envelope settings & rename"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
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
                  disabled={isCreating}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreating && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                  <span>{isCreating ? 'Creating...' : 'Create Envelope'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Edit Envelope Modal */}
      {editEnv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Settings2 className="h-4 w-4" /> Envelope Settings
              </h3>
              <button
                onClick={() => setEditEnv(null)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Envelope Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
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
                    placeholder="None"
                    value={editCap}
                    onChange={(e) => setEditCap(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Priority Rank (optional)
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="None"
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleDeactivate}
                  className="flex items-center gap-1 rounded-lg border border-red-200 dark:border-red-900 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                  title="Deactivate envelope (balance must be zero)"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Deactivate
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditEnv(null)}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingSettings}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingSettings && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                    <span>{isSavingSettings ? 'Saving...' : 'Save Changes'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
