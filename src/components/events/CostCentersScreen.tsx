import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Sparkles,
  Plus,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  X,
  Layers,
  Edit2,
} from 'lucide-react';
import { CostCenterSummary, CostCenter, EnvelopeBalance } from '../../lib/db/types';
import { api } from '../../services/api';
import { formatTaka } from '../../lib/utils';

interface CostCentersScreenProps {
  onRefresh: () => void;
  onError: (err: any) => void;
}

export const CostCentersScreen: React.FC<CostCentersScreenProps> = ({
  onRefresh,
  onError,
}) => {
  const [summaries, setSummaries] = useState<CostCenterSummary[]>([]);
  const [envelopes, setEnvelopes] = useState<EnvelopeBalance[]>([]);

  // Sweep Modal State
  const [sweepTarget, setSweepTarget] = useState<CostCenterSummary | null>(null);
  const [sweepEnvelopeId, setSweepEnvelopeId] = useState<string>('');
  const [sweepNote, setSweepNote] = useState('');
  const [sweepDate, setSweepDate] = useState(new Date().toISOString().split('T')[0]);

  // Create Cost Center Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<CostCenter['kind']>('event');

  // Edit / Rename Modal State
  const [editCC, setEditCC] = useState<CostCenterSummary | null>(null);
  const [editCCName, setEditCCName] = useState('');
  const [editCCStatus, setEditCCStatus] = useState<CostCenter['status']>('active');

  const loadData = async () => {
    try {
      const [sums, envs] = await Promise.all([
        api.getCostCenterSummary(),
        api.getEnvelopeBalances(),
      ]);
      setSummaries(sums);
      setEnvelopes(envs.filter((e) => !e.is_pool && e.active));
      if (envs.length > 0) {
        const nonPool = envs.find((e) => !e.is_pool && e.active);
        if (nonPool) setSweepEnvelopeId(String(nonPool.id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSweep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sweepTarget) return;

    try {
      const envId = parseInt(sweepEnvelopeId, 10);
      await api.sweepLeftover({
        costCenterId: sweepTarget.cost_center_id,
        fromEnvelopeId: envId,
        by: 'Treasurer',
        date: sweepDate,
        note: sweepNote.trim() || `Sweep leftover for ${sweepTarget.name}`,
      });
      alert(`Successfully swept ৳${sweepTarget.leftover.toLocaleString()} back into the General Pool.`);
      setSweepTarget(null);
      await loadData();
      onRefresh();
    } catch (err) {
      onError(err);
    }
  };

  const handleCreateCostCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createCostCenter(newName, newKind);
      setNewName('');
      setShowCreateModal(false);
      await loadData();
      onRefresh();
    } catch (err) {
      onError(err);
    }
  };

  const handleEditCC = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCC) return;
    try {
      if (editCCName.trim() && editCCName.trim() !== editCC.name) {
        await api.renameCostCenter(editCC.cost_center_id, editCCName.trim());
      }
      if (editCCStatus !== editCC.status) {
        await api.updateCostCenterStatus(editCC.cost_center_id, editCCStatus);
      }
      setEditCC(null);
      await loadData();
      onRefresh();
    } catch (err) {
      onError(err);
    }
  };

  const getKindBadge = (kind: CostCenter['kind']) => {
    switch (kind) {
      case 'competition':
        return 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border-amber-200/60';
      case 'event':
        return 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 border-blue-200/60';
      case 'lab_project':
        return 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border-emerald-200/60';
      case 'member_project':
        return 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-400 border-purple-200/60';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-zinc-500" />
            Events & Project Cost Centers
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Track money allocated and spent for competitions, workshops, and lab projects. Sweep unspent leftovers back to the Pool upon wrap-up.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Event / Project</span>
        </button>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {summaries.map((cc) => (
          <div
            key={cc.cost_center_id}
            className="flex flex-col justify-between rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm space-y-4"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${getKindBadge(
                    cc.kind
                  )}`}
                >
                  {cc.kind.replace('_', ' ')}
                </span>
                <div className="flex items-center gap-1">
                  <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500 capitalize">
                    {cc.status}
                  </span>
                  <button
                    onClick={() => {
                      setEditCC(cc);
                      setEditCCName(cc.name);
                      setEditCCStatus(cc.status);
                    }}
                    className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title="Rename or change status"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100 mt-2">
                {cc.name}
              </h3>
            </div>

            {/* Financial Numbers */}
            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/40 p-3 border border-zinc-100 dark:border-zinc-800 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 flex items-center gap-1">
                  <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />
                  Money In (Grants/Fees):
                </span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatTaka(cc.money_in)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-zinc-500 flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5 text-red-500" />
                  Money Out (Expenses):
                </span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatTaka(cc.money_out)}
                </span>
              </div>

              {cc.swept > 0 && (
                <div className="flex items-center justify-between text-purple-600 dark:text-purple-400">
                  <span className="flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" />
                    Already Swept:
                  </span>
                  <span className="font-mono font-semibold">
                    {formatTaka(cc.swept)}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-zinc-200/60 dark:border-zinc-700/60 pt-2 font-bold">
                <span className="text-zinc-700 dark:text-zinc-300">Unspent Leftover:</span>
                <span
                  className={`font-mono text-sm ${
                    cc.leftover > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-zinc-500'
                  }`}
                >
                  {formatTaka(cc.leftover)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div>
              {cc.leftover > 0 ? (
                <button
                  onClick={() => {
                    setSweepTarget(cc);
                    setSweepNote(`Wrap-up sweep: leftover funds from ${cc.name}`);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/30 px-3 py-2 text-xs font-semibold text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors shadow-xs"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Sweep Leftover ({formatTaka(cc.leftover)}) to Pool</span>
                </button>
              ) : (
                <div className="text-center text-[11px] text-zinc-400 py-1 italic">
                  No unspent funds remaining
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Sweep Leftover Modal */}
      {sweepTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100">
                  Sweep Leftover Money
                </h3>
              </div>
              <button
                onClick={() => setSweepTarget(null)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-3 text-xs text-zinc-500 leading-relaxed">
              Wrap up <strong>{sweepTarget.name}</strong>. Transfer remaining{' '}
              <strong className="text-purple-600 font-mono">
                {formatTaka(sweepTarget.leftover)}
              </strong>{' '}
              out of the event envelope and back into the <strong>General Pool</strong>.
            </p>

            <form onSubmit={handleSweep} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Deduct from Envelope
                </label>
                <select
                  required
                  value={sweepEnvelopeId}
                  onChange={(e) => setSweepEnvelopeId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                >
                  {envelopes.map((env) => (
                    <option key={env.id} value={env.id}>
                      {env.name} ({formatTaka(env.balance)} available)
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-zinc-400 mt-1">
                  Select the envelope where this project's expenses were paid from
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Transaction Note
                </label>
                <input
                  type="text"
                  required
                  value={sweepNote}
                  onChange={(e) => setSweepNote(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setSweepTarget(null)}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 text-xs font-medium shadow-sm"
                >
                  Confirm Sweep to Pool
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Cost Center Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Create Cost Center
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Add a project or event label to attach to expenses and equipment loans.
            </p>

            <form onSubmit={handleCreateCostCenter} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Name / Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PCB Fabrication Workshop 2026"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Category Kind
                </label>
                <select
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value as CostCenter['kind'])}
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                >
                  <option value="event">Event (Workshop, Seminar, Boot Camp)</option>
                  <option value="competition">Competition (Robotics Olympiad, Hackathon)</option>
                  <option value="lab_project">Lab Project (Internal lab development)</option>
                  <option value="member_project">Member Project (Student thesis or team build)</option>
                </select>
              </div>

              <div className="mt-6 flex justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
                >
                  Create Cost Center
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Edit Cost Center Modal */}
      {editCC && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit2 className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
                <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100">
                  Edit Cost Center
                </h3>
              </div>
              <button
                onClick={() => setEditCC(null)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditCC} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Cost Center Name
                </label>
                <input
                  type="text"
                  required
                  value={editCCName}
                  onChange={(e) => setEditCCName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Lifecycle Status
                </label>
                <select
                  value={editCCStatus}
                  onChange={(e) => setEditCCStatus(e.target.value as any)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
                >
                  <option value="planned">Planned (Upcoming)</option>
                  <option value="active">Active (Ongoing)</option>
                  <option value="completed">Completed (Finished)</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <p className="text-[10px] text-zinc-400 mt-1">
                  Active cost centers accept expenses and member fee sponsorships.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditCC(null)}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
