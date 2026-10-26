import React, { useState, useEffect } from 'react';
import { X, UserCheck, Calendar, Clock, Plus, ShieldAlert, History, Edit3 } from 'lucide-react';
import { api } from '../../services/api';
import { Member, MembershipPeriod, MemberAdjustment } from '../../lib/db/types';
import { formatTaka } from '../../lib/utils';

interface EditMemberModalProps {
  member: Member | null;
  onClose: () => void;
  onSuccess: () => void;
  onError: (err: any) => void;
}

export const EditMemberModal: React.FC<EditMemberModalProps> = ({
  member,
  onClose,
  onSuccess,
  onError,
}) => {
  const [name, setName] = useState('');
  const [batch, setBatch] = useState('');
  const [note, setNote] = useState('');
  const [periods, setPeriods] = useState<MembershipPeriod[]>([]);
  const [adjustments, setAdjustments] = useState<MemberAdjustment[]>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'periods' | 'adjustments'>('details');

  // New period state
  const [newPeriodDate, setNewPeriodDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const loadMemberData = async (memId: number) => {
    try {
      const [pData, aData] = await Promise.all([
        api.getMemberPeriods(memId),
        api.getMemberAdjustments(memId),
      ]);
      setPeriods(pData);
      setAdjustments(aData);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (member) {
      setName(member.name);
      setBatch(member.batch || '');
      setNote(member.note || '');
      loadMemberData(member.id);
      setActiveTab('details');
    }
  }, [member]);

  if (!member) return null;

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.editMember(member.id, {
        name: name.trim(),
        batch: batch.trim() || null,
        note: note.trim(),
      });
      onSuccess();
      onClose();
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEndPeriod = async () => {
    if (confirm(`End membership period for ${member.name} as of ${endDate}? Dues will freeze on this date.`)) {
      setLoading(true);
      try {
        await api.endMembership(member.id, endDate);
        await loadMemberData(member.id);
        onSuccess();
      } catch (err) {
        onError(err);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleStartPeriod = async () => {
    setLoading(true);
    try {
      await api.startMembershipPeriod(member.id, newPeriodDate);
      await loadMemberData(member.id);
      onSuccess();
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  };

  const hasActivePeriod = periods.some((p) => p.end_date === null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-zinc-900 dark:text-zinc-100" />
            <div>
              <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100">
                {member.name}
              </h3>
              <div className="text-[11px] text-zinc-500">Member #{member.id} • {hasActivePeriod ? 'Active Member' : 'Alumni / Inactive'}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`px-3 py-2 font-medium border-b-2 transition-colors ${
              activeTab === 'details'
                ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Profile Details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('periods')}
            className={`px-3 py-2 font-medium border-b-2 transition-colors ${
              activeTab === 'periods'
                ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Membership Periods ({periods.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('adjustments')}
            className={`px-3 py-2 font-medium border-b-2 transition-colors ${
              activeTab === 'adjustments'
                ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Adjustments ({adjustments.length})
          </button>
        </div>

        {/* TAB 1: Profile Details */}
        {activeTab === 'details' && (
          <form onSubmit={handleSaveDetails} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Batch / Department (optional)
              </label>
              <input
                type="text"
                placeholder="e.g. 2021-ECE"
                value={batch}
                onChange={(e) => setBatch(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Note / Notes
              </label>
              <textarea
                rows={2}
                placeholder="Special role or circumstances"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Update Member Details'}
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: Membership Periods */}
        {activeTab === 'periods' && (
          <div className="space-y-4">
            <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
              {periods.length === 0 ? (
                <div className="p-4 text-center text-zinc-400 italic">No periods recorded.</div>
              ) : (
                periods.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-white dark:bg-zinc-900/60">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-zinc-400" />
                      <span className="font-mono text-zinc-700 dark:text-zinc-300">
                        {p.start_date} → {p.end_date || 'Present'}
                      </span>
                    </div>
                    {p.end_date === null ? (
                      <span className="rounded bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-200">
                        Active
                      </span>
                    ) : (
                      <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                        Concluded
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>

            {hasActivePeriod ? (
              <div className="rounded-lg bg-zinc-50 dark:bg-zinc-950 p-3.5 border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  End Active Membership
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                  />
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleEndPeriod}
                    className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100"
                  >
                    End Membership
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-zinc-50 dark:bg-zinc-950 p-3.5 border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  Re-activate / Start New Membership Period
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={newPeriodDate}
                    onChange={(e) => setNewPeriodDate(e.target.value)}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                  />
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleStartPeriod}
                    className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900"
                  >
                    Start Period
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Adjustments History */}
        {activeTab === 'adjustments' && (
          <div className="space-y-3">
            <div className="max-h-60 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
              {adjustments.length === 0 ? (
                <div className="p-4 text-center text-zinc-400 italic">No adjustments recorded for this member.</div>
              ) : (
                adjustments.map((a) => (
                  <div key={a.id} className="p-3 bg-white dark:bg-zinc-900/60 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-medium capitalize">
                        {a.kind.replace('_', ' ')}
                      </span>
                      <span
                        className={`font-mono font-bold ${
                          a.amount < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {a.amount > 0 ? `+${formatTaka(a.amount)}` : formatTaka(a.amount)}
                      </span>
                    </div>
                    <div className="text-zinc-600 dark:text-zinc-400 text-[11px]">{a.note}</div>
                    <div className="text-[10px] text-zinc-400">
                      {a.occurred_on} • Recorded by {a.recorded_by}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
