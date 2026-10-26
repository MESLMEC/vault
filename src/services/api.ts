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
import {
  backendApi,
  authStorage,
  LoginRequest,
  TokenResponse,
  EnvelopeOut,
  CostCenterOut,
  MemberOut,
  MembershipPeriodOut,
  AdjustmentOut,
  StandingOut,
} from './backendApi';

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
 * Coordinates between the live FastAPI backend (for endpoints in openapi.json)
 * and the local FinanceEngine (for local simulation or endpoints not yet in backend).
 */
export const api = {
  // -----------------------------------------------------------------------------------
  // Connectivity & Auth Management
  // -----------------------------------------------------------------------------------
  auth: {
    async login(credentials: LoginRequest): Promise<TokenResponse> {
      return await backendApi.login(credentials);
    },
    logout(): void {
      backendApi.logout();
    },
    isAuthenticated(): boolean {
      return !!authStorage.getToken();
    },
    getUsername(): string {
      return authStorage.getUsername();
    },
    getMode(): 'auto' | 'backend' | 'engine' {
      return authStorage.getMode();
    },
    setMode(mode: 'auto' | 'backend' | 'engine'): void {
      authStorage.setMode(mode);
    },
    async checkBackendHealth() {
      return await backendApi.probeHealth();
    },
  },

  // Helper to determine if we should attempt backend API call
  isBackendMode(): boolean {
    const mode = authStorage.getMode();
    if (mode === 'engine') return false;
    // In 'backend' mode always try; in 'auto' mode try if token is present or auto-probing
    return true;
  },

  // -----------------------------------------------------------------------------------
  // Tenures (Backend Phase 11 - Not yet in openapi.json, handled by Engine)
  // -----------------------------------------------------------------------------------
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

  // -----------------------------------------------------------------------------------
  // Envelopes & Balances (Backend Phase 5 & openapi.json)
  // -----------------------------------------------------------------------------------
  async getEnvelopes(): Promise<Envelope[]> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const backendEnvs = await backendApi.getEnvelopes();
        return backendEnvs.map((e) => ({
          id: e.id,
          name: e.name,
          target_cap: e.target_cap,
          alloc_priority: e.alloc_priority,
          is_pool: e.is_pool,
          active: e.active,
        }));
      } catch (err) {
        console.warn('Backend getEnvelopes failed, falling back to engine:', err);
      }
    }
    return getEngine().getEnvelopes();
  },

  async getEnvelopeBalances(): Promise<EnvelopeBalance[]> {
    // Envelope balances derived from engine or sync
    return getEngine().getEnvelopeBalances();
  },

  async createEnvelope(name: string, target_cap: number | null, alloc_priority: number | null): Promise<Envelope> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const env = await backendApi.createEnvelope({ name, target_cap, alloc_priority });
        // Also mirror to local engine to keep UI state consistent
        getEngine().createEnvelope(env.name, env.target_cap, env.alloc_priority);
        return {
          id: env.id,
          name: env.name,
          target_cap: env.target_cap,
          alloc_priority: env.alloc_priority,
          is_pool: env.is_pool,
          active: env.active,
        };
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend createEnvelope failed, falling back to engine:', err);
      }
    }
    return getEngine().createEnvelope(name, target_cap, alloc_priority);
  },

  async renameEnvelope(id: number, name: string): Promise<EnvelopeOut> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const res = await backendApi.renameEnvelope(id, name);
        getEngine().updateEnvelope(id, { name });
        return res;
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend renameEnvelope failed:', err);
      }
    }
    getEngine().updateEnvelope(id, { name });
    const updated = getEngine().getEnvelopes().find((e) => e.id === id);
    return {
      id,
      name: updated?.name || name,
      is_pool: updated?.is_pool || false,
      target_cap: updated?.target_cap ?? null,
      alloc_priority: updated?.alloc_priority ?? null,
      active: updated?.active ?? true,
    };
  },

  async updateEnvelopeSettings(id: number, settings: { target_cap?: number | null; alloc_priority?: number | null }): Promise<EnvelopeOut> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const res = await backendApi.updateEnvelopeSettings(id, settings);
        getEngine().updateEnvelope(id, settings);
        return res;
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend updateEnvelopeSettings failed:', err);
      }
    }
    getEngine().updateEnvelope(id, settings);
    const updated = getEngine().getEnvelopes().find((e) => e.id === id);
    return {
      id,
      name: updated?.name || '',
      is_pool: updated?.is_pool || false,
      target_cap: updated?.target_cap ?? null,
      alloc_priority: updated?.alloc_priority ?? null,
      active: updated?.active ?? true,
    };
  },

  async deactivateEnvelope(id: number): Promise<EnvelopeOut> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const res = await backendApi.deactivateEnvelope(id);
        getEngine().updateEnvelope(id, { active: false });
        return res;
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend deactivateEnvelope failed:', err);
      }
    }
    getEngine().updateEnvelope(id, { active: false });
    const updated = getEngine().getEnvelopes().find((e) => e.id === id);
    return {
      id,
      name: updated?.name || '',
      is_pool: updated?.is_pool || false,
      target_cap: updated?.target_cap ?? null,
      alloc_priority: updated?.alloc_priority ?? null,
      active: false,
    };
  },

  async updateEnvelope(
    id: number,
    updates: { name?: string; target_cap?: number | null; alloc_priority?: number | null; active?: boolean }
  ): Promise<void> {
    if (updates.name) {
      await this.renameEnvelope(id, updates.name);
    }
    if (updates.target_cap !== undefined || updates.alloc_priority !== undefined) {
      await this.updateEnvelopeSettings(id, {
        target_cap: updates.target_cap,
        alloc_priority: updates.alloc_priority,
      });
    }
    if (updates.active === false) {
      await this.deactivateEnvelope(id);
    }
    getEngine().updateEnvelope(id, updates);
  },

  // -----------------------------------------------------------------------------------
  // Cost Centers (Backend Phase 5 & openapi.json)
  // -----------------------------------------------------------------------------------
  async getCostCenters(params?: { kind?: CostCenter['kind']; status?: CostCenter['status'] }): Promise<CostCenter[]> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const ccs = await backendApi.getCostCenters(params);
        return ccs.map((cc) => ({
          id: cc.id,
          name: cc.name,
          kind: cc.kind,
          status: cc.status,
        }));
      } catch (err) {
        console.warn('Backend getCostCenters failed, falling back to engine:', err);
      }
    }
    return getEngine().getCostCenters();
  },

  async createCostCenter(name: string, kind: CostCenter['kind']): Promise<CostCenter> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const res = await backendApi.createCostCenter({ name, kind });
        getEngine().createCostCenter(res.name, res.kind);
        return {
          id: res.id,
          name: res.name,
          kind: res.kind,
          status: res.status,
        };
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend createCostCenter failed:', err);
      }
    }
    return getEngine().createCostCenter(name, kind);
  },

  async renameCostCenter(id: number, name: string): Promise<CostCenterOut> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        return await backendApi.renameCostCenter(id, name);
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
      }
    }
    const ccs = getEngine().getCostCenters();
    const found = ccs.find((c) => c.id === id);
    if (found) (found as any).name = name;
    return { id, name, kind: found?.kind || 'event', status: found?.status || 'active' };
  },

  async updateCostCenterStatus(id: number, status: CostCenter['status']): Promise<void> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        await backendApi.setCostCenterStatus(id, status as any);
        getEngine().updateCostCenterStatus(id, status);
        return;
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend updateCostCenterStatus failed:', err);
      }
    }
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

  // -----------------------------------------------------------------------------------
  // Members & Standing (Backend Phase 7 & openapi.json)
  // -----------------------------------------------------------------------------------
  async getMembers(): Promise<Member[]> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const mems = await backendApi.getMembers();
        return mems.map((m) => ({
          id: m.id,
          name: m.name,
          batch: m.batch,
          note: m.note,
          created_at: new Date().toISOString(),
        }));
      } catch (err) {
        console.warn('Backend getMembers failed, falling back to engine:', err);
      }
    }
    return getEngine().getMembers();
  },

  async createMember(name: string, startDate: string, batch?: string, note?: string): Promise<Member> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const res = await backendApi.createMember({ name, batch: batch || null, note: note || '' });
        // Start first period
        if (startDate) {
          try {
            await backendApi.startMemberPeriod(res.id, startDate);
          } catch (pErr) {
            console.warn('Start period during member create failed:', pErr);
          }
        }
        getEngine().createMember(name, startDate, batch, note);
        return {
          id: res.id,
          name: res.name,
          batch: res.batch,
          note: res.note,
          created_at: new Date().toISOString(),
        };
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend createMember failed:', err);
      }
    }
    return getEngine().createMember(name, startDate, batch, note);
  },

  async editMember(memberId: number, data: { name?: string; batch?: string | null; note?: string }): Promise<MemberOut> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const res = await backendApi.editMember(memberId, data);
        getEngine().updateMemberDetails(memberId, data);
        return res;
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
      }
    }
    getEngine().updateMemberDetails(memberId, data);
    const m = getEngine().getMembers().find((mem) => mem.id === memberId);
    return { id: memberId, name: m?.name || '', batch: m?.batch || null, note: m?.note || '' };
  },

  async getMemberPeriods(memberId: number): Promise<MembershipPeriodOut[]> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        return await backendApi.getMemberPeriods(memberId);
      } catch (err) {
        console.warn('Backend getMemberPeriods failed:', err);
      }
    }
    const enginePeriods = (getEngine() as any).state?.membership_periods?.filter((p: any) => p.member_id === memberId) || [];
    return enginePeriods;
  },

  async startMembershipPeriod(memberId: number, startDate: string): Promise<MembershipPeriodOut> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        return await backendApi.startMemberPeriod(memberId, startDate);
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
      }
    }
    return { id: Date.now(), member_id: memberId, start_date: startDate, end_date: null };
  },

  async endMembership(memberId: number, endDate: string): Promise<void> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        await backendApi.endMemberPeriod(memberId, endDate);
        getEngine().endMembership(memberId, endDate);
        return;
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend endMembership failed:', err);
      }
    }
    getEngine().endMembership(memberId, endDate);
  },

  async updateMemberDetails(memberId: number, updates: { name?: string; batch?: string | null; note?: string }): Promise<void> {
    await this.editMember(memberId, updates);
  },

  async getMemberStanding(asOfDate?: string): Promise<MemberStanding[]> {
    return this.getDuesOverview(asOfDate);
  },

  async getDuesOverview(_asOfDate?: string): Promise<MemberStanding[]> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const dues = await backendApi.getDues();
        return dues.map((d: StandingOut) => ({
          who_id: d.member_id,
          who_name: d.member_name,
          is_member_now: d.is_member_now,
          weeks_owed: d.weeks_owed,
          owed: d.owed,
          credits: d.credits,
          balance: d.balance,
          weeks_overdue: d.weeks_overdue,
          oldest_unpaid_week: d.oldest_unpaid_week,
        }));
      } catch (err) {
        console.warn('Backend getDues failed, falling back to engine:', err);
      }
    }
    return getEngine().getDuesOverview(_asOfDate);
  },

  async getMemberAdjustments(memberId?: number): Promise<MemberAdjustment[]> {
    if (memberId && this.isBackendMode() && authStorage.getToken()) {
      try {
        const adjs = await backendApi.getMemberAdjustments(memberId);
        return adjs.map((a: AdjustmentOut) => ({
          id: a.id,
          member_id: a.member_id,
          kind: a.kind,
          amount: a.amount,
          occurred_on: a.occurred_on,
          recorded_at: a.recorded_at,
          recorded_by: a.recorded_by,
          note: a.note,
        }));
      } catch (err) {
        console.warn('Backend getMemberAdjustments failed:', err);
      }
    }
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
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const res = await backendApi.addMemberAdjustment(params.memberId, {
          kind: params.kind,
          amount: params.amount,
          occurred_on: params.occurredOn,
          note: params.note,
        });
        getEngine().addMemberAdjustment(
          params.memberId,
          params.kind,
          params.amount,
          params.occurredOn,
          params.recordedBy,
          params.note
        );
        return {
          id: res.id,
          member_id: res.member_id,
          kind: res.kind,
          amount: res.amount,
          occurred_on: res.occurred_on,
          recorded_at: res.recorded_at,
          recorded_by: res.recorded_by,
          note: res.note,
        };
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend addMemberAdjustment failed:', err);
      }
    }
    return getEngine().addMemberAdjustment(
      params.memberId,
      params.kind,
      params.amount,
      params.occurredOn,
      params.recordedBy,
      params.note
    );
  },

  // -----------------------------------------------------------------------------------
  // Fee Rates & Shutdowns (Backend Phase 7 & openapi.json)
  // -----------------------------------------------------------------------------------
  async getFeeRates(): Promise<FeeRate[]> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const rates = await backendApi.getFeeRates();
        return rates.map((r) => ({
          id: r.id,
          effective_from: r.effective_from,
          amount: r.amount,
          recorded_at: r.recorded_at,
          recorded_by: r.recorded_by,
        }));
      } catch (err) {
        console.warn('Backend getFeeRates failed:', err);
      }
    }
    return getEngine().getFeeRates();
  },

  async addFeeRate(effectiveFrom: string, amount: number, recordedBy: string): Promise<FeeRate> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const res = await backendApi.addFeeRate({ effective_from: effectiveFrom, amount });
        getEngine().addFeeRate(effectiveFrom, amount, recordedBy);
        return {
          id: res.id,
          effective_from: res.effective_from,
          amount: res.amount,
          recorded_at: res.recorded_at,
          recorded_by: res.recorded_by,
        };
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend addFeeRate failed:', err);
      }
    }
    return getEngine().addFeeRate(effectiveFrom, amount, recordedBy);
  },

  async getShutdownEvents(): Promise<ShutdownEvent[]> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const events = await backendApi.getShutdownWeeks();
        return events.map((e) => ({
          id: e.id,
          week_start: e.week_start,
          is_shutdown: e.is_shutdown,
          reason: e.reason || '',
          recorded_at: e.recorded_at,
          recorded_by: e.recorded_by,
        }));
      } catch (err) {
        console.warn('Backend getShutdownWeeks failed:', err);
      }
    }
    return getEngine().getShutdownEvents();
  },

  async setShutdown(params: {
    fromWeek: string;
    toWeek: string;
    isShutdown: boolean;
    recordedBy: string;
    reason?: string;
  }): Promise<number> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const res = await backendApi.setShutdownWeeks({
          from_week: params.fromWeek,
          to_week: params.toWeek,
          is_shutdown: params.isShutdown,
          reason: params.reason || null,
        });
        getEngine().setShutdown(
          params.fromWeek,
          params.toWeek,
          params.isShutdown,
          params.recordedBy,
          params.reason
        );
        return res.weeks;
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend setShutdownWeeks failed:', err);
      }
    }
    return getEngine().setShutdown(
      params.fromWeek,
      params.toWeek,
      params.isShutdown,
      params.recordedBy,
      params.reason
    );
  },

  // -----------------------------------------------------------------------------------
  // Ledger & Transactions (Backend Phase 6, 7 & openapi.json)
  // -----------------------------------------------------------------------------------
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
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        if (params.kind === 'deposit') {
          const line = params.lines[0];
          await backendApi.recordDeposit({
            amount: Math.abs(line?.amount || 0),
            envelope_id: line?.envelope_id || 1,
            occurred_on: params.occurred_on,
            cost_center_id: params.cost_center_id,
            member_id: params.member_id,
            source: params.source,
            tag: params.tag,
            note: params.note,
          });
        } else if (params.kind === 'expense') {
          const line = params.lines[0];
          await backendApi.recordExpense({
            amount: Math.abs(line?.amount || 0),
            envelope_id: line?.envelope_id || 1,
            occurred_on: params.occurred_on,
            cost_center_id: params.cost_center_id,
            tag: params.tag,
            note: params.note,
          });
        } else if (params.kind === 'transfer') {
          const fromLine = params.lines.find((l) => l.amount < 0);
          const toLine = params.lines.find((l) => l.amount > 0);
          await backendApi.recordTransfer({
            amount: Math.abs(fromLine?.amount || 0),
            from_envelope_id: fromLine?.envelope_id || 1,
            to_envelope_id: toLine?.envelope_id || 2,
            occurred_on: params.occurred_on,
            cost_center_id: params.cost_center_id,
            tag: params.tag,
            note: params.note || 'Envelope transfer',
          });
        }
        // Mirror to local engine
        return getEngine().recordTransaction(params);
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend recordTransaction failed, falling back:', err);
      }
    }
    return getEngine().recordTransaction(params);
  },

  async recordRefund(params: {
    amount: number;
    occurred_on: string;
    member_id: number;
    cost_center_id?: number | null;
    tag?: string | null;
    note?: string | null;
    recorded_by?: string;
  }): Promise<LedgerTransaction> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        await backendApi.recordRefund({
          amount: params.amount,
          occurred_on: params.occurred_on,
          member_id: params.member_id,
          cost_center_id: params.cost_center_id,
          tag: params.tag,
          note: params.note,
        });
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend recordRefund failed:', err);
      }
    }
    const pool = getEngine().getEnvelopes().find((e) => e.is_pool);
    return getEngine().recordTransaction({
      kind: 'expense',
      occurred_on: params.occurred_on,
      recorded_by: params.recorded_by || 'Treasurer',
      note: params.note || `Fee credit refund to member #${params.member_id}`,
      tag: params.tag || null,
      cost_center_id: params.cost_center_id || null,
      source: null,
      member_id: params.member_id,
      lines: [{ envelope_id: pool?.id || 1, amount: -Math.abs(params.amount) }],
    });
  },

  async fixAmount(params: {
    transactionId: number;
    newLines: Array<{ envelope_id: number; amount: number }>;
    newNote?: string;
    by: string;
  }): Promise<{ reversal: LedgerTransaction; replacement: LedgerTransaction }> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const positiveAmount = Math.abs(params.newLines[0]?.amount || 0);
        await backendApi.fixAmount(params.transactionId, {
          amount: positiveAmount,
          occurred_on: new Date().toISOString().split('T')[0],
          note: params.newNote || null,
        });
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend fixAmount failed:', err);
      }
    }
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
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        await backendApi.editLabels(params.transactionId, {
          occurred_on: params.occurred_on,
          note: params.note,
          tag: params.tag,
          cost_center_id: params.cost_center_id,
          source: params.source,
        });
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend editLabels failed:', err);
      }
    }
    getEngine().editTransactionLabel(params);
  },

  // -----------------------------------------------------------------------------------
  // Allocation Sessions (Backend Phase 8 & openapi.json)
  // -----------------------------------------------------------------------------------
  async getAllocationContext(): Promise<AllocationContext> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const ctx = await backendApi.getAllocationContext();
        return {
          pool_balance: ctx.pool_balance,
          member_credit_held: ctx.member_credit_held,
          pool_after_member_credit: ctx.pool_after_member_credit,
        };
      } catch (err) {
        console.warn('Backend getAllocationContext failed:', err);
      }
    }
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

  // -----------------------------------------------------------------------------------
  // Assets & Equipment (Backend Phase 9 - Not yet in openapi.json, handled by Engine)
  // -----------------------------------------------------------------------------------
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

  // -----------------------------------------------------------------------------------
  // Trust & Reconciliation (Backend Phase 10 - Not yet in openapi.json, handled by Engine)
  // -----------------------------------------------------------------------------------
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

  // -----------------------------------------------------------------------------------
  // Backup & Restore
  // -----------------------------------------------------------------------------------
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
