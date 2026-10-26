import React, { useState } from 'react';
import {
  Users,
  Search,
  Plus,
  Calendar,
  AlertTriangle,
  ArrowDownRight,
  ShieldAlert,
  CheckCircle,
  HelpCircle,
  UserCheck,
  TrendingUp,
  Edit2,
  Share2,
  Receipt,
} from 'lucide-react';
import { MemberStanding, Member, LedgerEntryView } from '../../lib/db/types';
import { formatTaka, formatDate } from '../../lib/utils';
import { QuickFeeCollectorModal } from './QuickFeeCollectorModal';
import { WaiverModal } from './WaiverModal';
import { ShutdownCalendarModal } from './ShutdownCalendarModal';
import { FeeRatesModal } from './FeeRatesModal';
import { EditMemberModal } from './EditMemberModal';
import { FeeReceiptModal } from './FeeReceiptModal';
import { api } from '../../services/api';

interface DuesOverviewTableProps {
  standing: MemberStanding[];
  members: Member[];
  entries?: LedgerEntryView[];
  onRefresh: () => void;
  onError: (err: any) => void;
}

export const DuesOverviewTable: React.FC<DuesOverviewTableProps> = ({
  standing,
  members,
  entries = [],
  onRefresh,
  onError,
}) => {
  const [filter, setFilter] = useState<'all' | 'arrears' | 'settled' | 'credit'>('all');
  const [search, setSearch] = useState('');
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);

  // Modals
  const [collectorOpen, setCollectorOpen] = useState(false);
  const [collectorMemberId, setCollectorMemberId] = useState<number | null>(null);
  const [waiverMember, setWaiverMember] = useState<Member | null>(null);
  const [shutdownOpen, setShutdownOpen] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [feeRatesOpen, setFeeRatesOpen] = useState(false);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<{
    tx: LedgerEntryView;
    member?: Member | null;
    standing?: MemberStanding | null;
  } | null>(null);

  // New member form states
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberBatch, setNewMemberBatch] = useState('');
  const [newMemberStart, setNewMemberStart] = useState(new Date().toISOString().split('T')[0]);
  const [newMemberNote, setNewMemberNote] = useState('');

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createMember(newMemberName, newMemberStart, newMemberBatch, newMemberNote);
      setNewMemberName('');
      setNewMemberBatch('');
      setNewMemberNote('');
      setShowAddMember(false);
      onRefresh();
    } catch (err) {
      onError(err);
    }
  };

  const filtered = standing.filter((s) => {
    const matchesSearch = s.who_name.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (filter === 'arrears') return s.balance < 0;
    if (filter === 'settled') return s.balance === 0;
    if (filter === 'credit') return s.balance > 0;
    return true;
  });

  const totalArrears = standing.filter((s) => s.balance < 0).reduce((sum, s) => sum + s.balance, 0);
  const totalCredit = standing.filter((s) => s.balance > 0).reduce((sum, s) => sum + s.balance, 0);
  const countOverdue = standing.filter((s) => s.weeks_overdue > 0).length;

  const handleShareMemberReceipt = (s: MemberStanding) => {
    const mem = members.find((m) => m.id === s.who_id) || null;
    const lastFeeTx = entries.find(
      (tx) =>
        !tx.is_voided &&
        (tx.member_id === s.who_id || tx.member_name === s.who_name) &&
        (tx.source === 'weekly_fee' || tx.tag === 'fees' || tx.kind === 'deposit')
    );

    if (lastFeeTx) {
      setSelectedReceipt({ tx: lastFeeTx, member: mem, standing: s });
    } else {
      const statementTx: LedgerEntryView = {
        id: s.who_id,
        tenure_id: 1,
        kind: 'deposit',
        occurred_on: new Date().toISOString().split('T')[0],
        recorded_at: new Date().toISOString(),
        recorded_by: 'Treasurer',
        note:
          s.balance >= 0
            ? 'Member Dues Account Status (Settled / In Advance)'
            : `Dues Statement (${s.weeks_overdue} weeks behind)`,
        tag: 'fees',
        source: 'weekly_fee',
        member_id: s.who_id,
        member_name: s.who_name,
        cost_center_id: null,
        reverses_id: null,
        replaces_id: null,
        lines: [
          {
            id: 1,
            transaction_id: s.who_id,
            envelope_id: 1,
            amount: Math.abs(s.credits || s.owed || 50),
          },
        ],
        is_voided: false,
        corrected_from: null,
      };
      setSelectedReceipt({ tx: statementTx, member: mem, standing: s });
    }
  };

  return (
    <div className="space-y-4">
      {/* Modals */}
      <QuickFeeCollectorModal
        isOpen={collectorOpen}
        onClose={() => setCollectorOpen(false)}
        preselectedMemberId={collectorMemberId}
        onSuccess={onRefresh}
        onError={onError}
      />
      <WaiverModal
        member={waiverMember}
        onClose={() => setWaiverMember(null)}
        onSuccess={onRefresh}
        onError={onError}
      />
      <ShutdownCalendarModal
        isOpen={shutdownOpen}
        onClose={() => setShutdownOpen(false)}
        onSuccess={onRefresh}
        onError={onError}
      />
      <FeeRatesModal
        isOpen={feeRatesOpen}
        onClose={() => setFeeRatesOpen(false)}
        onSuccess={onRefresh}
        onError={onError}
      />
      <EditMemberModal
        member={editMember}
        onClose={() => setEditMember(null)}
        onSuccess={onRefresh}
        onError={onError}
      />
      <FeeReceiptModal
        isOpen={!!selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
        transaction={selectedReceipt?.tx || null}
        member={selectedReceipt?.member}
        standing={selectedReceipt?.standing}
      />

      {/* Top Header Summary */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Users className="h-4 w-4 text-zinc-500" />
            Member Dues & Standing
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Transparent weekly fee accounts. History is derived directly from Sundays covered and cash logged.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setFeeRatesOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm"
          >
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Fee Rates</span>
          </button>

          <button
            onClick={() => setShutdownOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm"
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>Shutdown Weeks (৳0)</span>
          </button>

          <button
            onClick={() => setShowAddMember(true)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Member</span>
          </button>

          <button
            onClick={() => {
              setCollectorMemberId(null);
              setCollectorOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-sm"
          >
            <ArrowDownRight className="h-3.5 w-3.5" />
            <span>Collect Fee</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
          <div className="text-xs text-zinc-500 font-medium">Members in Arrears</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-red-600 dark:text-red-400">
              {formatTaka(totalArrears)}
            </span>
            <span className="text-xs text-zinc-500">{countOverdue} members behind</span>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
          <div className="text-xs text-zinc-500 font-medium">Advance Credit Held</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {formatTaka(totalCredit)}
            </span>
            <span className="text-xs text-zinc-500">In General Pool</span>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
          <div className="text-xs text-zinc-500 font-medium">Weekly Rate</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
              ৳50 / wk
            </span>
            <span className="text-xs text-zinc-500">Sundays only</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          {/* Status Tabs */}
          <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1 text-xs font-medium">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-md transition-all ${
                filter === 'all'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              All ({standing.length})
            </button>
            <button
              onClick={() => setFilter('arrears')}
              className={`px-3 py-1 rounded-md transition-all ${
                filter === 'arrears'
                  ? 'bg-white dark:bg-zinc-900 text-red-600 dark:text-red-400 shadow-sm font-semibold'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              In Arrears ({countOverdue})
            </button>
            <button
              onClick={() => setFilter('credit')}
              className={`px-3 py-1 rounded-md transition-all ${
                filter === 'credit'
                  ? 'bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              Credit Held
            </button>
            <button
              onClick={() => setFilter('settled')}
              className={`px-3 py-1 rounded-md transition-all ${
                filter === 'settled'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              Settled
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute inset-y-0 left-0 my-auto h-4 w-4 text-zinc-400 pl-3 pointer-events-none" />
          <input
            type="text"
            placeholder="Search member name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-9 pr-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:border-zinc-400"
          />
        </div>
      </div>

      {/* Dues Table */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 uppercase tracking-wider text-[10px] font-semibold border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="py-3 px-4">Member</th>
                <th className="py-3 px-4">Billable Weeks</th>
                <th className="py-3 px-4 text-right">Total Owed</th>
                <th className="py-3 px-4 text-right">Credits Paid</th>
                <th className="py-3 px-4 text-right">Balance</th>
                <th className="py-3 px-4">Standing Status</th>
                <th className="py-3 px-4 text-center">Quick Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-400">
                    No members match the current filter.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const m = members.find((x) => x.id === s.who_id);
                  const isBehind = s.balance < 0;
                  const isAhead = s.balance > 0;

                  return (
                    <tr
                      key={s.who_id}
                      className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      {/* Name & Batch */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {s.who_name}
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          {m?.batch ? `Batch ${m.batch}` : 'Member'}
                          {m?.note ? ` • ${m.note}` : ''}
                        </div>
                      </td>

                      {/* Billable Weeks */}
                      <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400 font-mono">
                        {s.weeks_owed} weeks
                      </td>

                      {/* Total Owed */}
                      <td className="py-3 px-4 text-right font-mono text-zinc-600 dark:text-zinc-400">
                        {formatTaka(s.owed)}
                      </td>

                      {/* Total Credits */}
                      <td className="py-3 px-4 text-right font-mono text-zinc-900 dark:text-zinc-100">
                        {formatTaka(s.credits)}
                      </td>

                      {/* Balance */}
                      <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
                        {isBehind && (
                          <span className="text-red-600 dark:text-red-400">
                            {formatTaka(s.balance)}
                          </span>
                        )}
                        {isAhead && (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            +{formatTaka(s.balance)}
                          </span>
                        )}
                        {!isBehind && !isAhead && (
                          <span className="text-zinc-500">৳0 (Settled)</span>
                        )}
                      </td>

                      {/* Status & Weeks overdue */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isBehind && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 dark:bg-red-950/60 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                            {s.weeks_overdue} wks overdue
                            {s.oldest_unpaid_week && ` (since ${s.oldest_unpaid_week})`}
                          </span>
                        )}
                        {isAhead && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                            Credit advance
                          </span>
                        )}
                        {!isBehind && !isAhead && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                            Up to date
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setCollectorMemberId(s.who_id);
                              setCollectorOpen(true);
                            }}
                            className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 shadow-xs"
                          >
                            Pay Fee
                          </button>
                          <button
                            onClick={() => setWaiverMember(m ?? null)}
                            title="Forgive or adjust dues"
                            className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          >
                            <ShieldAlert className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setEditMember(m ?? null)}
                            title="Edit member details & periods"
                            className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Member Modal */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Register New Member
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Dues will start counting from the member's joining date.
            </p>

            <form onSubmit={handleAddMember} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mahir Faysal"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Batch / Dept (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 23"
                    value={newMemberBatch}
                    onChange={(e) => setNewMemberBatch(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Joining Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={newMemberStart}
                    onChange={(e) => setNewMemberStart(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Role Note (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Embedded firmware developer"
                  value={newMemberNote}
                  onChange={(e) => setNewMemberNote(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddMember(false)}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
                >
                  Add Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
