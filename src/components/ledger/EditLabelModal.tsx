import React, { useState, useEffect } from 'react';
import { Edit3, Clock } from 'lucide-react';
import { LedgerEntryView, LedgerLabelEdit, CostCenter } from '../../lib/db/types';
import { api } from '../../services/api';
import { formatDateTime } from '../../lib/utils';
import { SettleModal } from '../ui/SettleModal';

interface EditLabelModalProps {
  transaction: LedgerEntryView | null;
  onClose: () => void;
  onSuccess: () => void;
  onError: (err: any) => void;
}

export const EditLabelModal: React.FC<EditLabelModalProps> = ({
  transaction,
  onClose,
  onSuccess,
  onError,
}) => {
  if (!transaction) return null;

  const [note, setNote] = useState(transaction.note);
  const [tag, setTag] = useState(transaction.tag ?? '');
  const [date, setDate] = useState(transaction.occurred_on);
  const [costCenterId, setCostCenterId] = useState<string>(transaction.cost_center_id ? String(transaction.cost_center_id) : '');
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [pastEdits, setPastEdits] = useState<LedgerLabelEdit[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [ccs, edits] = await Promise.all([
          api.getCostCenters(),
          api.getLabelEdits(transaction.id),
        ]);
        setCostCenters(ccs);
        setPastEdits(edits);
      } catch (e) {
        console.error(e);
      }
    };
    loadData();
  }, [transaction.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.editTransactionLabel({
        transactionId: transaction.id,
        by: 'Treasurer',
        note: note.trim(),
        tag: tag.trim() || null,
        occurred_on: date,
        cost_center_id: costCenterId ? parseInt(costCenterId, 10) : null,
      });
      onSuccess();
      onClose();
    } catch (err) {
      onError(err);
    }
  };

  return (
    <SettleModal
      open={!!transaction}
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-2">
          <Edit3 className="h-4 w-4 text-zinc-500" />
          <span>Edit Labels on Entry #{transaction.id}</span>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Description Note
          </label>
          <input
            type="text"
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Occurred Date
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Tag / Sub-label
            </label>
            <input
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="e.g. tools, travel"
              className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Attached Event / Project
          </label>
          <select
            value={costCenterId}
            onChange={(e) => setCostCenterId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
          >
            <option value="">None (General Lab)</option>
            {costCenters.map((cc) => (
              <option key={cc.id} value={cc.id}>
                {cc.name} ({cc.kind})
              </option>
            ))}
          </select>
        </div>

        {/* Past Edits Audit Log */}
        {pastEdits.length > 0 && (
          <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Previous Edits History
            </div>
            <div className="max-h-28 overflow-y-auto space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              {pastEdits.map((edit) => (
                <div key={edit.id} className="rounded bg-zinc-50 dark:bg-zinc-800/40 p-2 text-[11px]">
                  <span className="font-semibold">{edit.field}: </span>
                  <span className="line-through text-zinc-400">{edit.old_value ?? '(empty)'}</span>
                  <span className="mx-1 text-zinc-400">→</span>
                  <span className="text-zinc-900 dark:text-zinc-100">{edit.new_value ?? '(empty)'}</span>
                  <div className="text-[10px] text-zinc-400 mt-0.5">
                    by {edit.edited_by} at {formatDateTime(edit.edited_at)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-sm cursor-pointer"
          >
            Save Changes
          </button>
        </div>
      </form>
    </SettleModal>
  );
};
