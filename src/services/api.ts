import { FinanceEngine } from '../lib/db/engine';
import { getSeedData } from '../lib/db/seed';
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
  Asset,
  AssetEvent,
  AssetEventKind,
  AcquireSource,
  Reconciliation,
} from '../lib/db/types';

// Initialize singleton engine
const STORAGE_KEY = 'mesl_lab_finance_v1';
let engineInstance: FinanceEngine | null = null;

export function getEngine(): FinanceEngine {
  if (!engineInstance) {
    // Check if storage exists
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      engineInstance = new FinanceEngine(getSeedData());
      engineInstance.saveToStorage();
    } else {
      engineInstance = new FinanceEngine();
    }
  }
  return engineInstance;
}

/**
 * Service API layer: All UI components call these methods.
 * In future FastAPI integration, replace the engine calls with fetch(`${API_URL}/...`).
 */
export const api = {
  // Tenures
  async getTenures(): Promise<Tenure[]> {
    return getEngine().getTenures();
  },

  async getOpenTenure(): Promise<Tenure> {
    return getEngine().getOpenTenure();
  },

  async closeTenure(params: {
    closeOn: string;
    by: string;
    nextName: string;
  }): Promise<{ newTenureId: number; checksum: string }> {
    return await getEngine().closeTenure(params);
  },

  // Envelopes & Balances
  async getEnvelopes(): Promise<Envelope[]> {
    return getEngine().getEnvelopes();
  },

  async getEnvelopeBalances(): Promise<EnvelopeBalance[]> {
    return getEngine().getEnvelopeBalances();
  },

  async createEnvelope(name: string, target_cap: number | null, alloc_priority: number | null): Promise<Envelope> {
    return getEngine().createEnvelope(name, target_cap, alloc_priority);
  },

  async updateEnvelope(
    id: number,
    updates: { name?: string; target_cap?: number | null; alloc_priority?: number | null; active?: boolean }
  ): Promise<void> {
    getEngine().updateEnvelope(id, updates);
  },

  // Cost Centers
  async getCostCenters(): Promise<CostCenter[]> {
    return getEngine().getCostCenters();
  },

  async createCostCenter(name: string, kind: CostCenter['kind']): Promise<CostCenter> {
    return getEngine().createCostCenter(name, kind);
  },

  async updateCostCenterStatus(id: number, status: CostCenter['status']): Promise<void> {
    getEngine().updateCostCenterStatus(id, status);
  },

  async getCostCenterSummary(): Promise<CostCenterSummary[]> {
    return getEngine().getCostCenterSummary();
  },

  async sweepLeftover(params: {
    costCenterId: number;
    fromEnvelopeId: number;
    by: string;
    date: string;
    note: string;
  }): Promise<LedgerTransaction> {
    return getEngine().sweepLeftover(params);
  },

  // Members & Standing
  async getMembers(): Promise<Member[]> {
    return getEngine().getMembers();
  },

  async createMember(name: string, startDate: string, batch?: string, note?: string): Promise<Member> {
    return getEngine().createMember(name, startDate, batch, note);
  },

  async endMembership(memberId: number, endDate: string): Promise<void> {
    getEngine().endMembership(memberId, endDate);
  },

  async updateMemberDetails(memberId: number, updates: { name?: string; batch?: string | null; note?: string }): Promise<void> {
    getEngine().updateMemberDetails(memberId, updates);
  },

  async getMemberStanding(asOfDate?: string): Promise<MemberStanding[]> {
    return getEngine().getMemberStanding(asOfDate);
  },

  async getDuesOverview(asOfDate?: string): Promise<MemberStanding[]> {
    return getEngine().getDuesOverview(asOfDate);
  },

  async getMemberAdjustments(memberId?: number): Promise<MemberAdjustment[]> {
    return getEngine().getMemberAdjustments(memberId);
  },

  async addMemberAdjustment(params: {
    memberId: number;
    kind: AdjustmentKind;
    amount: number;
    occurredOn: string;
    recordedBy: string;
    note: string;
  }): Promise<MemberAdjustment> {
    return getEngine().addMemberAdjustment(
      params.memberId,
      params.kind,
      params.amount,
      params.occurredOn,
      params.recordedBy,
      params.note
    );
  },

  // Fee Rates & Shutdowns
  async getFeeRates(): Promise<FeeRate[]> {
    return getEngine().getFeeRates();
  },

  async addFeeRate(effectiveFrom: string, amount: number, recordedBy: string): Promise<FeeRate> {
    return getEngine().addFeeRate(effectiveFrom, amount, recordedBy);
  },

  async getShutdownEvents(): Promise<ShutdownEvent[]> {
    return getEngine().getShutdownEvents();
  },

  async setShutdown(params: {
    fromWeek: string;
    toWeek: string;
    isShutdown: boolean;
    recordedBy: string;
    reason?: string;
  }): Promise<number> {
    return getEngine().setShutdown(
      params.fromWeek,
      params.toWeek,
      params.isShutdown,
      params.recordedBy,
      params.reason
    );
  },

  // Ledger
  async getEntriesCurrent(): Promise<LedgerEntryView[]> {
    return getEngine().getEntriesCurrent();
  },

  async getAllTransactions(): Promise<LedgerEntryView[]> {
    return getEngine().getLedgerTransactions();
  },

  async getReversalTrail(transactionId: number): Promise<LedgerEntryView[]> {
    return getEngine().getReversalTrail(transactionId);
  },

  async getLabelEdits(transactionId: number) {
    return getEngine().getLedgerLabelEdits(transactionId);
  },

  async recordTransaction(params: {
    kind: EntryKind;
    occurred_on: string;
    recorded_by: string;
    note?: string;
    tag?: string | null;
    cost_center_id?: number | null;
    source?: IncomeSource | null;
    member_id?: number | null;
    lines: Array<{ envelope_id: number; amount: number }>;
  }): Promise<LedgerTransaction> {
    return getEngine().recordTransaction(params);
  },

  async fixAmount(params: {
    transactionId: number;
    newLines: Array<{ envelope_id: number; amount: number }>;
    newNote?: string;
    by: string;
  }): Promise<{ reversal: LedgerTransaction; replacement: LedgerTransaction }> {
    return getEngine().fixAmount(params);
  },

  async editTransactionLabel(params: {
    transactionId: number;
    by: string;
    note?: string;
    tag?: string | null;
    cost_center_id?: number | null;
    occurred_on?: string;
    source?: IncomeSource | null;
  }): Promise<void> {
    getEngine().editTransactionLabel(params);
  },

  // Allocation Sessions
  async getAllocationContext(): Promise<AllocationContext> {
    return getEngine().getAllocationContext();
  },

  async getAllocationSuggestion(
    amount: number,
    shares?: Record<string, number>
  ): Promise<AllocationSuggestionRow[]> {
    return getEngine().getAllocationSuggestion(amount, shares);
  },

  async allocate(params: {
    by: string;
    date: string;
    note: string;
    amounts: Record<number, number>;
  }): Promise<LedgerTransaction> {
    return getEngine().allocate(params);
  },

  // Assets & Equipment
  async getAssets(): Promise<Asset[]> {
    return getEngine().getAssets();
  },

  async getAssetState(asOfDate?: string): Promise<AssetState[]> {
    return getEngine().getAssetState(asOfDate);
  },

  async getAssetHoldings(asOfDate?: string): Promise<AssetHolding[]> {
    return getEngine().getAssetHoldings(asOfDate);
  },

  async getAdminReplacementQueue(): Promise<AssetState[]> {
    return getEngine().getAdminReplacementQueue();
  },

  async createAsset(params: {
    name: string;
    mode: Asset['mode'];
    ownership: Asset['ownership'];
    tag?: string | null;
    note?: string;
  }): Promise<Asset> {
    return getEngine().createAsset(params);
  },

  async recordAssetEvent(params: {
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
  }): Promise<AssetEvent> {
    return getEngine().recordAssetEvent(params);
  },

  // Trust & Reconciliation
  async getReconciliations(): Promise<Reconciliation[]> {
    return getEngine().getReconciliations();
  },

  async getReconciliationStatus(): Promise<ReconciliationStatus> {
    return getEngine().getReconciliationStatus();
  },

  async getUnverifiedEntries() {
    return getEngine().getUnverifiedEntries();
  },

  async getDifferenceSuspects(difference: number, envelopeId?: number): Promise<DifferenceSuspect[]> {
    return getEngine().getDifferenceSuspects(difference, envelopeId);
  },

  async recordReconciliation(params: {
    by: string;
    countedTotal: number;
    note?: string;
    countedEnvelopes?: Record<number, number>;
    date?: string;
  }): Promise<Reconciliation> {
    return getEngine().recordReconciliation(params);
  },

  async verifyAll(): Promise<string[]> {
    return await getEngine().verifyAll();
  },

  // Backup & Restore
  exportBackupJson(): void {
    const raw = getEngine().getRawState();
    const str = JSON.stringify(raw, null, 2);
    const blob = new Blob([str], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mesl_vault_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importBackupJson(jsonString: string): void {
    try {
      const data = JSON.parse(jsonString);
      getEngine().loadRawState(data);
    } catch {
      throw new Error('Invalid JSON backup file.');
    }
  },

  resetToSeed(): void {
    getEngine().loadRawState(getSeedData());
  },

  exportAdminReplacementCsv(): void {
    const queue = getEngine().getAdminReplacementQueue();
    const headers = ['Asset ID', 'Asset Name', 'Ownership', 'Inventory Tag', 'Damaged Units Pending Replacement'];
    const rows = queue.map((q) => [
      q.asset_id,
      `"${q.asset_name.replace(/"/g, '""')}"`,
      q.ownership,
      `"${(q.tag ?? '').replace(/"/g, '""')}"`,
      q.damaged,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mesl_admin_replacement_queue_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
