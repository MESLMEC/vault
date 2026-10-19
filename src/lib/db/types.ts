// =====================================================================================
// MESL LAB FINANCE TYPES  -  Maps 1:1 to PostgreSQL 16 schema
// =====================================================================================

export interface Tenure {
  id: number;
  name: string;
  opened_on: string; // YYYY-MM-DD
  closed_on: string | null;
  closed_at: string | null; // ISO timestamp
  closing_checksum: string | null;
}

export interface Envelope {
  id: number;
  name: string;
  target_cap: number | null;
  alloc_priority: number | null;
  is_pool: boolean;
  active: boolean;
}

export type CostCenterKind = 'event' | 'member_project' | 'lab_project' | 'competition';
export type CostCenterStatus = 'planned' | 'active' | 'completed' | 'cancelled';

export interface CostCenter {
  id: number;
  name: string;
  kind: CostCenterKind;
  status: CostCenterStatus;
}

export interface Member {
  id: number;
  name: string;
  batch: string | null;
  note: string;
  created_at: string;
}

export interface MembershipPeriod {
  id: number;
  member_id: number;
  start_date: string; // YYYY-MM-DD
  end_date: string | null;
}

export interface FeeRate {
  id: number;
  effective_from: string; // Sunday YYYY-MM-DD
  amount: number;
  recorded_at: string;
  recorded_by: string;
}

export interface ShutdownEvent {
  id: number;
  week_start: string; // Sunday YYYY-MM-DD
  is_shutdown: boolean;
  reason: string;
  recorded_at: string;
  recorded_by: string;
}

export type AdjustmentKind = 'waiver' | 'credit_donation' | 'opening' | 'correction';

export interface MemberAdjustment {
  id: number;
  member_id: number;
  kind: AdjustmentKind;
  amount: number; // + adds credit, - removes credit
  occurred_on: string;
  recorded_at: string;
  recorded_by: string;
  note: string;
}

export type EntryKind = 'deposit' | 'expense' | 'transfer' | 'sweep' | 'opening' | 'reversal';
export type IncomeSource = 'weekly_fee' | 'registration' | 'sponsorship' | 'admin_grant' | 'donation' | 'other';

export interface LedgerTransaction {
  id: number;
  tenure_id: number;
  kind: EntryKind;
  occurred_on: string;
  recorded_at: string;
  recorded_by: string;
  note: string;
  tag: string | null;
  cost_center_id: number | null;
  source: IncomeSource | null;
  member_id: number | null;
  reverses_id: number | null;
  replaces_id: number | null;
}

export interface LedgerLine {
  id: number;
  transaction_id: number;
  envelope_id: number;
  amount: number; // Signed integer (whole Taka)
}

export interface LedgerLabelEdit {
  id: number;
  transaction_id: number;
  field: string;
  old_value: string | null;
  new_value: string | null;
  edited_at: string;
  edited_by: string;
}

export interface AllocationSession {
  ledger_transaction_id: number;
  recorded_at: string;
  recorded_by: string;
}

export type AssetMode = 'individual' | 'counted';
export type AssetOwner = 'lab' | 'admin';
export type AssetEventKind =
  | 'acquired'
  | 'lent'
  | 'returned'
  | 'damaged'
  | 'lost'
  | 'repaired'
  | 'scrapped'
  | 'exchanged'
  | 'correction';
export type AcquireSource = 'purchase' | 'admin' | 'project_return' | 'donation' | 'replacement' | 'other';

export interface Asset {
  id: number;
  name: string;
  mode: AssetMode;
  ownership: AssetOwner;
  tag: string | null;
  note: string;
  created_at: string;
}

export interface AssetEvent {
  id: number;
  asset_id: number;
  kind: AssetEventKind;
  quantity: number;
  member_id: number | null;
  cost_center_id: number | null;
  occurred_on: string;
  recorded_at: string;
  recorded_by: string;
  note: string;
  source: AcquireSource | null;
  ledger_transaction_id: number | null;
  reverses_id: number | null;
  replaces_id: number | null;
}

export interface AssetLabelEdit {
  id: number;
  event_id: number;
  field: string;
  old_value: string | null;
  new_value: string | null;
  edited_at: string;
  edited_by: string;
}

export interface TenureMemberSnapshot {
  tenure_id: number;
  member_id: number;
  as_of: string;
  weeks_owed: number;
  owed: number;
  credits: number;
  balance: number;
  weeks_overdue: number;
}

export interface TenureAssetSnapshot {
  tenure_id: number;
  asset_id: number;
  as_of: string;
  stock: number;
  damaged: number;
  held: number;
  lost: number;
  scrapped: number;
  exchanged: number;
}

export interface TenureHoldingSnapshot {
  tenure_id: number;
  asset_id: number;
  member_id: number;
  quantity: number;
}

export interface Reconciliation {
  id: number;
  tenure_id: number;
  through_entry_id: number;
  checked_on: string;
  system_total: number;
  counted_total: number;
  difference: number;
  matched: boolean;
  recorded_at: string;
  recorded_by: string;
  note: string;
}

export interface ReconciliationEnvelope {
  reconciliation_id: number;
  envelope_id: number;
  system_balance: number;
  counted: number;
}

// =====================================================================================
// DERIVED VIEW MODELS
// =====================================================================================

export interface EnvelopeBalance {
  id: number;
  name: string;
  target_cap: number | null;
  alloc_priority: number | null;
  is_pool: boolean;
  active: boolean;
  balance: number;
}

export interface LedgerEntryView extends LedgerTransaction {
  lines: LedgerLine[];
  is_voided: boolean;
  corrected_from: number | null;
  cost_center_name?: string;
  member_name?: string;
  source_label?: string;
}

export interface MemberStanding {
  who_id: number;
  who_name: string;
  is_member_now: boolean;
  weeks_owed: number;
  owed: number;
  credits: number;
  balance: number; // positive = credit, negative = arrears
  weeks_overdue: number;
  oldest_unpaid_week: string | null;
}

export interface CostCenterSummary {
  cost_center_id: number;
  name: string;
  kind: CostCenterKind;
  status: CostCenterStatus;
  money_in: number;
  money_out: number;
  swept: number;
  leftover: number;
}

export interface AssetState {
  asset_id: number;
  asset_name: string;
  ownership: AssetOwner;
  mode: AssetMode;
  tag: string | null;
  stock: number;
  damaged: number;
  with_members: number;
  lost: number;
  scrapped: number;
  exchanged: number;
}

export interface AssetHolding {
  asset_id: number;
  asset_name: string;
  member_id: number;
  member_name: string;
  quantity: number;
}

export interface ReconciliationStatus {
  last_match_id: number | null;
  last_match_date: string | null;
  last_match_through_entry: number | null;
  days_since_last_match: number | null;
  entries_since_last_match: number;
  latest_attempt_matched: boolean | null;
  latest_difference: number | null;
}

export interface DifferenceSuspect {
  entry_id: number;
  kind: EntryKind;
  occurred_on: string;
  effect: number;
  note: string;
  why: string;
}

export interface AllocationSuggestionRow {
  envelope_id: number;
  envelope_name: string;
  balance: number;
  target_cap: number | null;
  alloc_priority: number | null;
  gap: number | null;
  phase: 'cap_fill' | 'share' | 'none';
  suggested: number;
}

export interface AllocationContext {
  pool_balance: number;
  member_credit_held: number;
  pool_after_member_credit: number;
}
