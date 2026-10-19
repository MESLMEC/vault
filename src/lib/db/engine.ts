import {
  Tenure,
  Envelope,
  CostCenter,
  Member,
  MembershipPeriod,
  FeeRate,
  ShutdownEvent,
  MemberAdjustment,
  LedgerTransaction,
  LedgerLine,
  LedgerLabelEdit,
  AllocationSession,
  Asset,
  AssetEvent,
  AssetLabelEdit,
  TenureMemberSnapshot,
  TenureAssetSnapshot,
  TenureHoldingSnapshot,
  Reconciliation,
  ReconciliationEnvelope,
  EnvelopeBalance,
  LedgerEntryView,
  MemberStanding,
  CostCenterSummary,
  AssetState,
  AssetHolding,
  ReconciliationStatus,
  DifferenceSuspect,
  AllocationSuggestionRow,
  AllocationContext,
  IncomeSource,
  EntryKind,
  AdjustmentKind,
  AssetEventKind,
  AcquireSource,
} from './types';
import { sha256 } from './crypto';
import { isSunday, sundayOnOrBefore, sundayOnOrAfter, toLocalDateStr } from '../utils';

// =====================================================================================
// STORAGE SCHEMA INTERFACE
// =====================================================================================

export interface DatabaseState {
  tenures: Tenure[];
  envelopes: Envelope[];
  cost_centers: CostCenter[];
  members: Member[];
  membership_periods: MembershipPeriod[];
  fee_rates: FeeRate[];
  shutdown_events: ShutdownEvent[];
  member_adjustments: MemberAdjustment[];
  ledger_transactions: LedgerTransaction[];
  ledger_lines: LedgerLine[];
  ledger_label_edits: LedgerLabelEdit[];
  allocation_sessions: AllocationSession[];
  assets: Asset[];
  asset_events: AssetEvent[];
  asset_label_edits: AssetLabelEdit[];
  tenure_member_snapshots: TenureMemberSnapshot[];
  tenure_asset_snapshots: TenureAssetSnapshot[];
  tenure_holding_snapshots: TenureHoldingSnapshot[];
  reconciliations: Reconciliation[];
  reconciliation_envelopes: ReconciliationEnvelope[];
}

const STORAGE_KEY = 'mesl_lab_finance_v1';

// Custom Human Error for Refusals
export class RefusalError extends Error {
  public reason: string;
  public remediation?: string;
  constructor(reason: string, remediation?: string) {
    super(reason);
    this.name = 'RefusalError';
    this.reason = reason;
    this.remediation = remediation;
  }
}

export class FinanceEngine {
  private state: DatabaseState;
  private subscribers: Array<() => void> = [];

  constructor(initialState?: DatabaseState) {
    if (initialState) {
      this.state = initialState;
    } else {
      this.state = this.loadFromStorage();
    }
  }

  public subscribe(cb: () => void): () => void {
    this.subscribers.push(cb);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== cb);
    };
  }

  private notify() {
    this.saveToStorage();
    for (const cb of this.subscribers) {
      cb();
    }
  }

  private loadFromStorage(): DatabaseState {
    try {
      if (typeof localStorage !== 'undefined') {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
          return JSON.parse(data);
        }
      }
    } catch (e) {
      console.warn('Failed to load from storage, using empty state', e);
    }
    return this.getEmptyState();
  }

  public saveToStorage() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      }
    } catch (e) {
      console.error('Failed to save state to localStorage', e);
    }
  }

  public getRawState(): DatabaseState {
    return JSON.parse(JSON.stringify(this.state));
  }

  public loadRawState(newState: DatabaseState) {
    this.state = newState;
    this.notify();
  }

  private getEmptyState(): DatabaseState {
    return {
      tenures: [],
      envelopes: [],
      cost_centers: [],
      members: [],
      membership_periods: [],
      fee_rates: [],
      shutdown_events: [],
      member_adjustments: [],
      ledger_transactions: [],
      ledger_lines: [],
      ledger_label_edits: [],
      allocation_sessions: [],
      assets: [],
      asset_events: [],
      asset_label_edits: [],
      tenure_member_snapshots: [],
      tenure_asset_snapshots: [],
      tenure_holding_snapshots: [],
      reconciliations: [],
      reconciliation_envelopes: [],
    };
  }

  // =====================================================================================
  // PART 1: TENURES
  // =====================================================================================

  public getTenures(): Tenure[] {
    return [...this.state.tenures].sort((a, b) => b.id - a.id);
  }

  public getOpenTenure(): Tenure {
    const t = this.state.tenures.find((x) => x.closed_on === null);
    if (!t) {
      throw new RefusalError(
        'There is no active open tenure.',
        'Please initialize a new tenure period to record entries.'
      );
    }
    return t;
  }

  // =====================================================================================
  // PART 2: SETTINGS & ENVELOPES
  // =====================================================================================

  public getEnvelopes(): Envelope[] {
    return [...this.state.envelopes];
  }

  public getPoolEnvelope(): Envelope {
    const pool = this.state.envelopes.find((e) => e.is_pool);
    if (!pool) {
      throw new RefusalError('No Unallocated General Fund (Pool) envelope found.');
    }
    return pool;
  }

  public getEnvelopeBalances(): EnvelopeBalance[] {
    const openTenure = this.state.tenures.find((x) => x.closed_on === null);
    const linesForTenure = openTenure
      ? this.state.ledger_transactions
          .filter((tx) => tx.tenure_id === openTenure.id)
          .flatMap((tx) => this.state.ledger_lines.filter((l) => l.transaction_id === tx.id))
      : [];

    return this.state.envelopes.map((e) => {
      const balance = linesForTenure
        .filter((l) => l.envelope_id === e.id)
        .reduce((sum, l) => sum + l.amount, 0);

      return {
        id: e.id,
        name: e.name,
        target_cap: e.target_cap,
        alloc_priority: e.alloc_priority,
        is_pool: e.is_pool,
        active: e.active,
        balance,
      };
    });
  }

  public createEnvelope(
    name: string,
    target_cap: number | null,
    alloc_priority: number | null
  ): Envelope {
    const trimmed = name.trim();
    if (!trimmed) throw new RefusalError('Envelope name cannot be empty.');
    if (this.state.envelopes.some((e) => e.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new RefusalError(`Envelope with name "${trimmed}" already exists.`);
    }

    const nextId = this.state.envelopes.reduce((max, e) => Math.max(max, e.id), 0) + 1;
    const env: Envelope = {
      id: nextId,
      name: trimmed,
      target_cap,
      alloc_priority,
      is_pool: false,
      active: true,
    };
    this.state.envelopes.push(env);
    this.notify();
    return env;
  }

  public updateEnvelope(
    id: number,
    updates: { name?: string; target_cap?: number | null; alloc_priority?: number | null; active?: boolean }
  ) {
    const env = this.state.envelopes.find((e) => e.id === id);
    if (!env) throw new RefusalError(`Envelope #${id} does not exist.`);

    if (env.is_pool && updates.active === false) {
      throw new RefusalError('The General Pool cannot be deactivated.');
    }

    if (updates.active === false && env.active) {
      const balances = this.getEnvelopeBalances();
      const b = balances.find((x) => x.id === id)?.balance ?? 0;
      if (b !== 0) {
        throw new RefusalError(
          `Envelope "${env.name}" still holds ৳${b}. You must transfer money out before deactivating it.`
        );
      }
    }

    if (updates.name !== undefined) env.name = updates.name.trim();
    if (updates.target_cap !== undefined) env.target_cap = updates.target_cap;
    if (updates.alloc_priority !== undefined) env.alloc_priority = updates.alloc_priority;
    if (updates.active !== undefined) env.active = updates.active;

    this.notify();
  }

  // Cost Centers
  public getCostCenters(): CostCenter[] {
    return [...this.state.cost_centers];
  }

  public createCostCenter(name: string, kind: CostCenter['kind']): CostCenter {
    const trimmed = name.trim();
    if (!trimmed) throw new RefusalError('Cost center name cannot be empty.');
    if (this.state.cost_centers.some((c) => c.kind === kind && c.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new RefusalError(`A ${kind} named "${trimmed}" already exists.`);
    }

    const nextId = this.state.cost_centers.reduce((m, c) => Math.max(m, c.id), 0) + 1;
    const cc: CostCenter = {
      id: nextId,
      name: trimmed,
      kind,
      status: 'active',
    };
    this.state.cost_centers.push(cc);
    this.notify();
    return cc;
  }

  public updateCostCenterStatus(id: number, status: CostCenter['status']) {
    const cc = this.state.cost_centers.find((c) => c.id === id);
    if (!cc) throw new RefusalError(`Cost center #${id} does not exist.`);
    cc.status = status;
    this.notify();
  }

  // Members & Membership Periods
  public getMembers(): Member[] {
    return [...this.state.members].sort((a, b) => a.name.localeCompare(b.name));
  }

  public getMembershipPeriods(): MembershipPeriod[] {
    return [...this.state.membership_periods];
  }

  public createMember(name: string, startDate: string, batch?: string, note?: string): Member {
    const trimmed = name.trim();
    if (!trimmed) throw new RefusalError('Member name cannot be empty.');
    const tenure = this.getOpenTenure();

    if (startDate < tenure.opened_on) {
      throw new RefusalError(
        `Membership cannot start on ${startDate} because this tenure opened on ${tenure.opened_on}.`,
        'Start the membership on or after tenure opening, and use an opening credit / adjustment if they paid earlier.'
      );
    }

    const nextMemberId = this.state.members.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    const member: Member = {
      id: nextMemberId,
      name: trimmed,
      batch: batch?.trim() || null,
      note: note?.trim() || '',
      created_at: new Date().toISOString(),
    };
    this.state.members.push(member);

    const nextPeriodId = this.state.membership_periods.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    const period: MembershipPeriod = {
      id: nextPeriodId,
      member_id: nextMemberId,
      start_date: startDate,
      end_date: null,
    };
    this.state.membership_periods.push(period);

    this.notify();
    return member;
  }

  public endMembership(memberId: number, endDate: string) {
    const tenure = this.getOpenTenure();
    const period = this.state.membership_periods.find((p) => p.member_id === memberId && p.end_date === null);
    if (!period) {
      throw new RefusalError('This member does not have an active membership period.');
    }
    if (endDate < period.start_date) {
      throw new RefusalError(`End date (${endDate}) cannot be before start date (${period.start_date}).`);
    }
    if (endDate < tenure.opened_on) {
      throw new RefusalError(
        `End date is inside a closed tenure (before ${tenure.opened_on}).`,
        'End on or after tenure opening and use a waiver for earlier weeks.'
      );
    }
    period.end_date = endDate;
    this.notify();
  }

  public updateMemberDetails(memberId: number, updates: { name?: string; batch?: string | null; note?: string }) {
    const member = this.state.members.find((m) => m.id === memberId);
    if (!member) throw new RefusalError(`Member #${memberId} not found.`);
    if (updates.name !== undefined) member.name = updates.name.trim();
    if (updates.batch !== undefined) member.batch = updates.batch ? updates.batch.trim() : null;
    if (updates.note !== undefined) member.note = updates.note.trim();
    this.notify();
  }

  // Fee Rates & Shutdown Events
  public getFeeRates(): FeeRate[] {
    return [...this.state.fee_rates].sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  }

  public getRateOn(sundayDate: string): number {
    const rates = this.state.fee_rates
      .filter((r) => r.effective_from <= sundayDate)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.id - a.id);
    return rates.length > 0 ? rates[0].amount : 0;
  }

  public addFeeRate(effectiveFrom: string, amount: number, recordedBy: string): FeeRate {
    if (!isSunday(effectiveFrom)) {
      throw new RefusalError('Fee rate effective date must be a Sunday.');
    }
    if (amount <= 0) {
      throw new RefusalError('Fee rate amount must be positive.');
    }
    const tenure = this.getOpenTenure();
    if (effectiveFrom < tenure.opened_on) {
      throw new RefusalError(`A rate cannot start before this tenure opened on ${tenure.opened_on}.`);
    }
    const currentWeekSunday = sundayOnOrBefore(toLocalDateStr(new Date()));
    if (effectiveFrom < currentWeekSunday) {
      throw new RefusalError(
        `A rate cannot be backdated before the current week (${currentWeekSunday}).`,
        'Use a waiver for adjustments on past weeks.'
      );
    }

    const nextId = this.state.fee_rates.reduce((m, r) => Math.max(m, r.id), 0) + 1;
    const rate: FeeRate = {
      id: nextId,
      effective_from: effectiveFrom,
      amount,
      recorded_at: new Date().toISOString(),
      recorded_by: recordedBy,
    };
    this.state.fee_rates.push(rate);
    this.notify();
    return rate;
  }

  public getShutdownEvents(): ShutdownEvent[] {
    return [...this.state.shutdown_events].sort((a, b) => a.week_start.localeCompare(b.week_start));
  }

  public isWeekShutdown(sundayDate: string): boolean {
    const events = this.state.shutdown_events
      .filter((e) => e.week_start === sundayDate)
      .sort((a, b) => b.id - a.id);
    return events.length > 0 ? events[0].is_shutdown : false;
  }

  public setShutdown(
    fromWeek: string,
    toWeek: string,
    isShutdown: boolean,
    recordedBy: string,
    reason: string = ''
  ): number {
    if (!isSunday(fromWeek) || !isSunday(toWeek)) {
      throw new RefusalError('Weeks must start on Sunday.');
    }
    if (toWeek < fromWeek) {
      throw new RefusalError('To-week is before from-week.');
    }
    const tenure = this.getOpenTenure();
    if (fromWeek < tenure.opened_on) {
      throw new RefusalError(`Week ${fromWeek} belongs to a closed tenure.`);
    }

    let count = 0;
    const dFrom = new Date(fromWeek + 'T00:00:00');
    const dTo = new Date(toWeek + 'T00:00:00');

    for (let cur = new Date(dFrom); cur <= dTo; cur.setDate(cur.getDate() + 7)) {
      const wkStr = toLocalDateStr(cur);
      const nextId = this.state.shutdown_events.reduce((m, e) => Math.max(m, e.id), 0) + 1;
      this.state.shutdown_events.push({
        id: nextId,
        week_start: wkStr,
        is_shutdown: isShutdown,
        reason,
        recorded_at: new Date().toISOString(),
        recorded_by: recordedBy,
      });
      count++;
    }
    this.notify();
    return count;
  }

  // Member Adjustments
  public getMemberAdjustments(memberId?: number): MemberAdjustment[] {
    if (memberId) {
      return this.state.member_adjustments.filter((a) => a.member_id === memberId);
    }
    return [...this.state.member_adjustments];
  }

  public addMemberAdjustment(
    memberId: number,
    kind: AdjustmentKind,
    amount: number,
    occurredOn: string,
    recordedBy: string,
    note: string
  ): MemberAdjustment {
    const tenure = this.getOpenTenure();
    if (occurredOn < tenure.opened_on) {
      throw new RefusalError(`Adjustments cannot be dated inside a closed tenure (before ${tenure.opened_on}).`);
    }
    if (amount === 0) throw new RefusalError('Adjustment amount cannot be zero.');
    if (kind === 'waiver' && amount <= 0) {
      throw new RefusalError('A waiver must be a positive credit amount (+৳).');
    }
    if (kind === 'credit_donation' && amount >= 0) {
      throw new RefusalError('A credit donation must remove credit (-৳).');
    }
    if ((kind === 'waiver' || kind === 'correction') && !note.trim()) {
      throw new RefusalError(`A human explanation note is required for ${kind}s.`);
    }

    const nextId = this.state.member_adjustments.reduce((m, a) => Math.max(m, a.id), 0) + 1;
    const adj: MemberAdjustment = {
      id: nextId,
      member_id: memberId,
      kind,
      amount,
      occurred_on: occurredOn,
      recorded_at: new Date().toISOString(),
      recorded_by: recordedBy,
      note: note.trim(),
    };
    this.state.member_adjustments.push(adj);
    this.notify();
    return adj;
  }

  // =====================================================================================
  // PART 3: THE LEDGER (Transactions, Lines, Label Edits)
  // =====================================================================================

  public async getLedgerChecksum(tenureId: number, throughTxId?: number): Promise<string> {
    const txs = this.state.ledger_transactions
      .filter((x) => x.tenure_id === tenureId && (throughTxId === undefined || x.id <= throughTxId))
      .sort((a, b) => a.id - b.id);

    const parts: string[] = [];
    for (const tx of txs) {
      const lines = this.state.ledger_lines
        .filter((l) => l.transaction_id === tx.id)
        .sort((a, b) => a.id - b.id);
      for (const l of lines) {
        parts.push(`${tx.id}:${tx.kind}:${l.envelope_id}:${l.amount}`);
      }
    }
    const text = parts.join('|');
    return await sha256(text);
  }

  public getLedgerTransactions(): LedgerEntryView[] {
    const pool = this.state.envelopes.find((e) => e.is_pool);
    const membersMap = new Map(this.state.members.map((m) => [m.id, m.name]));
    const ccMap = new Map(this.state.cost_centers.map((c) => [c.id, c.name]));
    const reversedIds = new Set(
      this.state.ledger_transactions.filter((tx) => tx.reverses_id !== null).map((tx) => tx.reverses_id)
    );

    return this.state.ledger_transactions.map((tx) => {
      const lines = this.state.ledger_lines.filter((l) => l.transaction_id === tx.id);
      return {
        ...tx,
        lines,
        is_voided: reversedIds.has(tx.id),
        corrected_from: tx.replaces_id,
        cost_center_name: tx.cost_center_id ? ccMap.get(tx.cost_center_id) : undefined,
        member_name: tx.member_id ? membersMap.get(tx.member_id) : undefined,
        source_label: tx.source ? tx.source.replace('_', ' ') : undefined,
      };
    });
  }

  public getEntriesCurrent(): LedgerEntryView[] {
    const all = this.getLedgerTransactions();
    // In SQL view entries_current:
    // WHERE x.kind <> 'reversal' AND NOT EXISTS (SELECT 1 FROM ledger_transactions r WHERE r.reverses_id = x.id)
    return all
      .filter((tx) => tx.kind !== 'reversal' && !tx.is_voided)
      .sort((a, b) => b.id - a.id);
  }

  public getLedgerLabelEdits(transactionId: number): LedgerLabelEdit[] {
    return this.state.ledger_label_edits
      .filter((e) => e.transaction_id === transactionId)
      .sort((a, b) => b.id - a.id);
  }

  public getReversalTrail(transactionId: number): LedgerEntryView[] {
    const all = this.getLedgerTransactions();
    const trail: LedgerEntryView[] = [];
    let curId: number | null = transactionId;
    while (curId !== null) {
      const tx = all.find((x) => x.id === curId);
      if (!tx) break;
      trail.push(tx);
      // check if it replaced something
      curId = tx.replaces_id;
    }
    return trail;
  }

  /**
   * Records a ledger transaction with complete schema guards.
   */
  public recordTransaction(params: {
    kind: EntryKind;
    occurred_on: string;
    recorded_by: string;
    note?: string;
    tag?: string | null;
    cost_center_id?: number | null;
    source?: IncomeSource | null;
    member_id?: number | null;
    lines: Array<{ envelope_id: number; amount: number }>;
    reverses_id?: number | null;
    replaces_id?: number | null;
  }): LedgerTransaction {
    const tenure = this.getOpenTenure();
    const note = (params.note ?? '').trim();

    // tx_guard checks
    if (params.occurred_on < tenure.opened_on) {
      throw new RefusalError(
        `Date ${params.occurred_on} is before this tenure opened on ${tenure.opened_on}.`,
        'Transaction must have occurred during the open tenure.'
      );
    }

    if (params.reverses_id) {
      const orig = this.state.ledger_transactions.find((x) => x.id === params.reverses_id);
      if (!orig) throw new RefusalError('Transaction to reverse was not found.');
      if (orig.tenure_id !== tenure.id || orig.kind === 'reversal' || orig.kind === 'opening') {
        throw new RefusalError(
          'This entry cannot be reversed (openings and reversals cannot be reversed). Enter a new adjustment instead.'
        );
      }
      if (orig.member_id !== params.member_id) {
        throw new RefusalError('A reversal must carry the same member as the original.');
      }
    }

    // Constraint checks from schema
    if (params.kind === 'deposit' && !params.source) {
      throw new RefusalError('Deposits must specify an income source.');
    }
    if (params.kind !== 'deposit' && params.source) {
      throw new RefusalError('Only deposits can have an income source.');
    }
    if (params.kind === 'reversal' && !params.reverses_id) {
      throw new RefusalError('Reversals must link to the entry being reversed.');
    }
    if (['transfer', 'sweep', 'reversal'].includes(params.kind) && !note) {
      throw new RefusalError(`A note is required for ${params.kind}s.`);
    }
    if (params.kind === 'deposit' && params.source === 'weekly_fee' && !params.member_id) {
      throw new RefusalError('Weekly fee deposits must be linked to a member.');
    }
    if (params.kind === 'sweep' && !params.cost_center_id) {
      throw new RefusalError('A sweep must be linked to an event/project cost center.');
    }

    // line_guard check: envelopes can never drop below zero!
    const balances = this.getEnvelopeBalances();
    for (const line of params.lines) {
      if (line.amount === 0) {
        throw new RefusalError('Line amounts cannot be zero.');
      }
      const env = this.state.envelopes.find((e) => e.id === line.envelope_id);
      if (!env) throw new RefusalError(`Envelope #${line.envelope_id} does not exist.`);
      if (!env.active) throw new RefusalError(`Envelope "${env.name}" is inactive.`);

      if (line.amount < 0) {
        const currentBal = balances.find((b) => b.id === line.envelope_id)?.balance ?? 0;
        if (currentBal + line.amount < 0) {
          throw new RefusalError(
            `Envelope "${env.name}" has only ৳${currentBal.toLocaleString()}. You cannot spend ৳${Math.abs(
              line.amount
            ).toLocaleString()} because envelopes cannot be overdrawn.`,
            'Transfer additional funds from the General Pool or another envelope first.'
          );
        }
      }
    }

    // check_shape checks
    const n = params.lines.length;
    const s = params.lines.reduce((sum, l) => sum + l.amount, 0);
    const pos = params.lines.filter((l) => l.amount > 0).length;
    const neg = params.lines.filter((l) => l.amount < 0).length;

    if (n === 0) throw new RefusalError('An entry must have at least one amount line.');

    if (params.kind === 'deposit' && !(n === 1 && pos === 1)) {
      throw new RefusalError('A deposit must be exactly one positive amount line.');
    }
    if (params.kind === 'expense' && !(n === 1 && neg === 1)) {
      throw new RefusalError('An expense must be exactly one negative amount line.');
    }
    if (['transfer', 'sweep'].includes(params.kind) && !(n >= 2 && s === 0)) {
      throw new RefusalError(
        `A ${params.kind} needs two or more lines that sum exactly to zero (current sum: ৳${s}).`
      );
    }
    if (params.kind === 'opening' && neg > 0) {
      throw new RefusalError('An opening entry cannot have negative lines.');
    }

    if (params.member_id && ['deposit', 'expense'].includes(params.kind)) {
      const pool = this.getPoolEnvelope();
      const nonPoolLine = params.lines.find((l) => l.envelope_id !== pool.id);
      if (nonPoolLine) {
        throw new RefusalError(
          'Member payments and refunds must flow through the Unallocated General pool.',
          'Record the member payment into the General Pool; allocate funds to purpose envelopes during allocation sessions.'
        );
      }
    }

    // Insert transaction
    const nextTxId = this.state.ledger_transactions.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    const tx: LedgerTransaction = {
      id: nextTxId,
      tenure_id: tenure.id,
      kind: params.kind,
      occurred_on: params.occurred_on,
      recorded_at: new Date().toISOString(),
      recorded_by: params.recorded_by,
      note,
      tag: params.tag ?? null,
      cost_center_id: params.cost_center_id ?? null,
      source: params.source ?? null,
      member_id: params.member_id ?? null,
      reverses_id: params.reverses_id ?? null,
      replaces_id: params.replaces_id ?? null,
    };
    this.state.ledger_transactions.push(tx);

    // Insert lines
    let nextLineId = this.state.ledger_lines.reduce((m, l) => Math.max(m, l.id), 0) + 1;
    for (const l of params.lines) {
      this.state.ledger_lines.push({
        id: nextLineId++,
        transaction_id: nextTxId,
        envelope_id: l.envelope_id,
        amount: l.amount,
      });
    }

    this.notify();
    return tx;
  }

  /**
   * "Fix Amount": In accordance with schema rule "history is never edited",
   * fixing an amount atomically records a reversal of the original, then records the corrected replacement.
   */
  public fixAmount(params: {
    transactionId: number;
    newLines: Array<{ envelope_id: number; amount: number }>;
    newNote?: string;
    by: string;
  }): { reversal: LedgerTransaction; replacement: LedgerTransaction } {
    const orig = this.state.ledger_transactions.find((tx) => tx.id === params.transactionId);
    if (!orig) throw new RefusalError(`Transaction #${params.transactionId} not found.`);
    if (orig.kind === 'opening' || orig.kind === 'reversal') {
      throw new RefusalError('Opening entries and reversal entries cannot be fixed.');
    }

    const origLines = this.state.ledger_lines.filter((l) => l.transaction_id === orig.id);

    // 1. Record reversal
    const reversalLines = origLines.map((l) => ({
      envelope_id: l.envelope_id,
      amount: -l.amount,
    }));

    const reversal = this.recordTransaction({
      kind: 'reversal',
      occurred_on: orig.occurred_on,
      recorded_by: params.by,
      note: `Correction reversal of #${orig.id}: ${orig.note}`,
      member_id: orig.member_id,
      reverses_id: orig.id,
      lines: reversalLines,
    });

    // 2. Record replacement
    const replacement = this.recordTransaction({
      kind: orig.kind,
      occurred_on: orig.occurred_on,
      recorded_by: params.by,
      note: params.newNote ? params.newNote.trim() : orig.note,
      tag: orig.tag,
      cost_center_id: orig.cost_center_id,
      source: orig.source,
      member_id: orig.member_id,
      replaces_id: orig.id,
      lines: params.newLines,
    });

    return { reversal, replacement };
  }

  /**
   * In-place label edit for typo fixes (note, tag, cost_center_id, occurred_on, source) with automatic audit.
   */
  public editTransactionLabel(params: {
    transactionId: number;
    by: string;
    note?: string;
    tag?: string | null;
    cost_center_id?: number | null;
    occurred_on?: string;
    source?: IncomeSource | null;
  }) {
    const tx = this.state.ledger_transactions.find((x) => x.id === params.transactionId);
    if (!tx) throw new RefusalError(`Transaction #${params.transactionId} not found.`);
    if (tx.kind === 'opening') throw new RefusalError('Opening entries cannot be edited.');

    const tenure = this.state.tenures.find((t) => t.id === tx.tenure_id);
    if (tenure && tenure.closed_on !== null) {
      throw new RefusalError(`Tenure "${tenure.name}" is closed. Closed tenures cannot be edited.`);
    }

    if (params.occurred_on && tenure && params.occurred_on < tenure.opened_on) {
      throw new RefusalError(`Date ${params.occurred_on} is before this tenure opened on ${tenure.opened_on}.`);
    }

    let nextEditId = this.state.ledger_label_edits.reduce((m, e) => Math.max(m, e.id), 0) + 1;
    const recordEdit = (field: string, oldVal: string | null, newVal: string | null) => {
      this.state.ledger_label_edits.push({
        id: nextEditId++,
        transaction_id: tx.id,
        field,
        old_value: oldVal,
        new_value: newVal,
        edited_at: new Date().toISOString(),
        edited_by: params.by,
      });
    };

    if (params.note !== undefined && params.note !== tx.note) {
      recordEdit('note', tx.note, params.note);
      tx.note = params.note;
    }
    if (params.tag !== undefined && params.tag !== tx.tag) {
      recordEdit('tag', tx.tag, params.tag);
      tx.tag = params.tag;
    }
    if (params.cost_center_id !== undefined && params.cost_center_id !== tx.cost_center_id) {
      recordEdit('cost_center_id', tx.cost_center_id ? String(tx.cost_center_id) : null, params.cost_center_id ? String(params.cost_center_id) : null);
      tx.cost_center_id = params.cost_center_id;
    }
    if (params.occurred_on !== undefined && params.occurred_on !== tx.occurred_on) {
      recordEdit('occurred_on', tx.occurred_on, params.occurred_on);
      tx.occurred_on = params.occurred_on;
    }
    if (params.source !== undefined && params.source !== tx.source) {
      recordEdit('source', tx.source, params.source);
      tx.source = params.source;
    }

    this.notify();
  }

  // =====================================================================================
  // PART 4: DECISIONS (Allocation sessions, Sweeps, Cost center summary)
  // =====================================================================================

  public getAllocationContext(): AllocationContext {
    const balances = this.getEnvelopeBalances();
    const pool = balances.find((b) => b.is_pool);
    const pool_balance = pool ? pool.balance : 0;
    const standing = this.getMemberStanding();
    const member_credit_held = standing
      .filter((s) => s.balance > 0)
      .reduce((sum, s) => sum + s.balance, 0);

    return {
      pool_balance,
      member_credit_held,
      pool_after_member_credit: pool_balance - member_credit_held,
    };
  }

  /**
   * Suggests allocation following the SQL allocation_suggestion function:
   * 1) Capped envelopes (target_cap & alloc_priority set) are topped up to cap in priority order (1 first).
   * 2) What is left is split among uncapped envelopes by shares (or previous session proportions).
   */
  public getAllocationSuggestion(
    amount: number,
    sharesObj?: Record<string, number>
  ): AllocationSuggestionRow[] {
    const balances = this.getEnvelopeBalances().filter((b) => b.active && !b.is_pool);

    // Sort capped envelopes by priority
    const envs = balances.map((b) => {
      const hasCap = b.target_cap !== null && b.alloc_priority !== null;
      const gap = hasCap ? Math.max((b.target_cap ?? 0) - b.balance, 0) : null;
      return {
        ...b,
        gap,
        prio: b.alloc_priority ?? 2147483647,
      };
    }).sort((a, b) => a.prio - b.prio || a.id - b.id);

    // Phase 1: Cap fill
    let remainingAmount = amount;
    const fills = new Map<number, number>();

    for (const e of envs) {
      if (e.gap !== null) {
        const fill = Math.min(e.gap, Math.max(remainingAmount, 0));
        fills.set(e.id, fill);
        remainingAmount -= fill;
      } else {
        fills.set(e.id, 0);
      }
    }

    // Phase 2: Shares for uncapped envelopes
    const uncapped = envs.filter((e) => e.target_cap === null);
    const lastSession = [...this.state.allocation_sessions].sort((a, b) => b.ledger_transaction_id - a.ledger_transaction_id)[0];
    const lastSessionLines = lastSession
      ? this.state.ledger_lines.filter((l) => l.transaction_id === lastSession.ledger_transaction_id && l.amount > 0)
      : [];

    const computedShares = new Map<number, number>();
    for (const u of uncapped) {
      if (sharesObj && sharesObj[String(u.id)] !== undefined) {
        computedShares.set(u.id, Math.max(0, sharesObj[String(u.id)]));
      } else {
        const line = lastSessionLines.find((l) => l.envelope_id === u.id);
        computedShares.set(u.id, line ? line.amount : 0);
      }
    }

    const totalShares = Array.from(computedShares.values()).reduce((sum, v) => sum + v, 0);
    const sharesFill = new Map<number, number>();

    if (totalShares > 0 && remainingAmount > 0) {
      const quotas = uncapped.map((u) => {
        const sh = computedShares.get(u.id) ?? 0;
        const q = (remainingAmount * sh) / totalShares;
        return {
          id: u.id,
          q,
          b: Math.floor(q),
          remainder: q - Math.floor(q),
        };
      });

      const baseSum = quotas.reduce((sum, item) => sum + item.b, 0);
      let extraCount = remainingAmount - baseSum;

      // Distribute extra 1 taka by highest remainder
      const sortedByRem = [...quotas].sort((a, b) => b.remainder - a.remainder || a.id - b.id);
      for (const item of sortedByRem) {
        let add = 0;
        if (extraCount > 0) {
          add = 1;
          extraCount--;
        }
        sharesFill.set(item.id, item.b + add);
      }
    } else {
      for (const u of uncapped) {
        sharesFill.set(u.id, 0);
      }
    }

    // Combine result
    return envs.map((e) => {
      const capFill = fills.get(e.id) ?? 0;
      const shFill = sharesFill.get(e.id) ?? 0;
      let phase: 'cap_fill' | 'share' | 'none' = 'none';
      if (capFill > 0) phase = 'cap_fill';
      else if (shFill > 0) phase = 'share';

      return {
        envelope_id: e.id,
        envelope_name: e.name,
        balance: e.balance,
        target_cap: e.target_cap,
        alloc_priority: e.alloc_priority,
        gap: e.gap,
        phase,
        suggested: capFill + shFill,
      };
    });
  }

  /**
   * Commits the committee's allocation decision: one transfer out of Pool, marks allocation session.
   */
  public allocate(params: {
    by: string;
    date: string;
    note: string;
    amounts: Record<number, number>; // { [envelopeId]: amount }
  }): LedgerTransaction {
    const pool = this.getPoolEnvelope();
    let total = 0;
    const lines: Array<{ envelope_id: number; amount: number }> = [];

    for (const [key, val] of Object.entries(params.amounts)) {
      const envId = Number(key);
      const amt = Number(val);
      if (amt <= 0) continue;
      if (envId === pool.id) {
        throw new RefusalError('The General Pool cannot be allocated to itself.');
      }
      lines.push({ envelope_id: envId, amount: amt });
      total += amt;
    }

    if (total === 0) {
      throw new RefusalError('Nothing to allocate (total amount is ৳0).');
    }

    // Line from pool
    lines.unshift({ envelope_id: pool.id, amount: -total });

    const tx = this.recordTransaction({
      kind: 'transfer',
      occurred_on: params.date,
      recorded_by: params.by,
      note: params.note.trim() || 'Allocation meeting session',
      tag: 'allocation',
      lines,
    });

    this.state.allocation_sessions.push({
      ledger_transaction_id: tx.id,
      recorded_at: new Date().toISOString(),
      recorded_by: params.by,
    });

    this.notify();
    return tx;
  }

  public getCostCenterSummary(): CostCenterSummary[] {
    const reversedIds = new Set(
      this.state.ledger_transactions.filter((tx) => tx.reverses_id !== null).map((tx) => tx.reverses_id)
    );

    return this.state.cost_centers.map((cc) => {
      // Find all transactions attached to this cost center (excluding reversed)
      const txs = this.state.ledger_transactions.filter(
        (tx) => tx.cost_center_id === cc.id && !reversedIds.has(tx.id) && tx.kind !== 'reversal'
      );

      let money_in = 0;
      let money_out = 0;
      let swept = 0;

      for (const tx of txs) {
        const lines = this.state.ledger_lines.filter((l) => l.transaction_id === tx.id);
        const sum = lines.reduce((s, l) => s + l.amount, 0);
        if (tx.kind === 'deposit') {
          money_in += sum;
        } else if (tx.kind === 'expense') {
          // expense is negative
          money_out += -sum;
        } else if (tx.kind === 'sweep') {
          const neg = lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0);
          swept += -neg;
        }
      }

      return {
        cost_center_id: cc.id,
        name: cc.name,
        kind: cc.kind,
        status: cc.status,
        money_in,
        money_out,
        swept,
        leftover: money_in - money_out - swept,
      };
    });
  }

  /**
   * Sweeps leftover money from an event back into the General Pool.
   */
  public sweepLeftover(params: {
    costCenterId: number;
    fromEnvelopeId: number;
    by: string;
    date: string;
    note: string;
  }): LedgerTransaction {
    const pool = this.getPoolEnvelope();
    if (params.fromEnvelopeId === pool.id) {
      throw new RefusalError('Leftover money must be swept from an envelope other than the pool.');
    }
    const summary = this.getCostCenterSummary().find((c) => c.cost_center_id === params.costCenterId);
    if (!summary || summary.leftover <= 0) {
      throw new RefusalError(`Nothing to sweep (current leftover is ৳${summary?.leftover ?? 0}).`);
    }

    const lo = summary.leftover;
    const tx = this.recordTransaction({
      kind: 'sweep',
      occurred_on: params.date,
      recorded_by: params.by,
      note: params.note.trim() || `Sweep leftover for ${summary.name}`,
      cost_center_id: params.costCenterId,
      lines: [
        { envelope_id: params.fromEnvelopeId, amount: -lo },
        { envelope_id: pool.id, amount: lo },
      ],
    });

    return tx;
  }

  // =====================================================================================
  // PART 5: DUES (member_standing, dues_overview)
  // =====================================================================================

  /**
   * Computes member standing as of any date, matching SQL member_standing(p_as_of) exactly.
   */
  public getMemberStanding(asOfDate: string = toLocalDateStr(new Date())): MemberStanding[] {
    const minRate = this.state.fee_rates.reduce(
      (min, r) => (r.effective_from < min ? r.effective_from : min),
      '9999-99-99'
    );
    if (minRate === '9999-99-99') {
      return this.state.members.map((m) => ({
        who_id: m.id,
        who_name: m.name,
        is_member_now: false,
        weeks_owed: 0,
        owed: 0,
        credits: 0,
        balance: 0,
        weeks_overdue: 0,
        oldest_unpaid_week: null,
      }));
    }

    const lastSunday = sundayOnOrBefore(asOfDate);
    const billableWeeks: string[] = [];

    // Generate series of Sundays
    const dCur = new Date(minRate + 'T00:00:00');
    const dEnd = new Date(lastSunday + 'T00:00:00');
    while (dCur <= dEnd) {
      const wkStr = toLocalDateStr(dCur);
      if (!this.isWeekShutdown(wkStr)) {
        billableWeeks.push(wkStr);
      }
      dCur.setDate(dCur.getDate() + 7);
    }

    return this.state.members.map((m) => {
      const periods = this.state.membership_periods.filter((p) => p.member_id === m.id);
      const isMemberNow = periods.some(
        (p) => p.start_date <= asOfDate && (p.end_date === null || p.end_date >= asOfDate)
      );

      // Collect weeks member owes
      const owedWeeks: Array<{ week: string; rate: number }> = [];
      for (const wk of billableWeeks) {
        const covered = periods.some(
          (p) => wk >= p.start_date && (p.end_date === null || wk <= p.end_date)
        );
        if (covered) {
          owedWeeks.push({ week: wk, rate: this.getRateOn(wk) });
        }
      }

      const totalOwed = owedWeeks.reduce((sum, w) => sum + w.rate, 0);

      // Cash payments recorded in ledger (occurred_on <= asOfDate)
      const reversedIds = new Set(
        this.state.ledger_transactions.filter((tx) => tx.reverses_id !== null).map((tx) => tx.reverses_id)
      );
      const cashPayments = this.state.ledger_transactions
        .filter((tx) => tx.member_id === m.id && tx.occurred_on <= asOfDate && !reversedIds.has(tx.id))
        .flatMap((tx) => this.state.ledger_lines.filter((l) => l.transaction_id === tx.id))
        .reduce((sum, l) => sum + l.amount, 0);

      // Adjustments (occurred_on <= asOfDate)
      const adjustments = this.state.member_adjustments
        .filter((a) => a.member_id === m.id && a.occurred_on <= asOfDate)
        .reduce((sum, a) => sum + a.amount, 0);

      const totalCredits = cashPayments + adjustments;
      const balance = totalCredits - totalOwed; // positive = credit, negative = arrears

      // Running cumulative owed to calculate weeks overdue and oldest unpaid week
      let running = 0;
      let weeksOverdue = 0;
      let oldestUnpaidWeek: string | null = null;

      for (const w of owedWeeks) {
        running += w.rate;
        if (running > totalCredits) {
          weeksOverdue++;
          if (!oldestUnpaidWeek) {
            oldestUnpaidWeek = w.week;
          }
        }
      }

      return {
        who_id: m.id,
        who_name: m.name,
        is_member_now: isMemberNow,
        weeks_owed: owedWeeks.length,
        owed: totalOwed,
        credits: totalCredits,
        balance,
        weeks_overdue: weeksOverdue,
        oldest_unpaid_week: oldestUnpaidWeek,
      };
    });
  }

  public getDuesOverview(asOfDate?: string): MemberStanding[] {
    return this.getMemberStanding(asOfDate).sort(
      (a, b) => b.weeks_overdue - a.weeks_overdue || a.who_name.localeCompare(b.who_name)
    );
  }

  // =====================================================================================
  // PART 6: ASSETS
  // =====================================================================================

  public getAssets(): Asset[] {
    return [...this.state.assets].sort((a, b) => a.name.localeCompare(b.name));
  }

  public getAssetEvents(assetId?: number): AssetEvent[] {
    if (assetId) return this.state.asset_events.filter((e) => e.asset_id === assetId);
    return [...this.state.asset_events];
  }

  public createAsset(params: {
    name: string;
    mode: Asset['mode'];
    ownership: Asset['ownership'];
    tag?: string | null;
    note?: string;
  }): Asset {
    const trimmed = params.name.trim();
    if (!trimmed) throw new RefusalError('Asset name cannot be empty.');

    if (params.tag) {
      const tagLower = params.tag.trim().toLowerCase();
      if (this.state.assets.some((a) => a.tag?.toLowerCase() === tagLower)) {
        throw new RefusalError(`An asset with tag "${params.tag}" already exists.`);
      }
    }

    const nextId = this.state.assets.reduce((m, a) => Math.max(m, a.id), 0) + 1;
    const asset: Asset = {
      id: nextId,
      name: trimmed,
      mode: params.mode,
      ownership: params.ownership,
      tag: params.tag ? params.tag.trim() : null,
      note: params.note?.trim() || '',
      created_at: new Date().toISOString(),
    };
    this.state.assets.push(asset);
    this.notify();
    return asset;
  }

  public getAssetState(asOfDate: string = '9999-99-99'): AssetState[] {
    return this.state.assets.map((a) => {
      const events = this.state.asset_events.filter(
        (e) => e.asset_id === a.id && e.occurred_on <= asOfDate
      );

      let stock = 0;
      let damaged = 0;
      let with_members = 0;
      let lost = 0;
      let scrapped = 0;
      let exchanged = 0;

      for (const e of events) {
        const q = e.quantity;
        switch (e.kind) {
          case 'acquired':
          case 'returned':
          case 'repaired':
          case 'correction':
            stock += q;
            break;
          case 'lent':
            stock -= q;
            with_members += q;
            break;
          case 'damaged':
            if (e.member_id === null) stock -= q;
            else with_members -= q;
            damaged += q;
            break;
          case 'lost':
            if (e.member_id === null) stock -= q;
            else with_members -= q;
            lost += q;
            break;
          case 'scrapped':
            damaged -= q;
            scrapped += q;
            break;
          case 'exchanged':
            damaged -= q;
            exchanged += q;
            break;
        }
      }

      return {
        asset_id: a.id,
        asset_name: a.name,
        ownership: a.ownership,
        mode: a.mode,
        tag: a.tag,
        stock,
        damaged,
        with_members,
        lost,
        scrapped,
        exchanged,
      };
    });
  }

  public getAssetHoldings(asOfDate: string = '9999-99-99'): AssetHolding[] {
    const holdingsMap = new Map<string, number>(); // key: `${asset_id}:${member_id}`
    const events = this.state.asset_events.filter(
      (e) => e.member_id !== null && e.occurred_on <= asOfDate
    );

    for (const e of events) {
      const key = `${e.asset_id}:${e.member_id}`;
      let delta = 0;
      if (e.kind === 'lent') delta = e.quantity;
      else if (e.kind === 'returned') delta = -e.quantity;
      else if (e.kind === 'damaged' || e.kind === 'lost') delta = -e.quantity;

      const current = holdingsMap.get(key) ?? 0;
      holdingsMap.set(key, current + delta);
    }

    const results: AssetHolding[] = [];
    const membersMap = new Map(this.state.members.map((m) => [m.id, m.name]));
    const assetsMap = new Map(this.state.assets.map((a) => [a.id, a.name]));

    for (const [key, qty] of holdingsMap.entries()) {
      if (qty !== 0) {
        const [aIdStr, mIdStr] = key.split(':');
        const asset_id = Number(aIdStr);
        const member_id = Number(mIdStr);
        results.push({
          asset_id,
          asset_name: assetsMap.get(asset_id) ?? 'Unknown',
          member_id,
          member_name: membersMap.get(member_id) ?? 'Unknown',
          quantity: qty,
        });
      }
    }

    return results.sort((a, b) => a.member_name.localeCompare(b.member_name) || a.asset_name.localeCompare(b.asset_name));
  }

  public getAdminReplacementQueue(): AssetState[] {
    return this.getAssetState().filter((a) => a.ownership === 'admin' && a.damaged > 0);
  }

  /**
   * Records an asset movement event with full PostgreSQL bucket checks.
   */
  public recordAssetEvent(params: {
    asset_id: number;
    kind: AssetEventKind;
    quantity: number;
    member_id?: number | null;
    cost_center_id?: number | null;
    occurred_on: string;
    recorded_by: string;
    note?: string;
    source?: AcquireSource | null;
    ledger_transaction_id?: number | null;
    reverses_id?: number | null;
    replaces_id?: number | null;
  }): AssetEvent {
    const tenure = this.getOpenTenure();
    const asset = this.state.assets.find((a) => a.id === params.asset_id);
    if (!asset) throw new RefusalError(`Asset #${params.asset_id} does not exist.`);

    if (params.occurred_on < tenure.opened_on) {
      throw new RefusalError(`Events cannot be dated inside a closed tenure (before ${tenure.opened_on}).`);
    }

    if (asset.mode === 'individual' && Math.abs(params.quantity) !== 1) {
      throw new RefusalError('An individually tracked asset moves one unit at a time.');
    }

    if (['lent', 'returned'].includes(params.kind) && !params.member_id) {
      throw new RefusalError('Lending and returning must specify a member.');
    }

    if (params.kind === 'lent') {
      // Check if borrower is currently a member
      const periods = this.state.membership_periods.filter((p) => p.member_id === params.member_id);
      const isMember = periods.some(
        (p) => params.occurred_on >= p.start_date && (p.end_date === null || params.occurred_on <= p.end_date)
      );
      if (!isMember) {
        throw new RefusalError(
          'Only a current active member can borrow equipment.',
          'Lend it in an active member’s name and put the project in the note.'
        );
      }
    }

    const note = (params.note ?? '').trim();
    if (['damaged', 'lost', 'scrapped', 'exchanged', 'correction'].includes(params.kind) && !note) {
      throw new RefusalError(`A human explanation note is required for ${params.kind} events.`);
    }

    // Bucket checks: ensure counts won't go negative
    const states = this.getAssetState();
    const curState = states.find((s) => s.asset_id === asset.id);
    const stock = curState?.stock ?? 0;
    const damaged = curState?.damaged ?? 0;

    if (params.kind === 'lent' && stock < params.quantity) {
      throw new RefusalError(
        `Not enough units in stock: have ${stock}, trying to lend ${params.quantity}.`
      );
    }
    if (params.kind === 'damaged' && params.member_id === null && stock < params.quantity) {
      throw new RefusalError(
        `Cannot mark damaged: only ${stock} in stock.`
      );
    }
    if (['scrapped', 'exchanged', 'repaired'].includes(params.kind) && damaged < params.quantity) {
      throw new RefusalError(
        `Fewer damaged units than that: currently ${damaged} damaged, trying to process ${params.quantity}.`
      );
    }
    if (params.kind === 'returned' && params.member_id) {
      const holdings = this.getAssetHoldings().find(
        (h) => h.asset_id === asset.id && h.member_id === params.member_id
      );
      const held = holdings?.quantity ?? 0;
      if (held < params.quantity) {
        throw new RefusalError(
          `That member only holds ${held} unit(s) of this item, cannot return ${params.quantity}.`
        );
      }
    }

    const nextId = this.state.asset_events.reduce((m, e) => Math.max(m, e.id), 0) + 1;
    const ev: AssetEvent = {
      id: nextId,
      asset_id: params.asset_id,
      kind: params.kind,
      quantity: params.quantity,
      member_id: params.member_id ?? null,
      cost_center_id: params.cost_center_id ?? null,
      occurred_on: params.occurred_on,
      recorded_at: new Date().toISOString(),
      recorded_by: params.recorded_by,
      note,
      source: params.source ?? null,
      ledger_transaction_id: params.ledger_transaction_id ?? null,
      reverses_id: params.reverses_id ?? null,
      replaces_id: params.replaces_id ?? null,
    };
    this.state.asset_events.push(ev);
    this.notify();
    return ev;
  }

  // =====================================================================================
  // PART 7: HANDOVER (Closing a tenure, snapshots, carry-over)
  // =====================================================================================

  public async closeTenure(params: {
    closeOn: string;
    by: string;
    nextName: string;
  }): Promise<{ newTenureId: number; checksum: string }> {
    const tenure = this.getOpenTenure();
    const lastTx = [...this.state.ledger_transactions]
      .filter((x) => x.tenure_id === tenure.id)
      .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))[0];

    if (lastTx && params.closeOn < lastTx.occurred_on) {
      throw new RefusalError(
        `Close date (${params.closeOn}) is before the last recorded entry (${lastTx.occurred_on}).`
      );
    }
    if (params.closeOn < tenure.opened_on) {
      throw new RefusalError(
        `Close date (${params.closeOn}) is before the tenure opened on ${tenure.opened_on}.`
      );
    }

    // 1. Calculate closing checksum
    const checksum = await this.getLedgerChecksum(tenure.id);

    // 2. Freeze tenure
    tenure.closed_on = params.closeOn;
    tenure.closed_at = new Date().toISOString();
    tenure.closing_checksum = checksum;

    // 3. Take Member Snapshots
    const standing = this.getMemberStanding(params.closeOn);
    for (const s of standing) {
      this.state.tenure_member_snapshots.push({
        tenure_id: tenure.id,
        member_id: s.who_id,
        as_of: params.closeOn,
        weeks_owed: s.weeks_owed,
        owed: s.owed,
        credits: s.credits,
        balance: s.balance,
        weeks_overdue: s.weeks_overdue,
      });
    }

    // 4. Take Asset Snapshots & Holding Snapshots
    const assetStates = this.getAssetState(params.closeOn);
    for (const a of assetStates) {
      this.state.tenure_asset_snapshots.push({
        tenure_id: tenure.id,
        asset_id: a.asset_id,
        as_of: params.closeOn,
        stock: a.stock,
        damaged: a.damaged,
        held: a.with_members,
        lost: a.lost,
        scrapped: a.scrapped,
        exchanged: a.exchanged,
      });
    }

    const holdings = this.getAssetHoldings(params.closeOn);
    for (const h of holdings) {
      this.state.tenure_holding_snapshots.push({
        tenure_id: tenure.id,
        asset_id: h.asset_id,
        member_id: h.member_id,
        quantity: h.quantity,
      });
    }

    // 5. Spawn new tenure
    const dClose = new Date(params.closeOn + 'T00:00:00');
    dClose.setDate(dClose.getDate() + 1);
    const nextOpenDate = toLocalDateStr(dClose);

    const nextTenureId = this.state.tenures.reduce((m, t) => Math.max(m, t.id), 0) + 1;
    const newTenure: Tenure = {
      id: nextTenureId,
      name: params.nextName.trim(),
      opened_on: nextOpenDate,
      closed_on: null,
      closed_at: null,
      closing_checksum: null,
    };
    this.state.tenures.push(newTenure);

    // 6. Carry over envelope balances into an 'opening' transaction for new tenure
    const tenureLines = this.state.ledger_transactions
      .filter((x) => x.tenure_id === tenure.id)
      .flatMap((x) => this.state.ledger_lines.filter((l) => l.transaction_id === x.id));

    const activeLines: Array<{ envelope_id: number; amount: number }> = [];
    for (const env of this.state.envelopes) {
      const sum = tenureLines
        .filter((l) => l.envelope_id === env.id)
        .reduce((s, l) => s + l.amount, 0);
      if (sum !== 0) {
        activeLines.push({ envelope_id: env.id, amount: sum });
      }
    }

    if (activeLines.length > 0) {
      const nextTxId = this.state.ledger_transactions.reduce((m, x) => Math.max(m, x.id), 0) + 1;
      this.state.ledger_transactions.push({
        id: nextTxId,
        tenure_id: nextTenureId,
        kind: 'opening',
        occurred_on: nextOpenDate,
        recorded_at: new Date().toISOString(),
        recorded_by: params.by,
        note: `Carry-over from ${tenure.name}`,
        tag: 'opening',
        cost_center_id: null,
        source: null,
        member_id: null,
        reverses_id: null,
        replaces_id: null,
      });

      let nextLineId = this.state.ledger_lines.reduce((m, l) => Math.max(m, l.id), 0) + 1;
      for (const line of activeLines) {
        this.state.ledger_lines.push({
          id: nextLineId++,
          transaction_id: nextTxId,
          envelope_id: line.envelope_id,
          amount: line.amount,
        });
      }
    }

    this.notify();
    return { newTenureId: nextTenureId, checksum };
  }

  // =====================================================================================
  // PART 8: TRUST (Reconciliation, Difference Suspects, Verify Integrity)
  // =====================================================================================

  public getReconciliations(): Reconciliation[] {
    return [...this.state.reconciliations].sort((a, b) => b.id - a.id);
  }

  public getLastMatch(): Reconciliation | null {
    const matches = this.state.reconciliations.filter((r) => r.matched).sort((a, b) => b.id - a.id);
    return matches.length > 0 ? matches[0] : null;
  }

  public getUnverifiedEntries(): Array<LedgerEntryView & { net_effect: number; size: number }> {
    const lastMatch = this.getLastMatch();
    const throughId = lastMatch ? lastMatch.through_entry_id : 0;
    const all = this.getLedgerTransactions();

    return all
      .filter((tx) => tx.id > throughId)
      .map((tx) => {
        const net = tx.lines.reduce((sum, l) => sum + l.amount, 0);
        const pos = tx.lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
        const neg = tx.lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0);
        const size = Math.max(pos, -neg);
        return {
          ...tx,
          net_effect: net,
          size,
        };
      })
      .sort((a, b) => a.id - b.id);
  }

  public getReconciliationStatus(): ReconciliationStatus {
    const lastMatch = this.getLastMatch();
    const unverified = this.getUnverifiedEntries();
    const latestAttempt = [...this.state.reconciliations].sort((a, b) => b.id - a.id)[0];

    let daysSince: number | null = null;
    if (lastMatch) {
      const d1 = new Date(lastMatch.checked_on + 'T00:00:00').getTime();
      const d2 = new Date().getTime();
      daysSince = Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
    }

    return {
      last_match_id: lastMatch ? lastMatch.id : null,
      last_match_date: lastMatch ? lastMatch.checked_on : null,
      last_match_through_entry: lastMatch ? lastMatch.through_entry_id : null,
      days_since_last_match: daysSince,
      entries_since_last_match: unverified.length,
      latest_attempt_matched: latestAttempt ? latestAttempt.matched : null,
      latest_difference: latestAttempt ? latestAttempt.difference : null,
    };
  }

  /**
   * Diagnostic heuristic suspect finder matching SQL difference_suspects.
   * Finds:
   * 1. Same amount as difference: typed twice or recorded but never happened.
   * 2. Twice difference: entered in wrong direction (deposit vs expense).
   * 3. Extra zero typed: 10x too big.
   * 4. Zero left out: 10x too small.
   * 5. Swapped neighbouring digits (e.g. 5200 vs 2500).
   */
  public getDifferenceSuspects(diff: number, envelopeId?: number): DifferenceSuspect[] {
    if (diff === 0) return [];
    const unverified = this.getUnverifiedEntries();
    const suspects: DifferenceSuspect[] = [];

    for (const tx of unverified) {
      const lines = envelopeId
        ? tx.lines.filter((l) => l.envelope_id === envelopeId)
        : tx.lines;
      const effect = lines.reduce((s, l) => s + l.amount, 0);
      if (effect === 0) continue;

      // 1. Same amount
      if (effect === -diff) {
        suspects.push({
          entry_id: tx.id,
          kind: tx.kind,
          occurred_on: tx.occurred_on,
          effect,
          note: tx.note,
          why: 'Same amount as the difference: typed twice, or recorded in app but never actually happened in cash.',
        });
      }

      // 2. Twice the difference (inverted direction)
      if (2 * effect === -diff) {
        suspects.push({
          entry_id: tx.id,
          kind: tx.kind,
          occurred_on: tx.occurred_on,
          effect,
          note: tx.note,
          why: 'Twice the difference: entered in the wrong direction (recorded as deposit instead of expense, or vice versa).',
        });
      }

      // 3. Extra zero typed (10x too big)
      if (effect % 10 === 0 && 9 * effect === -10 * diff) {
        suspects.push({
          entry_id: tx.id,
          kind: tx.kind,
          occurred_on: tx.occurred_on,
          effect,
          note: tx.note,
          why: 'An extra zero typed (e.g. ৳5000 instead of ৳500).',
        });
      }

      // 4. Zero left out (10x too small)
      if (9 * effect === diff) {
        suspects.push({
          entry_id: tx.id,
          kind: tx.kind,
          occurred_on: tx.occurred_on,
          effect,
          note: tx.note,
          why: 'A zero left out (e.g. ৳50 instead of ৳500).',
        });
      }

      // 5. Two neighbouring digits swapped
      const absStr = Math.abs(effect).toString();
      const sgn = Math.sign(effect);
      for (let p = 0; p < absStr.length - 1; p++) {
        if (absStr[p] !== absStr[p + 1]) {
          const swapped =
            absStr.substring(0, p) +
            absStr[p + 1] +
            absStr[p] +
            absStr.substring(p + 2);
          const candidateDiff = sgn * (parseInt(swapped, 10) - Math.abs(effect));
          if (candidateDiff === diff) {
            suspects.push({
              entry_id: tx.id,
              kind: tx.kind,
              occurred_on: tx.occurred_on,
              effect,
              note: tx.note,
              why: `Two neighbouring digits swapped (transposed '${absStr[p]}${absStr[p + 1]}' with '${absStr[p + 1]}${absStr[p]}').`,
            });
            break;
          }
        }
      }
    }

    return suspects;
  }

  /**
   * Reconcile screen with treasurer's physical count / notes.
   */
  public recordReconciliation(params: {
    by: string;
    countedTotal: number;
    note?: string;
    countedEnvelopes?: Record<number, number>;
    date?: string;
  }): Reconciliation {
    const tenure = this.getOpenTenure();
    const openTx = this.state.ledger_transactions.filter((tx) => tx.tenure_id === tenure.id);
    const throughId = openTx.reduce((m, x) => Math.max(m, x.id), 0);
    if (throughId === 0) {
      throw new RefusalError('Nothing to reconcile yet (no transactions in this tenure).');
    }

    const balances = this.getEnvelopeBalances();
    const systemTotal = balances.reduce((sum, b) => sum + b.balance, 0);

    let matched = params.countedTotal === systemTotal;

    if (params.countedEnvelopes) {
      for (const [envIdStr, cntVal] of Object.entries(params.countedEnvelopes)) {
        const envId = Number(envIdStr);
        const sysBal = balances.find((b) => b.id === envId)?.balance ?? 0;
        if (sysBal !== cntVal) {
          matched = false;
        }
      }
    }

    const nextId = this.state.reconciliations.reduce((m, r) => Math.max(m, r.id), 0) + 1;
    const rec: Reconciliation = {
      id: nextId,
      tenure_id: tenure.id,
      through_entry_id: throughId,
      checked_on: params.date ?? toLocalDateStr(new Date()),
      system_total: systemTotal,
      counted_total: params.countedTotal,
      difference: params.countedTotal - systemTotal,
      matched,
      recorded_at: new Date().toISOString(),
      recorded_by: params.by,
      note: (params.note ?? '').trim(),
    };
    this.state.reconciliations.push(rec);

    if (params.countedEnvelopes) {
      for (const [envIdStr, cntVal] of Object.entries(params.countedEnvelopes)) {
        const envId = Number(envIdStr);
        const sysBal = balances.find((b) => b.id === envId)?.balance ?? 0;
        this.state.reconciliation_envelopes.push({
          reconciliation_id: nextId,
          envelope_id: envId,
          system_balance: sysBal,
          counted: cntVal,
        });
      }
    }

    this.notify();
    return rec;
  }

  /**
   * Health checks running all integrity checks from verify_all() in PostgreSQL schema.
   */
  public async verifyAll(): Promise<string[]> {
    const problems: string[] = [];

    // 1. Closed tenure checksum verification
    for (const t of this.state.tenures) {
      if (t.closed_on !== null && t.closing_checksum) {
        const expected = await this.getLedgerChecksum(t.id);
        if (expected !== t.closing_checksum) {
          problems.push(
            `Tenure "${t.name}": Money data differs from the checksum saved at close (${t.closing_checksum.slice(
              0,
              8
            )}... vs ${expected.slice(0, 8)}...).`
          );
        }
      }
    }

    // 2. Envelopes below zero check
    const openTenure = this.state.tenures.find((t) => t.closed_on === null);
    if (openTenure) {
      const balances = this.getEnvelopeBalances();
      for (const b of balances) {
        if (b.balance < 0) {
          problems.push(
            `Tenure "${openTenure.name}": Envelope "${b.name}" is below zero (৳${b.balance}).`
          );
        }
      }
    }

    // 3. Transactions without lines or wrong shapes
    for (const tx of this.state.ledger_transactions) {
      const lines = this.state.ledger_lines.filter((l) => l.transaction_id === tx.id);
      if (lines.length === 0) {
        problems.push(`Entry #${tx.id} (${tx.kind}): has no amount lines.`);
        continue;
      }
      const sum = lines.reduce((s, l) => s + l.amount, 0);
      const pos = lines.filter((l) => l.amount > 0).length;
      const neg = lines.filter((l) => l.amount < 0).length;

      if (tx.kind === 'deposit' && !(lines.length === 1 && pos === 1)) {
        problems.push(`Entry #${tx.id} (deposit): wrong shape, expected 1 positive amount.`);
      }
      if (tx.kind === 'expense' && !(lines.length === 1 && neg === 1)) {
        problems.push(`Entry #${tx.id} (expense): wrong shape, expected 1 negative amount.`);
      }
      if (['transfer', 'sweep'].includes(tx.kind) && !(lines.length >= 2 && sum === 0)) {
        problems.push(`Entry #${tx.id} (${tx.kind}): amounts do not sum to zero.`);
      }
    }

    // 4. Asset counts check
    const states = this.getAssetState();
    for (const s of states) {
      if (
        s.stock < 0 ||
        s.damaged < 0 ||
        s.with_members < 0 ||
        s.lost < 0 ||
        s.scrapped < 0 ||
        s.exchanged < 0
      ) {
        problems.push(`Asset "${s.asset_name}": has negative unit counts.`);
      }
      if (s.mode === 'individual' && s.stock + s.damaged + s.with_members > 1) {
        problems.push(`Asset "${s.asset_name}": individual asset exists more than once.`);
      }
    }

    return problems;
  }
}
