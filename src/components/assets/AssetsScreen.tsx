import React, { useState, useEffect } from 'react';
import {
  Wrench,
  Package,
  UserCheck,
  Download,
  Plus,
  ArrowRight,
  RotateCcw,
  Tag,
  CheckCircle2,
  X,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import {
  Asset,
  AssetState,
  AssetHolding,
  Member,
  AssetEventKind,
  AcquireSource,
  LedgerEntryView,
} from '../../lib/db/types';
import { api } from '../../services/api';
import { formatDate, formatTaka } from '../../lib/utils';

interface AssetsScreenProps {
  onRefresh: () => void;
  onError: (err: any) => void;
}

export const AssetsScreen: React.FC<AssetsScreenProps> = ({
  onRefresh,
  onError,
}) => {
  const [tab, setTab] = useState<'inventory' | 'holdings'>('inventory');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetStates, setAssetStates] = useState<AssetState[]>([]);
  const [holdings, setHoldings] = useState<AssetHolding[]>([]);
  const [adminQueue, setAdminQueue] = useState<AssetState[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  // Action Modals
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [actionAsset, setActionAsset] = useState<AssetState | null>(null);
  const [actionKind, setActionKind] = useState<AssetEventKind>('lent');
  const [actionQuantity, setActionQuantity] = useState('1');
  const [actionMemberId, setActionMemberId] = useState('');
  const [actionSource, setActionSource] = useState<AcquireSource>('purchase');
  const [actionLedgerTxId, setActionLedgerTxId] = useState('');
  const [manualTxId, setManualTxId] = useState(false);
  const [expenseEntries, setExpenseEntries] = useState<LedgerEntryView[]>([]);
  const [actionNote, setActionNote] = useState('');
  const [actionDate, setActionDate] = useState(new Date().toISOString().split('T')[0]);

  // New asset form
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetMode, setNewAssetMode] = useState<Asset['mode']>('individual');
  const [newAssetOwner, setNewAssetOwner] = useState<Asset['ownership']>('lab');
  const [newAssetTag, setNewAssetTag] = useState('');
  const [newAssetNote, setNewAssetNote] = useState('');

  const [isCreatingAsset, setIsCreatingAsset] = useState(false);
  const [isRecordingEvent, setIsRecordingEvent] = useState(false);

  const loadData = async () => {
    try {
      const [ast, st, hld, queue, mems, entries] = await Promise.all([
        api.getAssets(),
        api.getAssetState(),
        api.getAssetHoldings(),
        api.getAdminReplacementQueue(),
        api.getMembers(),
        api.getEntriesCurrent().catch(() => []),
      ]);
      setAssets(ast);
      setAssetStates(st);
      setHoldings(hld);
      setAdminQueue(queue);
      setMembers(mems);
      setExpenseEntries(entries.filter((e) => e.kind === 'expense' && !e.is_voided));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssetName.trim()) {
      onError(new Error('Equipment name is required.'));
      return;
    }
    setIsCreatingAsset(true);
    try {
      await api.createAsset({
        name: newAssetName.trim(),
        mode: newAssetMode,
        ownership: newAssetOwner,
        tag: newAssetTag.trim() || null,
        note: newAssetNote.trim(),
      });

      setNewAssetName('');
      setNewAssetTag('');
      setNewAssetNote('');
      setShowAddAsset(false);
      await loadData();
      onRefresh();
    } catch (err) {
      onError(err);
    } finally {
      setIsCreatingAsset(false);
    }
  };

  const handleRecordEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionAsset) return;

    const qty = parseInt(actionQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      onError(new Error('Quantity must be at least 1.'));
      return;
    }
    if (['lent', 'returned'].includes(actionKind) && !actionMemberId) {
      onError(new Error('Please select a member for lending or returning equipment.'));
      return;
    }
    if (['damaged', 'lost', 'scrapped', 'exchanged'].includes(actionKind) && !actionNote.trim()) {
      onError(new Error('A note explaining the reason is required for this action.'));
      return;
    }
    if (actionKind === 'acquired' && actionSource === 'purchase') {
      const txId = parseInt(actionLedgerTxId, 10);
      if (isNaN(txId) || txId <= 0) {
        onError(new Error('A purchase acquisition must name the ledger expense transaction that paid for it.'));
        return;
      }
    }

    setIsRecordingEvent(true);
    try {
      const mId = actionMemberId ? parseInt(actionMemberId, 10) : null;
      const ledgerTxId = (actionKind === 'acquired' && actionSource === 'purchase' && actionLedgerTxId)
        ? parseInt(actionLedgerTxId, 10)
        : null;

      await api.recordAssetEvent({
        asset_id: actionAsset.asset_id,
        kind: actionKind,
        quantity: actionAsset.mode === 'individual' ? 1 : qty,
        occurred_on: actionDate,
        member_id: ['lent', 'returned', 'damaged', 'lost'].includes(actionKind) ? mId : null,
        source: actionKind === 'acquired' ? actionSource : null,
        ledger_transaction_id: ledgerTxId,
        note: actionNote.trim(),
      });

      setActionAsset(null);
      await loadData();
      onRefresh();
    } catch (err) {
      onError(err);
    } finally {
      setIsRecordingEvent(false);
    }
  };

  const handleExportAdminCsv = () => {
    api.exportAdminReplacementCsv();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Wrench className="h-4 w-4 text-zinc-500" />
            Equipment & Asset Register
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Know what the lab owns, who has what, and what is broken. Consumables like resistors are never tracked here.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {adminQueue.length > 0 && (
            <button
              onClick={handleExportAdminCsv}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 shadow-xs"
              title="Download CSV report of broken admin items for university administration"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Admin Replacement CSV ({adminQueue.length})</span>
            </button>
          )}

          <button
            onClick={() => setShowAddAsset(true)}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Asset</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1 text-xs font-medium max-w-xs">
        <button
          onClick={() => setTab('inventory')}
          className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-all ${
            tab === 'inventory'
              ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <Package className="h-3.5 w-3.5" />
          <span>All Assets ({assetStates.length})</span>
        </button>

        <button
          onClick={() => setTab('holdings')}
          className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-all ${
            tab === 'holdings'
              ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <UserCheck className="h-3.5 w-3.5" />
          <span>Who Has What ({holdings.length})</span>
        </button>
      </div>

      {/* TAB 1: Inventory Table */}
      {tab === 'inventory' && (
        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 uppercase tracking-wider text-[10px] font-semibold border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Equipment Name</th>
                  <th className="py-3 px-4">Tracking Mode</th>
                  <th className="py-3 px-4">Ownership</th>
                  <th className="py-3 px-4 text-center">In Stock</th>
                  <th className="py-3 px-4 text-center">With Members</th>
                  <th className="py-3 px-4 text-center">Damaged</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {assetStates.map((a) => {
                  return (
                    <tr key={a.asset_id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {a.asset_name}
                        </div>
                        {a.tag && (
                          <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                            Tag: {a.tag}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="capitalize text-zinc-600 dark:text-zinc-400">
                          {a.mode}
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                            a.ownership === 'admin'
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                          }`}
                        >
                          {a.ownership === 'admin' ? 'College Admin' : 'Lab Owned'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-bold text-zinc-900 dark:text-zinc-100">
                        {a.stock}
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-medium text-blue-600 dark:text-blue-400">
                        {a.with_members}
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-medium">
                        {a.damaged > 0 ? (
                          <span className="text-red-600 dark:text-red-400 font-bold">
                            {a.damaged}
                          </span>
                        ) : (
                          <span className="text-zinc-400">0</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setActionAsset(a);
                              setActionKind('acquired');
                              setActionQuantity('1');
                              setActionSource(a.ownership === 'admin' ? 'admin' : 'purchase');
                              setActionLedgerTxId('');
                              setManualTxId(false);
                              setActionNote('');
                            }}
                            className="rounded border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/30 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                            title="Add / Acquire Stock"
                          >
                            + Stock
                          </button>
                          {a.stock > 0 && (
                            <button
                              onClick={() => {
                                setActionAsset(a);
                                setActionKind('lent');
                                setActionQuantity('1');
                                setActionNote('');
                              }}
                              className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50"
                            >
                              Lend
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setActionAsset(a);
                              setActionKind('damaged');
                              setActionQuantity('1');
                              setActionNote('');
                            }}
                            className="rounded p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                            title="Mark Damaged"
                          >
                            <ShieldAlert className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Who Has What Register */}
      {tab === 'holdings' && (
        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
          <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Active Member Equipment Borrowings
            </span>
            <span className="text-xs text-zinc-400">
              No due dates. Lent in member's name with project in note.
            </span>
          </div>

          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 uppercase tracking-wider text-[10px] font-semibold border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="py-3 px-4">Borrowing Member</th>
                <th className="py-3 px-4">Equipment</th>
                <th className="py-3 px-4">Date Borrowed</th>
                <th className="py-3 px-4 text-center">Quantity</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {holdings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-400">
                    No equipment currently on loan with members.
                  </td>
                </tr>
              ) : (
                holdings.map((h, idx) => {
                  const ast = assetStates.find((s) => s.asset_id === h.asset_id);
                  return (
                    <tr key={idx} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40">
                      <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-zinc-100">
                        {h.member_name}
                      </td>
                      <td className="py-3 px-4 text-zinc-700 dark:text-zinc-300">
                        {h.asset_name}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-zinc-600 dark:text-zinc-400 font-mono text-[11px]">
                        {h.borrowed_date ? formatDate(h.borrowed_date) : '—'}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-zinc-900 dark:text-zinc-100">
                        {h.quantity}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => {
                            if (ast) {
                              setActionAsset(ast);
                              setActionKind('returned');
                              setActionQuantity(String(h.quantity));
                              setActionMemberId(String(h.member_id));
                              setActionNote('Returned to lab stock');
                            }
                          }}
                          className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 flex items-center gap-1 mx-auto"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Return to Lab</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Asset Movement Modal (Lend / Return / Damaged / Exchanged) */}
      {actionAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100 capitalize">
                {actionKind} Equipment
              </h3>
              <button
                onClick={() => setActionAsset(null)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 text-xs text-zinc-500">
              Processing <strong className="text-zinc-900 dark:text-zinc-100">{actionAsset.asset_name}</strong>
            </div>

            <form onSubmit={handleRecordEvent} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Movement Action
                </label>
                <select
                  value={actionKind}
                  onChange={(e) => setActionKind(e.target.value as AssetEventKind)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                >
                  <option value="acquired">Acquire / Add Stock</option>
                  <option value="lent">Lend to Member</option>
                  <option value="returned">Return to Lab Stock</option>
                  <option value="damaged">Mark Damaged</option>
                  <option value="repaired">Mark Repaired</option>
                  <option value="exchanged">Admin Exchanged (Replaced)</option>
                  <option value="lost">Mark Lost</option>
                  <option value="scrapped">Scrap / Decommission</option>
                </select>
              </div>

              {actionKind === 'acquired' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Acquisition Source
                  </label>
                  <select
                    value={actionSource}
                    onChange={(e) => setActionSource(e.target.value as AcquireSource)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                  >
                    <option value="purchase">Purchase (Club Funds)</option>
                    <option value="admin">College Administration</option>
                    <option value="project_return">Project Return</option>
                    <option value="donation">Donation / Alumni</option>
                    <option value="replacement">Warranty / Vendor Replacement</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              )}

              {actionKind === 'acquired' && actionSource === 'purchase' && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Paying Expense Transaction <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setManualTxId(!manualTxId)}
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {manualTxId ? 'Select from list' : 'Enter ID manually'}
                    </button>
                  </div>
                  {manualTxId || expenseEntries.length === 0 ? (
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="e.g. 10 (Expense Transaction ID)"
                      value={actionLedgerTxId}
                      onChange={(e) => setActionLedgerTxId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm font-mono text-zinc-900 dark:text-zinc-100 outline-none"
                    />
                  ) : (
                    <select
                      required
                      value={actionLedgerTxId}
                      onChange={(e) => setActionLedgerTxId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                    >
                      <option value="">Select ledger expense payment...</option>
                      {expenseEntries.map((tx) => {
                        const amt = tx.size || Math.abs((tx.lines || []).reduce((s, l) => s + l.amount, 0));
                        return (
                          <option key={tx.id} value={tx.id}>
                            #{tx.id} • {formatDate(tx.occurred_on)} • {formatTaka(amt)} {tx.note ? `— ${tx.note}` : ''}
                          </option>
                        );
                      })}
                    </select>
                  )}
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Purchases must link to the ledger expense that bought the equipment (required by PostgreSQL).
                  </p>
                </div>
              )}

              {['lent', 'returned'].includes(actionKind) && (
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Borrowing / Returning Member
                  </label>
                  <select
                    required
                    value={actionMemberId}
                    onChange={(e) => setActionMemberId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                  >
                    <option value="">Select active member...</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.batch ? `Batch ${m.batch}` : 'Member'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    disabled={actionAsset.mode === 'individual'}
                    value={actionQuantity}
                    onChange={(e) => setActionQuantity(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm font-mono text-zinc-900 dark:text-zinc-100 outline-none"
                  />
                  {actionAsset.mode === 'individual' && (
                    <p className="text-[10px] text-zinc-400 mt-0.5">Individually tracked (qty = 1)</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={actionDate}
                    onChange={(e) => setActionDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Project Note {['damaged', 'lost'].includes(actionKind) ? '(Required)' : '(Recommended)'}
                </label>
                <input
                  type="text"
                  required={['damaged', 'lost', 'scrapped', 'exchanged'].includes(actionKind)}
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder="e.g. Lent for drone flight controller PCB assembly"
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setActionAsset(null)}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRecordingEvent}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRecordingEvent && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                  <span>{isRecordingEvent ? 'Saving...' : 'Save Movement'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Asset Modal */}
      {showAddAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Register New Equipment
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Add lab apparatus, oscilloscopes, meters, or dev boards to the register.
            </p>

            <form onSubmit={handleCreateAsset} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Equipment Name & Model <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rigol DS1054Z 50MHz Oscilloscope"
                  value={newAssetName}
                  onChange={(e) => setNewAssetName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Tracking Mode <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={newAssetMode}
                    onChange={(e) => setNewAssetMode(e.target.value as Asset['mode'])}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                  >
                    <option value="individual">Individual (Tagged Unit)</option>
                    <option value="counted">Counted (Batch / Quantity)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Ownership <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={newAssetOwner}
                    onChange={(e) => setNewAssetOwner(e.target.value as Asset['ownership'])}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                  >
                    <option value="lab">Lab Owned (Club purchase)</option>
                    <option value="admin">College Administration</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Inventory Tag (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. ADMIN-EE-04"
                  value={newAssetTag}
                  onChange={(e) => setNewAssetTag(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm font-mono text-zinc-900 dark:text-zinc-100 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Note / Description (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Workbench 1 primary instrument"
                  value={newAssetNote}
                  onChange={(e) => setNewAssetNote(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddAsset(false)}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingAsset}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingAsset && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                  <span>{isCreatingAsset ? 'Registering...' : 'Register Equipment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
