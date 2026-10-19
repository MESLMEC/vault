import React, { useState, useEffect } from 'react';
import { X, Calendar, AlertTriangle, Plus } from 'lucide-react';
import { ShutdownEvent } from '../../lib/db/types';
import { api } from '../../services/api';
import { sundayOnOrBefore, formatDate } from '../../lib/utils';

interface ShutdownCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onError: (err: any) => void;
}

export const ShutdownCalendarModal: React.FC<ShutdownCalendarModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onError,
}) => {
  const [events, setEvents] = useState<ShutdownEvent[]>([]);
  const [fromWeek, setFromWeek] = useState(sundayOnOrBefore(new Date().toISOString().split('T')[0]));
  const [toWeek, setToWeek] = useState(sundayOnOrBefore(new Date().toISOString().split('T')[0]));
  const [isShutdown, setIsShutdown] = useState(true);
  const [reason, setReason] = useState('');
  const [recordedBy, setRecordedBy] = useState('Treasurer');

  const loadEvents = async () => {
    try {
      const data = await api.getShutdownEvents();
      setEvents(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isOpen) loadEvents();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.setShutdown({
        fromWeek,
        toWeek,
        isShutdown,
        recordedBy,
        reason: reason.trim(),
      });
      setReason('');
      await loadEvents();
      onSuccess();
    } catch (err) {
      onError(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-zinc-500" />
            <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100">
              Lab Shutdown & Holiday Weeks (৳0 Weeks)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 text-xs text-zinc-500">
          Weeks when the electronics lab is closed cost ৳0 for all members. Member standing calculations automatically skip these weeks.
        </p>

        {/* Form to mark shutdown week */}
        <form onSubmit={handleSubmit} className="mt-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 p-4 border border-zinc-100 dark:border-zinc-800 space-y-3">
          <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            Schedule Lab Closure
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                From Week (Sunday)
              </label>
              <input
                type="date"
                required
                value={fromWeek}
                onChange={(e) => setFromWeek(e.target.value)}
                className="mt-1 w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                To Week (Sunday)
              </label>
              <input
                type="date"
                required
                value={toWeek}
                onChange={(e) => setToWeek(e.target.value)}
                className="mt-1 w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
              Reason / Academic Note
            </label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Midterm Exams, Eid Vacation, Summer Shutdown"
              className="mt-1 w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
            >
              <Plus className="h-3 w-3" />
              <span>Mark Shutdown</span>
            </button>
          </div>
        </form>

        {/* List of currently recorded shutdown weeks */}
        <div className="mt-4">
          <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
            Recorded Shutdown Weeks ({events.length})
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1.5 text-xs">
            {events.length === 0 ? (
              <div className="text-zinc-400 py-3 text-center italic">No shutdown weeks recorded.</div>
            ) : (
              events.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between rounded bg-zinc-50 dark:bg-zinc-800/50 p-2.5 border border-zinc-100 dark:border-zinc-800"
                >
                  <div>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      Week of {formatDate(ev.week_start)}
                    </span>
                    <div className="text-[11px] text-zinc-500">{ev.reason || 'Lab closure'}</div>
                  </div>
                  <span className="rounded bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-[10px] font-mono text-amber-700 dark:text-amber-400">
                    ৳0 Cost
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
