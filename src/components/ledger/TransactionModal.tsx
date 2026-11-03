import React, { useState, useEffect } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowRightLeft,
  RotateCcw,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Calendar,
  Layers,
  Tag,
  User,
  Building,
  ShieldAlert,
  ArrowLeft,
  Clock,
  Trash2,
  Check,
  Receipt,
  FileText,
} from 'lucide-react';
import { api } from '../../services/api';
import { EnvelopeBalance, CostCenter, Member, IncomeSource, EntryKind, LedgerEntryView } from '../../lib/db/types';
import { formatTaka, formatDate } from '../../lib/utils';
import { SettleModal } from '../ui/SettleModal';
import { FeeReceiptModal } from '../dues/FeeReceiptModal';

const DRAFT_KEY = 'mesl_vault_transaction_draft';

interface TransactionDraft {
  kind: 'deposit' | 'expense' | 'transfer' | 'refund' | 'sweep';
  amount: string;
  date: string;
  note: string;
  tag: string;
  costCenterId: string;
  memberId: string;
  selectedEnvelopeId: string;
  targetEnvelopeId: string;
  source: IncomeSource;
  savedAt: string;
}

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: 'deposit' | 'expense' | 'transfer' | 'refund' | 'sweep';
  onTransactionSaved: () => void;
  onError: (err: any) => void;
  entries?: LedgerEntryView[];
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  initialType = 'deposit',
  onTransactionSaved,
  onError,
  entries: propEntries,
}) => {
  type Step = 'input' | 'review' | 'success';
  const [step, setStep] = useState<Step>('input');

  const [kind, setKind] = useState<'deposit' | 'expense' | 'transfer' | 'refund' | 'sweep'>(initialType);
  const [envelopes, setEnvelopes] = useState<EnvelopeBalance[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [recentEntries, setRecentEntries] = useState<LedgerEntryView[]>([]);

  // Form states
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [tag, setTag] = useState('');
  const [costCenterId, setCostCenterId] = useState<string>('');
  const [recordedBy, setRecordedBy] = useState('Treasurer');

  // Deposit specific
  const [source, setSource] = useState<IncomeSource>('admin_grant');
  const [memberId, setMemberId] = useState<string>('');

  // Envelope selection: used as Destination Envelope for Deposit, Paid From for Expense, Source for Transfer/Sweep
  const [selectedEnvelopeId, setSelectedEnvelopeId] = useState<string>('');
  const [targetEnvelopeId, setTargetEnvelopeId] = useState<string>('');

  // Idempotency & In-flight states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preflightErrors, setPreflightErrors] = useState<string[]>([]);
  const [preflightWarning, setPreflightWarning] = useState<string | null>(null);

  // Draft state
  const [hasDraft, setHasDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  // Vault #3 envelope suggestion hint
  const [envelopeAutoSelectedHint, setEnvelopeAutoSelectedHint] = useState<string | null>(null);

  // Success result state
  const [createdResult, setCreatedResult] = useState<{
    id: number;
    kind: string;
    amount: number;
    balance?: number;
    date: string;
    note: string;
    memberName?: string;
    envelopeName?: string;
    recordedTx?: any;
  } | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Reset or initialize on open
  useEffect(() => {
    if (!isOpen) {
      setStep('input');
      setPreflightErrors([]);
      setPreflightWarning(null);
      setIsSubmitting(false);
      setEnvelopeAutoSelectedHint(null);
      return;
    }

    setKind(initialType);

    // Check for saved browser draft in localStorage
    try {
      const rawDraft = localStorage.getItem(DRAFT_KEY);
      if (rawDraft) {
        const parsed: TransactionDraft = JSON.parse(rawDraft);
        if (parsed && (parsed.amount || parsed.note || parsed.costCenterId || parsed.memberId)) {
          setHasDraft(true);
          setDraftSavedAt(parsed.savedAt || 'earlier session');
        }
      }
    } catch {
      // ignore draft parse error
    }

    const loadDependencies = async () => {
      try {
        const [envs, ccs, mems, txs] = await Promise.all([
          api.getEnvelopeBalances(),
          api.getCostCenters(),
          api.getMembers(),
          propEntries ? Promise.resolve(propEntries) : api.getEntriesCurrent().catch(() => []),
        ]);
        setEnvelopes(envs.filter((e) => e.active));
        setCostCenters(ccs.filter((c) => c.status === 'active'));
        setMembers(mems);
        setRecentEntries(txs);

        // Set default envelope
        const nonPool = envs.find((e) => !e.is_pool && e.active);
        const pool = envs.find((e) => e.is_pool);
        if (initialType === 'deposit') {
          if (source === 'weekly_fee' && pool) {
            setSelectedEnvelopeId(String(pool.id));
          } else if (!selectedEnvelopeId) {
            setSelectedEnvelopeId('');
          }
        } else {
          if (nonPool && !selectedEnvelopeId) setSelectedEnvelopeId(String(nonPool.id));
        }
        if (pool && !targetEnvelopeId) setTargetEnvelopeId(String(pool.id));
      } catch (e) {
        console.error('Failed to load transaction modal dependencies:', e);
      }
    };
    loadDependencies();
  }, [isOpen, initialType]);

  // Persist draft to localStorage on form field change
  useEffect(() => {
    if (!isOpen || step !== 'input') return;
    // Don't save if completely empty
    if (!amount && !note && !costCenterId && !memberId) return;

    const draftData: TransactionDraft = {
      kind,
      amount,
      date,
      note,
      tag,
      costCenterId,
      memberId,
      selectedEnvelopeId,
      targetEnvelopeId,
      source,
      savedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
    } catch {
      // storage full or disabled
    }
  }, [isOpen, step, kind, amount, date, note, tag, costCenterId, memberId, selectedEnvelopeId, targetEnvelopeId, source]);

  // Vault #3: Auto-select envelope from cost center kind
  const handleCostCenterChange = (ccId: string) => {
    setCostCenterId(ccId);
    if (!ccId) {
      setEnvelopeAutoSelectedHint(null);
      return;
    }
    const cc = costCenters.find((c) => String(c.id) === ccId);
    if (!cc) return;

    let matchedEnv: EnvelopeBalance | undefined;
    const kindStr = (cc.kind || '').toLowerCase();
    const nameStr = (cc.name || '').toLowerCase();

    if (kindStr === 'competition' || nameStr.includes('comp') || nameStr.includes('hackathon')) {
      matchedEnv = envelopes.find((e) => e.name.toLowerCase().includes('comp'));
    } else if (kindStr === 'workshop' || nameStr.includes('workshop') || nameStr.includes('training')) {
      matchedEnv = envelopes.find((e) => e.name.toLowerCase().includes('workshop'));
    } else if (kindStr === 'project' || nameStr.includes('project')) {
      matchedEnv = envelopes.find((e) => e.name.toLowerCase().includes('project'));
    } else if (kindStr === 'admin' || nameStr.includes('ops') || nameStr.includes('admin')) {
      matchedEnv = envelopes.find((e) => e.name.toLowerCase().includes('ops') || e.name.toLowerCase().includes('admin'));
    }

    if (matchedEnv && (kind === 'expense' || kind === 'sweep' || kind === 'transfer' || kind === 'deposit')) {
      setSelectedEnvelopeId(String(matchedEnv.id));
      setEnvelopeAutoSelectedHint(`Auto-matched envelope "${matchedEnv.name}" to ${cc.kind} cost center.`);
    } else {
      setEnvelopeAutoSelectedHint(null);
    }
  };

  const handleResumeDraft = () => {
    try {
      const rawDraft = localStorage.getItem(DRAFT_KEY);
      if (rawDraft) {
        const d: TransactionDraft = JSON.parse(rawDraft);
        if (d.kind) setKind(d.kind);
        if (d.amount) setAmount(d.amount);
        if (d.date) setDate(d.date);
        if (d.note) setNote(d.note);
        if (d.tag) setTag(d.tag);
        if (d.costCenterId) setCostCenterId(d.costCenterId);
        if (d.memberId) setMemberId(d.memberId);
        if (d.selectedEnvelopeId) setSelectedEnvelopeId(d.selectedEnvelopeId);
        if (d.targetEnvelopeId) setTargetEnvelopeId(d.targetEnvelopeId);
        if (d.source) setSource(d.source);
      }
    } catch {
      // ignore
    }
    setHasDraft(false);
  };

  const handleDiscardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setHasDraft(false);
    setAmount('');
    setNote('');
    setTag('');
    setCostCenterId('');
    setMemberId('');
    setSelectedEnvelopeId('');
    setDate(new Date().toISOString().split('T')[0]);
    setEnvelopeAutoSelectedHint(null);
  };

  // Preflight validation to transition to Review
  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    setPreflightErrors([]);
    setPreflightWarning(null);

    const errors: string[] = [];
    const amt = parseInt(amount, 10);
    if (isNaN(amt) || amt <= 0) {
      errors.push('Transaction amount must be a positive whole taka number greater than 0.');
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (date > todayStr) {
      errors.push(`Date cannot be in the future (${date} > ${todayStr}). All ledger entries must be historical or today.`);
    }

    const pool = envelopes.find((e) => e.is_pool);
    const memId = memberId ? parseInt(memberId, 10) : null;
    const ccId = costCenterId ? parseInt(costCenterId, 10) : null;
    const fromEnvId = parseInt(selectedEnvelopeId, 10);
    const toEnvId = parseInt(targetEnvelopeId, 10);

    if (kind === 'deposit') {
      if (!fromEnvId) {
        errors.push('Destination envelope is required. Please select an envelope name.');
      } else {
        const env = envelopes.find((e) => e.id === fromEnvId);
        if (!env) {
          errors.push('The selected destination envelope does not exist.');
        } else if (!env.active) {
          errors.push(`Selected envelope "${env.name}" is inactive.`);
        } else if (source === 'weekly_fee' && !env.is_pool) {
          errors.push('Weekly fee deposits must go to the Unallocated General pool.');
        }
      }
      if (source === 'weekly_fee' && !memId) {
        errors.push('Weekly fee deposits must be linked to a member. Please select a paying member.');
      }
    } else if (kind === 'expense') {
      const env = envelopes.find((e) => e.id === fromEnvId);
      if (!env) {
        errors.push('Please select a valid source envelope.');
      } else {
        if (!env.active) errors.push(`Selected envelope "${env.name}" is inactive.`);
        if (amt > env.balance) {
          errors.push(
            `Zero-Overdraft Violation: Envelope "${env.name}" currently holds ${formatTaka(env.balance)}. Spending ${formatTaka(amt)} would overdraw by ${formatTaka(amt - env.balance)}.`
          );
        }
      }
    } else if (kind === 'transfer') {
      if (!fromEnvId || !toEnvId) {
        errors.push('Please select both source and destination envelopes.');
      } else if (fromEnvId === toEnvId) {
        errors.push('Source and destination must be different envelopes to transfer funds.');
      } else {
        const fromEnv = envelopes.find((e) => e.id === fromEnvId);
        if (!fromEnv) {
          errors.push('Source envelope not found.');
        } else {
          if (!fromEnv.active) errors.push(`Source envelope "${fromEnv.name}" is inactive.`);
          if (amt > fromEnv.balance) {
            errors.push(
              `Zero-Overdraft Violation: Envelope "${fromEnv.name}" holds ${formatTaka(fromEnv.balance)}. Cannot transfer ${formatTaka(amt)}.`
            );
          }
        }
      }
    } else if (kind === 'refund') {
      if (!memId) {
        errors.push('Please select the member receiving this refund.');
      }
      if (pool && amt > pool.balance) {
        errors.push(`Zero-Overdraft Violation: General Pool has ${formatTaka(pool.balance)}. Cannot refund ${formatTaka(amt)}.`);
      }
    } else if (kind === 'sweep') {
      if (!ccId) {
        errors.push('Please select the cost center / event being swept.');
      }
      const env = envelopes.find((e) => e.id === fromEnvId);
      if (!env) {
        errors.push('Please select the envelope to sweep leftover from.');
      } else if (amt > env.balance) {
        errors.push(`Zero-Overdraft Violation: Envelope "${env.name}" holds ${formatTaka(env.balance)}. Cannot sweep ${formatTaka(amt)}.`);
      }
    }

    if (errors.length > 0) {
      setPreflightErrors(errors);
      return;
    }

    // Soft duplicate detection
    const match = recentEntries.find((tx) => {
      if (tx.occurred_on !== date) return false;
      const txAmt = Math.abs(tx.lines[0]?.amount || 0);
      if (memId && tx.member_id === memId && txAmt === amt) return true;
      if (kind === 'expense' && tx.kind === 'expense' && txAmt === amt && tx.lines.some((l) => l.envelope_id === fromEnvId)) {
        return true;
      }
      return false;
    });

    if (match) {
      setPreflightWarning(
        `Potential duplicate detected: Entry #${match.id} for ${formatTaka(amt)} was already recorded on ${formatDate(match.occurred_on)}. Please verify this is a distinct payment and not a repeated double-entry.`
      );
    }

    setStep('review');
  };

  // Explicit confirmation submit (second click)
  const handleConfirmSubmit = async () => {
    if (isSubmitting) return; // Client-side idempotency lock
    setIsSubmitting(true);

    try {
      const amt = parseInt(amount, 10);
      const ccId = costCenterId ? parseInt(costCenterId, 10) : null;
      const memId = memberId ? parseInt(memberId, 10) : null;
      const pool = envelopes.find((e) => e.is_pool) || envelopes[0];
      const fromEnvId = parseInt(selectedEnvelopeId, 10);
      const toEnvId = parseInt(targetEnvelopeId, 10);

      let recordedTx: any = null;

      if (kind === 'deposit') {
        const destEnvId = parseInt(selectedEnvelopeId, 10);
        recordedTx = await api.recordTransaction({
          kind: 'deposit',
          occurred_on: date,
          recorded_by: recordedBy,
          note: note.trim() || (source === 'weekly_fee' ? 'Weekly member fee' : (selectedEnvObj ? `Deposit into ${selectedEnvObj.name}` : 'Deposit into pool')),
          tag: tag.trim() || (source === 'weekly_fee' ? 'fees' : null),
          cost_center_id: ccId,
          source,
          member_id: source === 'weekly_fee' ? memId : null,
          lines: [{ envelope_id: destEnvId, amount: amt }],
        });
      } else if (kind === 'expense') {
        recordedTx = await api.recordTransaction({
          kind: 'expense',
          occurred_on: date,
          recorded_by: recordedBy,
          note: note.trim() || 'General Expense',
          tag: tag.trim() || null,
          cost_center_id: ccId,
          source: null,
          member_id: null,
          lines: [{ envelope_id: fromEnvId, amount: -amt }],
        });
      } else if (kind === 'transfer') {
        recordedTx = await api.recordTransaction({
          kind: 'transfer',
          occurred_on: date,
          recorded_by: recordedBy,
          note: note.trim() || 'Envelope transfer',
          tag: tag.trim() || null,
          cost_center_id: ccId,
          source: null,
          member_id: null,
          lines: [
            { envelope_id: fromEnvId, amount: -amt },
            { envelope_id: toEnvId, amount: amt },
          ],
        });
      } else if (kind === 'refund') {
        recordedTx = await api.recordRefund({
          amount: amt,
          occurred_on: date,
          member_id: memId!,
          cost_center_id: ccId,
          tag: tag.trim() || 'fees',
          note: note.trim() || `Fee refund to member #${memId}`,
          recorded_by: recordedBy,
        });
      } else if (kind === 'sweep') {
        recordedTx = await api.sweepLeftover({
          costCenterId: ccId!,
          fromEnvelopeId: fromEnvId,
          by: recordedBy,
          date,
          note: note.trim() || 'Sweep leftover to pool',
        });
      }

      // Clear draft on successful 201 write
      localStorage.removeItem(DRAFT_KEY);

      const memObj = members.find((m) => m.id === memId);
      const envObj = envelopes.find((e) => e.id === (kind === 'deposit' ? parseInt(selectedEnvelopeId, 10) : fromEnvId));

      setCreatedResult({
        id: recordedTx.id,
        kind,
        amount: amt,
        balance: recordedTx.serverResult?.balance ?? recordedTx.serverResult?.pool_balance,
        date,
        note: note.trim() || recordedTx.note || '',
        memberName: memObj?.name,
        envelopeName: envObj?.name || pool?.name,
        recordedTx,
      });

      onTransactionSaved();
      setStep('success');
    } catch (err: any) {
      onError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return; // Prevent dismiss in-flight
    setStep('input');
    setCreatedResult(null);
    setPreflightErrors([]);
    setPreflightWarning(null);
    onClose();
  };

  const handleResetForAnother = () => {
    setStep('input');
    setCreatedResult(null);
    setAmount('');
    setNote('');
    setTag('');
    setSelectedEnvelopeId('');
    setCostCenterId('');
    setMemberId('');
    setPreflightErrors([]);
    setPreflightWarning(null);
  };

  if (!isOpen) return null;

  // Selected envelope helpers for review
  const selectedEnvObj = envelopes.find((e) => String(e.id) === selectedEnvelopeId);
  const targetEnvObj = envelopes.find((e) => String(e.id) === targetEnvelopeId);
  const poolEnv = envelopes.find((e) => e.is_pool) || envelopes[0];
  const selectedMember = members.find((m) => String(m.id) === memberId);
  const selectedCC = costCenters.find((c) => String(c.id) === costCenterId);
  const parsedAmt = parseInt(amount, 10) || 0;

  return (
    <>
      <SettleModal
        open={isOpen}
        onClose={handleClose}
        size={step === 'review' ? 'md' : 'lg'}
        title={
          step === 'success'
            ? 'Transaction Recorded'
            : step === 'review'
            ? 'Review & Confirm Ledger Entry'
            : 'Record Money Movement'
        }
      >
        {/* STEP 1: FORM INPUT */}
        {step === 'input' && (
          <div>
            {/* Draft Notification Banner */}
            {hasDraft && (
              <div className="mb-3 flex items-center justify-between rounded-lg bg-indigo-50/80 dark:bg-indigo-950/40 p-2.5 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-900 dark:text-indigo-200">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-indigo-500 shrink-0" />
                  <span>Unfinished draft from {draftSavedAt} found. Resume where you left off?</span>
                </div>
                <div className="flex items-center gap-1.5 ml-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleResumeDraft}
                    className="rounded bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 font-medium transition-colors"
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    onClick={handleDiscardDraft}
                    className="rounded bg-transparent hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 px-2 py-1 transition-colors"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}

            {/* Mode / Kind Switcher */}
            <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => {
                  setKind('deposit');
                  if (source === 'weekly_fee') {
                    const pool = envelopes.find((e) => e.is_pool);
                    if (pool) setSelectedEnvelopeId(String(pool.id));
                  }
                }}
                className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1 transition-all ${
                  kind === 'deposit'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <ArrowDownRight className="h-3.5 w-3.5 text-emerald-600" />
                <span>Deposit</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setKind('expense');
                  if (!selectedEnvelopeId) {
                    const nonPool = envelopes.find((e) => !e.is_pool && e.active) || envelopes[0];
                    if (nonPool) setSelectedEnvelopeId(String(nonPool.id));
                  }
                }}
                className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1 transition-all ${
                  kind === 'expense'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <ArrowUpRight className="h-3.5 w-3.5 text-rose-500" />
                <span>Expense</span>
              </button>
              <button
                type="button"
                onClick={() => setKind('transfer')}
                className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1 transition-all ${
                  kind === 'transfer'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <ArrowRightLeft className="h-3.5 w-3.5 text-blue-500" />
                <span>Transfer</span>
              </button>
              <button
                type="button"
                onClick={() => setKind('refund')}
                className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1 transition-all ${
                  kind === 'refund'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
                <span>Refund</span>
              </button>
              <button
                type="button"
                onClick={() => setKind('sweep')}
                className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1 transition-all ${
                  kind === 'sweep'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                <span>Sweep</span>
              </button>
            </div>

            {/* Preflight Errors Banner */}
            {preflightErrors.length > 0 && (
              <div className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 p-3 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300">
                <div className="flex items-center gap-1.5 font-semibold text-rose-900 dark:text-rose-200 mb-1">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                  <span>Validation Refusal</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {preflightErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <form onSubmit={handleProceedToReview} className="mt-4 space-y-4">
              {/* Amount & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Amount (whole ৳) <span className="text-rose-500">*</span>
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

                  {/* Quick-select template chips */}
                  <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] text-zinc-400 mr-0.5">Quick:</span>
                    {[50, 100, 250, 500, 1000, 5000].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setAmount(String(val))}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                          amount === String(val)
                            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900'
                            : 'bg-zinc-50 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100'
                        }`}
                      >
                        ৳{val}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Occurred Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    max={new Date().toISOString().split('T')[0]}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
                  />
                  <div className="mt-1 text-[10px] text-zinc-400">
                    Must be on or before today ({formatDate(new Date().toISOString().split('T')[0])}).
                  </div>
                </div>
              </div>

              {/* MODE SPECIFIC FIELDS */}
              {/* 1. Deposit */}
              {kind === 'deposit' && (
                <div className="space-y-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 p-3 border border-zinc-100 dark:border-zinc-800">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Income Source <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={source}
                        onChange={(e) => {
                          const newSource = e.target.value as IncomeSource;
                          setSource(newSource);
                          if (newSource === 'weekly_fee') {
                            const pool = envelopes.find((env) => env.is_pool);
                            if (pool) setSelectedEnvelopeId(String(pool.id));
                          }
                        }}
                        className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                      >
                        <option value="admin_grant">Admin / University Grant</option>
                        <option value="sponsorship">Corporate Sponsorship</option>
                        <option value="registration">Event / Workshop Registration</option>
                        <option value="donation">Alumni / Patron Donation</option>
                        <option value="other">Other Income</option>
                        <option value="weekly_fee">Weekly Member Fee</option>
                      </select>
                    </div>

                    {source === 'weekly_fee' ? (
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          Paying Member <span className="text-rose-500">*</span>
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
                    ) : null}

                    <div className={source === 'weekly_fee' ? 'col-span-2' : ''}>
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          Destination Envelope (by Name) <span className="text-rose-500">*</span>
                        </label>
                        {selectedEnvObj && (
                          <span className="text-[11px] font-mono text-zinc-500">
                            Balance: <strong>{formatTaka(selectedEnvObj.balance)}</strong>
                          </span>
                        )}
                      </div>
                      <select
                        required
                        value={selectedEnvelopeId}
                        onChange={(e) => setSelectedEnvelopeId(e.target.value)}
                        disabled={source === 'weekly_fee'}
                        className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none disabled:opacity-75 disabled:cursor-not-allowed"
                      >
                        <option value="">Select Envelope Name...</option>
                        {envelopes.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name} {e.is_pool ? '(General Pool)' : ''} — {formatTaka(e.balance)}
                          </option>
                        ))}
                      </select>
                      {source === 'weekly_fee' ? (
                        <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                          Weekly member fees are required by constitution to land in the Unallocated General pool.
                        </div>
                      ) : envelopeAutoSelectedHint ? (
                        <div className="mt-1 text-[11px] text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          <span>{envelopeAutoSelectedHint}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

              {/* 2. Expense */}
              {kind === 'expense' && (
                <div className="space-y-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 p-3 border border-zinc-100 dark:border-zinc-800">
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Paid From Envelope <span className="text-rose-500">*</span>
                      </label>
                      {selectedEnvObj && (
                        <span className="text-[11px] font-mono text-zinc-500">
                          Available: <strong>{formatTaka(selectedEnvObj.balance)}</strong>
                        </span>
                      )}
                    </div>
                    <select
                      value={selectedEnvelopeId}
                      onChange={(e) => setSelectedEnvelopeId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                    >
                      {envelopes.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} {e.is_pool ? '(General Pool)' : ''} — {formatTaka(e.balance)}
                        </option>
                      ))}
                    </select>
                    {envelopeAutoSelectedHint && (
                      <div className="mt-1 text-[11px] text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        <span>{envelopeAutoSelectedHint}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 3. Transfer */}
              {kind === 'transfer' && (
                <div className="space-y-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 p-3 border border-zinc-100 dark:border-zinc-800">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          Source (Leaves) <span className="text-rose-500">*</span>
                        </label>
                        {selectedEnvObj && (
                          <span className="text-[10px] font-mono text-zinc-500">
                            Bal: {formatTaka(selectedEnvObj.balance)}
                          </span>
                        )}
                      </div>
                      <select
                        value={selectedEnvelopeId}
                        onChange={(e) => setSelectedEnvelopeId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                      >
                        {envelopes.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name} ({formatTaka(e.balance)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          Destination (Enters) <span className="text-rose-500">*</span>
                        </label>
                        {targetEnvObj && (
                          <span className="text-[10px] font-mono text-zinc-500">
                            Bal: {formatTaka(targetEnvObj.balance)}
                          </span>
                        )}
                      </div>
                      <select
                        value={targetEnvelopeId}
                        onChange={(e) => setTargetEnvelopeId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                      >
                        {envelopes.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name} ({formatTaka(e.balance)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. Refund */}
              {kind === 'refund' && (
                <div className="space-y-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 p-3 border border-zinc-100 dark:border-zinc-800">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Receiving Member <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={memberId}
                      onChange={(e) => setMemberId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                    >
                      <option value="">Select Member to Refund...</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.batch ? `Batch ${m.batch}` : 'Member'})
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      Refunds are disbursed directly from the <strong>General Pool</strong> ({formatTaka(poolEnv?.balance ?? 0)} available).
                    </div>
                  </div>
                </div>
              )}

              {/* 5. Sweep */}
              {kind === 'sweep' && (
                <div className="space-y-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 p-3 border border-zinc-100 dark:border-zinc-800">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Event / Project to Sweep <span className="text-rose-500">*</span>
                      </label>
                      <select
                        required
                        value={costCenterId}
                        onChange={(e) => handleCostCenterChange(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                      >
                        <option value="">Select Completed Event...</option>
                        {costCenters.map((cc) => (
                          <option key={cc.id} value={cc.id}>
                            {cc.name} ({cc.kind})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          Sweep From Envelope <span className="text-rose-500">*</span>
                        </label>
                        {selectedEnvObj && (
                          <span className="text-[10px] font-mono text-zinc-500">
                            Bal: {formatTaka(selectedEnvObj.balance)}
                          </span>
                        )}
                      </div>
                      <select
                        value={selectedEnvelopeId}
                        onChange={(e) => setSelectedEnvelopeId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                      >
                        {envelopes.filter((e) => !e.is_pool).map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name} ({formatTaka(e.balance)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Remaining funds will be swept back into <strong>General Pool</strong>.
                  </div>
                </div>
              )}

              {/* Note / Description */}
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Description Note <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    kind === 'deposit'
                      ? 'e.g. Monthly university club grant for robotics lab'
                      : kind === 'expense'
                      ? 'e.g. Purchased breadboards and jumper wires from Patuatuly'
                      : kind === 'transfer'
                      ? 'e.g. Allocation rebalance for competition kit components'
                      : kind === 'refund'
                      ? 'e.g. Returning excess fee advance paid by member'
                      : 'e.g. Wrap-up sweep: leftover event budget back to pool'
                  }
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:border-zinc-400"
                />
              </div>

              {/* Metadata Context: Cost Center & Tag */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {kind !== 'sweep' && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Link Event / Project (Optional)
                    </label>
                    <select
                      value={costCenterId}
                      onChange={(e) => handleCostCenterChange(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                    >
                      <option value="">None / General Operations</option>
                      {costCenters.map((cc) => (
                        <option key={cc.id} value={cc.id}>
                          {cc.name} ({cc.kind})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Audit Tag (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. hardware, refreshments, printing"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:border-zinc-400"
                  />
                  {/* Tag quick chips */}
                  <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                    {['#fees', '#hardware', '#refreshments', '#workshop', '#travel', '#stationery'].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTag(t.replace('#', ''))}
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="mt-6 flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-5 py-2 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-sm cursor-pointer"
                >
                  <span>Review Entry</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 2: REVIEW & IMPACT CONFIRMATION SCREEN */}
        {step === 'review' && (
          <div className="space-y-4">
            {/* Warning Box on Potential Duplicate */}
            {preflightWarning && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{preflightWarning}</div>
              </div>
            )}

            {/* Permanent Write Warning */}
            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-3 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-2.5">
              <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="text-zinc-900 dark:text-zinc-100">Permanent Ledger Write: </strong>
                This entry cannot be deleted or modified in place. Once confirmed, it is permanent. Future corrections will require an atomic mirror reversal in the public audit trail.
              </div>
            </div>

            {/* Financial Overview Card */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3 bg-white dark:bg-zinc-900">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="capitalize text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    {kind}
                  </span>
                  {kind === 'deposit' && (
                    <span className="rounded bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                      {source.replace('_', ' ')}
                    </span>
                  )}
                </div>
                <div className="font-mono text-xl font-bold text-zinc-900 dark:text-zinc-100">
                  {formatTaka(parsedAmt)}
                </div>
              </div>

              {/* Key Details Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-zinc-400 block text-[11px]">Occurred Date</span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {formatDate(date)}
                  </span>
                </div>

                <div>
                  <span className="text-zinc-400 block text-[11px]">Recorded By</span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">{recordedBy}</span>
                </div>

                {selectedMember && (
                  <div className="col-span-2">
                    <span className="text-zinc-400 block text-[11px]">Linked Member</span>
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                      {selectedMember.name} ({selectedMember.batch ? `Batch ${selectedMember.batch}` : 'Member'})
                    </span>
                  </div>
                )}

                {selectedCC && (
                  <div className="col-span-2">
                    <span className="text-zinc-400 block text-[11px]">Cost Center / Event</span>
                    <span className="font-medium text-indigo-700 dark:text-indigo-400">
                      {selectedCC.name} ({selectedCC.kind})
                    </span>
                  </div>
                )}

                <div className="col-span-2">
                  <span className="text-zinc-400 block text-[11px]">Description Note</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {note || '(No note)'}
                  </span>
                </div>

                {tag && (
                  <div>
                    <span className="text-zinc-400 block text-[11px]">Tag</span>
                    <span className="font-mono text-zinc-600 dark:text-zinc-400">#{tag}</span>
                  </div>
                )}
              </div>

              {/* Envelope Projected Balance Impact */}
              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1.5">
                  Projected Envelope Balance Effect
                </span>
                <div className="space-y-1.5 text-xs font-mono">
                  {kind === 'deposit' && selectedEnvObj && (
                    <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/40 p-2 rounded">
                      <span className="text-zinc-600 dark:text-zinc-300">{selectedEnvObj.name}</span>
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {formatTaka(selectedEnvObj.balance)} → {formatTaka(selectedEnvObj.balance + parsedAmt)} (+{formatTaka(parsedAmt)})
                      </span>
                    </div>
                  )}

                  {kind === 'expense' && selectedEnvObj && (
                    <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/40 p-2 rounded">
                      <span className="text-zinc-600 dark:text-zinc-300">{selectedEnvObj.name}</span>
                      <span className="text-rose-600 dark:text-rose-400">
                        {formatTaka(selectedEnvObj.balance)} → {formatTaka(selectedEnvObj.balance - parsedAmt)} (-{formatTaka(parsedAmt)})
                      </span>
                    </div>
                  )}

                  {kind === 'transfer' && selectedEnvObj && targetEnvObj && (
                    <>
                      <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/40 p-2 rounded">
                        <span className="text-zinc-600 dark:text-zinc-300">From: {selectedEnvObj.name}</span>
                        <span className="text-rose-600 dark:text-rose-400">
                          {formatTaka(selectedEnvObj.balance)} → {formatTaka(selectedEnvObj.balance - parsedAmt)} (-{formatTaka(parsedAmt)})
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/40 p-2 rounded">
                        <span className="text-zinc-600 dark:text-zinc-300">To: {targetEnvObj.name}</span>
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {formatTaka(targetEnvObj.balance)} → {formatTaka(targetEnvObj.balance + parsedAmt)} (+{formatTaka(parsedAmt)})
                        </span>
                      </div>
                    </>
                  )}

                  {kind === 'refund' && (
                    <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/40 p-2 rounded">
                      <span className="text-zinc-600 dark:text-zinc-300">General Pool (Refund Disbursal)</span>
                      <span className="text-rose-600 dark:text-rose-400">
                        {formatTaka(poolEnv?.balance ?? 0)} → {formatTaka((poolEnv?.balance ?? 0) - parsedAmt)} (-{formatTaka(parsedAmt)})
                      </span>
                    </div>
                  )}

                  {kind === 'sweep' && selectedEnvObj && (
                    <>
                      <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/40 p-2 rounded">
                        <span className="text-zinc-600 dark:text-zinc-300">Swept From: {selectedEnvObj.name}</span>
                        <span className="text-rose-600 dark:text-rose-400">
                          {formatTaka(selectedEnvObj.balance)} → {formatTaka(selectedEnvObj.balance - parsedAmt)} (-{formatTaka(parsedAmt)})
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/40 p-2 rounded">
                        <span className="text-zinc-600 dark:text-zinc-300">Swept Into: General Pool</span>
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {formatTaka(poolEnv?.balance ?? 0)} → {formatTaka((poolEnv?.balance ?? 0) + parsedAmt)} (+{formatTaka(parsedAmt)})
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons: Edit Details vs Confirm */}
            <div className="mt-6 flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setStep('input')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Edit Details</span>
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmSubmit}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 text-xs font-medium shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Writing to Immutable Ledger...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirm & Record to Ledger</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SERVER 201 CONFIRMED SUCCESS */}
        {step === 'success' && createdResult && (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center justify-center text-center p-4">
              <div className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 p-3 text-emerald-600 dark:text-emerald-400 mb-3">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Transaction Confirmed & Immutable
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
                Server returned 201 Created and safely appended the entry to the audit trail.
              </p>
            </div>

            {/* Created Entry Summary Card */}
            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/40 p-3 border border-zinc-100 dark:border-zinc-800 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Ledger Entry ID</span>
                <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                  #{createdResult.id}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Amount & Type</span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatTaka(createdResult.amount)} ({createdResult.kind})
                </span>
              </div>
              {createdResult.balance !== undefined && (
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Confirmed Envelope Balance</span>
                  <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatTaka(createdResult.balance)}
                  </span>
                </div>
              )}
              {createdResult.memberName && (
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Member</span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {createdResult.memberName}
                  </span>
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              {(createdResult.kind === 'deposit' || createdResult.kind === 'refund') && createdResult.memberName && (
                <button
                  type="button"
                  onClick={() => setShowReceiptModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 cursor-pointer"
                >
                  <Receipt className="h-3.5 w-3.5" />
                  <span>View Member Receipt</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleResetForAnother}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Record Another
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-xs font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 cursor-pointer shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </SettleModal>

      {/* Member Fee Receipt Modal */}
      {showReceiptModal && createdResult && createdResult.recordedTx && (
        <FeeReceiptModal
          isOpen={showReceiptModal}
          onClose={() => setShowReceiptModal(false)}
          transaction={createdResult.recordedTx}
          member={members.find((m) => m.name === createdResult.memberName)}
        />
      )}
    </>
  );
};
