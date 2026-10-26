import React, { useState } from 'react';
import {
  Search,
  Filter,
  History,
  Edit2,
  ArrowDownRight,
  ArrowUpRight,
  ArrowRightLeft,
  Calendar,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  Share2,
  Receipt,
} from 'lucide-react';
import { LedgerEntryView, Envelope, CostCenter } from '../../lib/db/types';
import { formatTaka, formatDate } from '../../lib/utils';
import { FixAmountModal } from './FixAmountModal';
import { EditLabelModal } from './EditLabelModal';
import { FeeReceiptModal } from '../dues/FeeReceiptModal';
import { api } from '../../services/api';

interface LedgerTableProps {
  entries: LedgerEntryView[];
  envelopes: Envelope[];
  costCenters: CostCenter[];
  onRefresh: () => void;
  onError: (err: any) => void;
}

export const LedgerTable: React.FC<LedgerTableProps> = ({
  entries,
  envelopes,
  costCenters,
  onRefresh,
  onError,
}) => {
  const [search, setSearch] = useState('');
  const [selectedEnvelope, setSelectedEnvelope] = useState<string>('all');
  const [selectedCostCenter, setSelectedCostCenter] = useState<string>('all');

  // Modal states
  const [fixEntry, setFixEntry] = useState<LedgerEntryView | null>(null);
  const [editLabelEntry, setEditLabelEntry] = useState<LedgerEntryView | null>(null);
  const [receiptTx, setReceiptTx] = useState<LedgerEntryView | null>(null);
  const [activeTrailId, setActiveTrailId] = useState<number | null>(null);
  const [trailData, setTrailData] = useState<LedgerEntryView[]>([]);

  const handleShowTrail = async (txId: number) => {
    if (activeTrailId === txId) {
      setActiveTrailId(null);
      setTrailData([]);
      return;
    }
    try {
      const trail = await api.getReversalTrail(txId);
      setTrailData(trail);
      setActiveTrailId(txId);
    } catch (e) {
      console.error(e);
    }
  };

  const filteredEntries = entries.filter((tx) => {
    // Search filter
    const matchesSearch =
      tx.note.toLowerCase().includes(search.toLowerCase()) ||
      (tx.tag && tx.tag.toLowerCase().includes(search.toLowerCase())) ||
      (tx.member_name && tx.member_name.toLowerCase().includes(search.toLowerCase())) ||
      (tx.cost_center_name && tx.cost_center_name.toLowerCase().includes(search.toLowerCase()));

    // Envelope filter
    const matchesEnvelope =
      selectedEnvelope === 'all' ||
      tx.lines.some((l) => l.envelope_id === parseInt(selectedEnvelope, 10));

    // Cost center filter
    const matchesCC =
      selectedCostCenter === 'all' ||
      (tx.cost_center_id !== null && tx.cost_center_id === parseInt(selectedCostCenter, 10));

    return matchesSearch && matchesEnvelope && matchesCC;
  });

  const getEnvelopeName = (id: number) => envelopes.find((e) => e.id === id)?.name ?? `Env #${id}`;

  return (
    <div className="space-y-4">
      {/* Modals */}
      <FixAmountModal
        transaction={fixEntry}
        onClose={() => setFixEntry(null)}
        onSuccess={onRefresh}
        onError={onError}
      />
      <EditLabelModal
        transaction={editLabelEntry}
        onClose={() => setEditLabelEntry(null)}
        onSuccess={onRefresh}
        onError={onError}
      />
      <FeeReceiptModal
        isOpen={!!receiptTx}
        onClose={() => setReceiptTx(null)}
        transaction={receiptTx}
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute inset-y-0 left-0 my-auto h-4 w-4 text-zinc-400 pl-3 pointer-events-none" />
          <input
            type="text"
            placeholder="Search note, tag, member, event..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-9 pr-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:border-zinc-400"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Envelope Filter */}
          <select
            value={selectedEnvelope}
            onChange={(e) => setSelectedEnvelope(e.target.value)}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 outline-none"
          >
            <option value="all">All Envelopes</option>
            {envelopes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>

          {/* Cost Center Filter */}
          <select
            value={selectedCostCenter}
            onChange={(e) => setSelectedCostCenter(e.target.value)}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 outline-none"
          >
            <option value="all">All Events & Projects</option>
            {costCenters.map((cc) => (
              <option key={cc.id} value={cc.id}>
                {cc.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 uppercase tracking-wider text-[10px] font-semibold border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Description & Context</th>
                <th className="py-3 px-4">Envelopes & Flow</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-sans">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-400">
                    No transactions match the current filter.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((tx) => {
                  const isDeposit = tx.kind === 'deposit';
                  const isExpense = tx.kind === 'expense';
                  const isTransfer = tx.kind === 'transfer';
                  const isSweep = tx.kind === 'sweep';
                  const isOpening = tx.kind === 'opening';

                  const netAmount = tx.lines.reduce((s, l) => s + l.amount, 0);
                  const displayAmt =
                    isTransfer || isSweep
                      ? Math.max(...tx.lines.map((l) => l.amount))
                      : Math.abs(netAmount);

                  return (
                    <React.Fragment key={tx.id}>
                      <tr className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors">
                        {/* Date */}
                        <td className="py-3 px-4 whitespace-nowrap text-zinc-500">
                          {formatDate(tx.occurred_on)}
                        </td>

                        {/* Kind Badge */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {isDeposit && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                              <ArrowDownRight className="h-3 w-3" />
                              Deposit
                            </span>
                          )}
                          {isExpense && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-red-50 dark:bg-red-950/60 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40">
                              <ArrowUpRight className="h-3 w-3" />
                              Expense
                            </span>
                          )}
                          {isTransfer && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40">
                              <ArrowRightLeft className="h-3 w-3" />
                              Transfer
                            </span>
                          )}
                          {isSweep && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 text-[11px] font-medium text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800/40">
                              <Sparkles className="h-3 w-3" />
                              Sweep
                            </span>
                          )}
                          {isOpening && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                              Opening
                            </span>
                          )}
                        </td>

                        {/* Description & Context */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-zinc-900 dark:text-zinc-100">
                              {tx.note || '(No note)'}
                            </span>

                            {tx.corrected_from && (
                              <button
                                onClick={() => handleShowTrail(tx.id)}
                                className="inline-flex items-center gap-1 rounded bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 hover:bg-amber-100"
                              >
                                <History className="h-2.5 w-2.5" />
                                Corrected
                              </button>
                            )}

                            {tx.tag && (
                              <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:text-zinc-400 font-mono">
                                #{tx.tag}
                              </span>
                            )}

                            {tx.cost_center_name && (
                              <span className="rounded bg-indigo-50 dark:bg-indigo-950/50 px-1.5 py-0.5 text-[10px] text-indigo-700 dark:text-indigo-400 border border-indigo-200/50">
                                {tx.cost_center_name}
                              </span>
                            )}

                            {tx.member_name && (
                              <span className="rounded bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">
                                Member: {tx.member_name}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Envelopes Touched */}
                        <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                          {tx.lines.map((l) => (
                            <div key={l.id} className="text-[11px] font-mono leading-tight">
                              {getEnvelopeName(l.envelope_id)}: {formatTaka(l.amount)}
                            </div>
                          ))}
                        </td>

                        {/* Net Amount */}
                        <td className="py-3 px-4 text-right font-mono font-semibold whitespace-nowrap">
                          {isDeposit && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              +{formatTaka(displayAmt)}
                            </span>
                          )}
                          {isExpense && (
                            <span className="text-red-600 dark:text-red-400">
                              -{formatTaka(displayAmt)}
                            </span>
                          )}
                          {(isTransfer || isSweep) && (
                            <span className="text-zinc-700 dark:text-zinc-300">
                              {formatTaka(displayAmt)}
                            </span>
                          )}
                          {isOpening && (
                            <span className="text-zinc-900 dark:text-zinc-100">
                              {formatTaka(displayAmt)}
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            {(tx.source === 'weekly_fee' || tx.tag === 'fees' || !!tx.member_id || !!tx.member_name) && (
                              <button
                                onClick={() => setReceiptTx(tx)}
                                title="View and download member fee receipt"
                                className="rounded p-1 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/60"
                              >
                                <Receipt className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {!isOpening && (
                              <button
                                onClick={() => setFixEntry(tx)}
                                title="Fix Amount (records reversal and corrected replacement)"
                                className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              >
                                <History className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => setEditLabelEntry(tx)}
                              title="Edit description or tags in-place"
                              className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Reversal / Correction Trail */}
                      {activeTrailId === tx.id && (
                        <tr className="bg-zinc-50/90 dark:bg-zinc-800/80">
                          <td colSpan={6} className="p-4 border-l-4 border-amber-500">
                            <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2">
                              <History className="h-3.5 w-3.5" />
                              Audit Trail for Correction Sequence
                            </div>
                            <div className="space-y-2 text-xs">
                              {trailData.map((step, idx) => (
                                <div
                                  key={step.id}
                                  className="flex items-center justify-between rounded bg-white dark:bg-zinc-900 p-2.5 border border-zinc-200 dark:border-zinc-700"
                                >
                                  <div>
                                    <span className="font-semibold">Entry #{step.id}</span> — {step.note}
                                    <div className="text-[10px] text-zinc-400 mt-0.5">
                                      Recorded on {step.occurred_on} by {step.recorded_by}
                                    </div>
                                  </div>
                                  <div className="font-mono text-xs font-semibold">
                                    {step.lines.map((l) => formatTaka(l.amount)).join(', ')}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
