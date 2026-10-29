import { FinanceEngine, STORAGE_KEY } from '../lib/db/engine';
import { getCleanInitialData, getSeedData } from '../lib/db/seed';
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
  AssetMode,
  AssetOwner,
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
  AssetOut,
  AssetStateOut,
  WhoHasWhatOut,
  AssetActivityOut,
  CostCenterSummaryOut,
  ReconciliationStatusOut,
  UnverifiedEntryOut,
  DifferenceSuspectOut,
  CloseTenureOut,
  TenureOut,
  AssetSnapshotOut,
  HoldingSnapshotOut,
  MemberSnapshotOut,
} from './backendApi';

// Initialize singleton engine with clean state
let engineInstance: FinanceEngine | null = null;

export function getEngine(): FinanceEngine {
  if (!engineInstance) {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('mesl_vault_state_v4');
        localStorage.removeItem('mesl_vault_clean_v2');
        localStorage.removeItem('mesl_lab_finance_v1');
      } catch {}
    }
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!stored) {
      engineInstance = new FinanceEngine(getCleanInitialData());
      engineInstance.saveToStorage();
    } else {
      engineInstance = new FinanceEngine();
      const active = engineInstance.getTenures().find((t) => t.closed_on === null);
      if (active && (active.opened_on === '2026-09-20' || active.opened_on === '2026-10-20')) {
        active.opened_on = '2025-04-13';
        active.name = '2025-2026';
        engineInstance.saveToStorage();
      }
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
      try {
        return await backendApi.login(credentials);
      } catch (err: any) {
        // If the backend is unreachable and mode is auto/engine, provide local session fallback
        const isOffline = err?.reason?.includes('unreachable') || err?.message?.includes('Cannot connect');
        const mode = authStorage.getMode();
        if ((mode === 'engine' || (mode === 'auto' && isOffline)) && credentials.username) {
          if (credentials.password === 'change-me' || credentials.password.length >= 6) {
            const mockToken: TokenResponse = {
              access_token: `local_session_${Date.now()}`,
              token_type: 'bearer',
              expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
            };
            authStorage.setToken(mockToken.access_token);
            authStorage.setUsername(credentials.username);
            return mockToken;
          } else {
            const credErr: any = new Error('Invalid credentials.');
            credErr.reason = 'Invalid credentials for local session (default: change-me)';
            throw credErr;
          }
        }
        throw err;
      }
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
  // Tenures (Backend Phase 11 & openapi.json)
  // -----------------------------------------------------------------------------------
  async getTenures(): Promise<Tenure[]> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const tenures = await backendApi.getTenures();
        if (tenures && tenures.length > 0) {
          const engine = getEngine();
          const activeBackend = tenures.find((t) => t.closed_on === null);
          const activeEngine = engine.getTenures().find((t) => t.closed_on === null);
          if (activeBackend && activeEngine && activeEngine.opened_on !== activeBackend.opened_on) {
            activeEngine.id = activeBackend.id;
            activeEngine.name = activeBackend.name;
            activeEngine.opened_on = activeBackend.opened_on;
            engine.saveToStorage();
          }
        }
        return tenures as Tenure[];
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend getTenures failed, falling back to engine:', err);
      }
    }
    return getEngine().getTenures();
  },

  async getOpenTenure(): Promise<Tenure> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const openTenure = await backendApi.getOpenTenure();
        if (openTenure) {
          const engine = getEngine();
          const activeEngine = engine.getTenures().find((t) => t.closed_on === null);
          if (activeEngine && activeEngine.opened_on !== openTenure.opened_on) {
            activeEngine.id = openTenure.id;
            activeEngine.name = openTenure.name;
            activeEngine.opened_on = openTenure.opened_on;
            engine.saveToStorage();
          }
        }
        return openTenure as Tenure;
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend getOpenTenure failed, falling back to engine:', err);
      }
    }
    return getEngine().getOpenTenure();
  },

  async closeTenure(params: {
    closeOn: string;
    by: string;
    nextName: string;
  }): Promise<{ newTenureId: number; checksum: string }> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const out = await backendApi.closeTenure({
          close_on: params.closeOn,
          next_name: params.nextName,
        });
        const engineResult = await getEngine().closeTenure(params);
        return {
          newTenureId: out.id || engineResult.newTenureId,
          checksum: engineResult.checksum,
        };
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend closeTenure failed, falling back to engine:', err);
      }
    }
    return await getEngine().closeTenure(params);
  },

  async getTenureAssetSnapshots(tenureId: number): Promise<AssetSnapshotOut[]> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        return await backendApi.getTenureAssetSnapshots(tenureId);
      } catch (err) {
        console.warn('Backend getTenureAssetSnapshots failed:', err);
      }
    }
    return getEngine()
      .getRawState()
      .tenure_asset_snapshots.filter((s) => s.tenure_id === tenureId) as any;
  },

  async getTenureHoldingSnapshots(tenureId: number): Promise<HoldingSnapshotOut[]> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        return await backendApi.getTenureHoldingSnapshots(tenureId);
      } catch (err) {
        console.warn('Backend getTenureHoldingSnapshots failed:', err);
      }
    }
    return getEngine()
      .getRawState()
      .tenure_holding_snapshots.filter((s) => s.tenure_id === tenureId) as any;
  },

  async getTenureMemberSnapshots(tenureId: number): Promise<MemberSnapshotOut[]> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        return await backendApi.getTenureMemberSnapshots(tenureId);
      } catch (err) {
        console.warn('Backend getTenureMemberSnapshots failed:', err);
      }
    }
    return getEngine()
      .getRawState()
      .tenure_member_snapshots.filter((s) => s.tenure_id === tenureId) as any;
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
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const [envelopes, context] = await Promise.all([
          backendApi.getEnvelopes(),
          backendApi.getAllocationContext(),
        ]);
        let suggestions: Array<{ envelope_id: number; balance: number }> = [];
        try {
          suggestions = await backendApi.getAllocationSuggestion({ amount: 1 });
        } catch {
          // ignore draft allocation errors if empty/unavailable
        }
        const balMap = new Map<number, number>();
        for (const s of suggestions) {
          balMap.set(s.envelope_id, s.balance);
        }
        return envelopes.map((env) => ({
          id: env.id,
          name: env.name,
          balance: env.is_pool ? context.pool_balance : (balMap.get(env.id) ?? 0),
          target_cap: env.target_cap,
          alloc_priority: env.alloc_priority,
          is_pool: env.is_pool,
          active: env.active,
        }));
      } catch (err) {
        console.warn('Backend getEnvelopeBalances failed, falling back to engine:', err);
      }
    }
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

  async updateCostCenterKind(id: number, kind: CostCenter['kind']): Promise<CostCenterOut> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const res = await backendApi.setCostCenterKind(id, kind);
        getEngine().updateCostCenterKind(id, kind);
        return res;
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend updateCostCenterKind failed, updating locally:', err);
      }
    }
    getEngine().updateCostCenterKind(id, kind);
    const found = getEngine().getCostCenters().find((c) => c.id === id);
    return { id, name: found?.name || '', kind, status: found?.status || 'active' };
  },

  async getCostCenterSummary(costCenterId?: number): Promise<CostCenterSummary[]> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        if (costCenterId != null) {
          const s = await backendApi.getCostCenterSummary(costCenterId);
          return [s as CostCenterSummary];
        }
        const ccs = await backendApi.getCostCenters();
        const summaries = await Promise.all(
          ccs.map((cc) => backendApi.getCostCenterSummary(cc.id))
        );
        return summaries as CostCenterSummary[];
      } catch (err) {
        console.warn('Backend getCostCenterSummary failed, falling back to engine:', err);
      }
    }
    return getEngine().getCostCenterSummary();
  },

  async sweepLeftover(params: {
    costCenterId: number;
    fromEnvelopeId: number;
    by: string;
    date: string;
    note: string;
  }): Promise<LedgerTransaction> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        await backendApi.recordSweep({
          cost_center_id: params.costCenterId,
          from_envelope_id: params.fromEnvelopeId,
          note: params.note,
          occurred_on: params.date,
        });
        return getEngine().sweepLeftover(params);
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend sweepLeftover failed, falling back to engine:', err);
      }
    }
    return getEngine().sweepLeftover(params);
  },

  // -----------------------------------------------------------------------------------
  // Members & Standing (Backend Phase 7 & openapi.json)
  // -----------------------------------------------------------------------------------
  async getMembers(): Promise<Member[]> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const mems = await backendApi.getMembers();
        const mapped: Member[] = mems.map((m) => ({
          id: m.id,
          name: m.name,
          batch: m.batch,
          note: m.note,
          created_at: new Date().toISOString(),
        }));
        getEngine().syncMembers(mapped);
        return mapped;
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
        const createdMem: Member = {
          id: res.id,
          name: res.name,
          batch: res.batch,
          note: res.note,
          created_at: new Date().toISOString(),
        };
        getEngine().syncMembers([createdMem]);
        return createdMem;
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
        try {
          getEngine().addFeeRate(effectiveFrom, amount, recordedBy);
        } catch (engineErr) {
          console.warn('Engine addFeeRate local mirror notice:', engineErr);
        }
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
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const [entries, members, ccs, envelopes, rawLines] = await Promise.all([
          backendApi.getEntries(),
          this.getMembers(),
          this.getCostCenters(),
          this.getEnvelopes(),
          backendApi.getLedgerLines().catch(() => []),
        ]);
        const memberMap = new Map(members.map((m) => [m.id, m.name]));
        const ccMap = new Map(ccs.map((c) => [c.id, c.name]));
        const pool = envelopes.find((e) => e.is_pool) || envelopes[0];

        const linesMap = new Map<number, Array<{ id: number; transaction_id: number; envelope_id: number; amount: number }>>();
        for (const l of rawLines) {
          const list = linesMap.get(l.transaction_id) || [];
          list.push(l);
          linesMap.set(l.transaction_id, list);
        }

        return entries.map((e) => {
          const lines = linesMap.get(e.id) || [
            { id: e.id, transaction_id: e.id, envelope_id: pool?.id || 1, amount: 0 },
          ];
          return {
            id: e.id,
            tenure_id: e.tenure_id,
            kind: e.kind,
            occurred_on: e.occurred_on,
            recorded_at: e.recorded_at,
            recorded_by: e.recorded_by,
            note: e.note,
            tag: e.tag,
            cost_center_id: e.cost_center_id,
            source: e.source,
            member_id: e.member_id,
            reverses_id: null,
            replaces_id: e.corrected_from,
            lines,
            is_voided: false,
            corrected_from: e.corrected_from,
            cost_center_name: e.cost_center_id ? ccMap.get(e.cost_center_id) : undefined,
            member_name: e.member_id ? memberMap.get(e.member_id) : undefined,
            source_label: e.source ? e.source.replace('_', ' ') : undefined,
          };
        }).sort((a, b) => b.id - a.id);
      } catch (err) {
        console.warn('Backend getEntries failed, falling back to engine:', err);
      }
    }
    return getEngine().getEntriesCurrent();
  },

  async getAllTransactions(): Promise<LedgerEntryView[]> {
    if (this.isBackendMode() && authStorage.getToken()) {
      return this.getEntriesCurrent();
    }
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
            envelope_id: params.source === 'weekly_fee' ? undefined : (line?.envelope_id || undefined),
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
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const rows = await backendApi.getAllocationSuggestion({ amount, shares });
        return rows.map((r) => ({
          envelope_id: r.envelope_id,
          envelope_name: r.envelope_name,
          balance: r.balance,
          target_cap: r.target_cap,
          alloc_priority: r.alloc_priority,
          gap: r.gap,
          phase: r.phase as any,
          suggested: r.suggested,
        }));
      } catch (err) {
        console.warn('Backend getAllocationSuggestion failed:', err);
      }
    }
    return getEngine().getAllocationSuggestion(amount, shares);
  },

  async allocate(params: {
    by: string;
    date: string;
    note: string;
    amounts: Record<number, number>;
  }): Promise<LedgerTransaction> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const strAmounts: Record<string, number> = {};
        for (const [k, v] of Object.entries(params.amounts)) {
          if (v > 0) strAmounts[k] = v;
        }
        await backendApi.confirmAllocation({
          amounts: strAmounts,
          note: params.note,
          occurred_on: params.date,
        });
        return getEngine().allocate(params);
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend allocate failed:', err);
      }
    }
    return getEngine().allocate(params);
  },

  // -----------------------------------------------------------------------------------
  // Assets & Equipment (Backend Phase 9 & openapi.json)
  // -----------------------------------------------------------------------------------
  async getAssets(): Promise<Asset[]> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const assets = await backendApi.getAssets();
        return assets.map((a) => ({
          id: a.id,
          name: a.name,
          mode: a.mode as Asset['mode'],
          ownership: a.ownership as Asset['ownership'],
          tag: a.tag,
          note: a.note,
          created_at: new Date().toISOString(),
        }));
      } catch (err) {
        console.warn('Backend getAssets failed:', err);
      }
    }
    return getEngine().getAssets();
  },

  async getAssetState(asOfDate?: string): Promise<AssetState[]> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const states = await backendApi.getAssetState();
        return states.map((s) => ({
          asset_id: s.asset_id,
          asset_name: s.asset_name,
          ownership: s.ownership as Asset['ownership'],
          mode: s.mode as Asset['mode'],
          tag: s.tag,
          stock: s.stock,
          damaged: s.damaged,
          with_members: s.with_members,
          lost: s.lost,
          scrapped: s.scrapped,
          exchanged: s.exchanged,
        }));
      } catch (err) {
        console.warn('Backend getAssetState failed:', err);
      }
    }
    return getEngine().getAssetState(asOfDate);
  },

  async getAssetHoldings(asOfDate?: string): Promise<AssetHolding[]> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const holdings = await backendApi.getAssetHoldings();
        return holdings.map((h) => ({
          asset_id: h.asset_id,
          asset_name: h.asset_name,
          member_id: h.member_id,
          member_name: h.member_name,
          quantity: h.quantity,
        }));
      } catch (err) {
        console.warn('Backend getAssetHoldings failed:', err);
      }
    }
    return getEngine().getAssetHoldings(asOfDate);
  },

  async getAdminReplacementQueue(): Promise<AssetState[]> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const queue = await backendApi.getReplacementQueue();
        return queue.map((s) => ({
          asset_id: s.asset_id,
          asset_name: s.asset_name,
          ownership: s.ownership as Asset['ownership'],
          mode: s.mode as Asset['mode'],
          tag: s.tag,
          stock: s.stock,
          damaged: s.damaged,
          with_members: s.with_members,
          lost: s.lost,
          scrapped: s.scrapped,
          exchanged: s.exchanged,
        }));
      } catch (err) {
        console.warn('Backend getAdminReplacementQueue failed:', err);
      }
    }
    return getEngine().getAdminReplacementQueue();
  },

  async createAsset(params: {
    name: string;
    mode: Asset['mode'];
    ownership: Asset['ownership'];
    tag?: string | null;
    note?: string;
  }): Promise<Asset> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const out = await backendApi.createAsset({
          name: params.name,
          mode: params.mode,
          ownership: params.ownership,
          tag: params.tag ?? null,
          note: params.note,
        });
        const created = getEngine().createAsset(params);
        return {
          ...created,
          id: out.id || created.id,
          name: out.name,
          mode: out.mode as Asset['mode'],
          ownership: out.ownership as Asset['ownership'],
          tag: out.tag,
          note: out.note,
        };
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend createAsset failed, falling back to engine:', err);
      }
    }
    return getEngine().createAsset(params);
  },

  async editAsset(
    assetId: number,
    data: { name?: string; mode?: Asset['mode']; ownership?: Asset['ownership']; tag?: string | null; note?: string }
  ): Promise<AssetOut> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const out = await backendApi.editAsset(assetId, data);
        const asset = getEngine().getAssets().find((a) => a.id === assetId);
        if (asset) {
          if (data.name !== undefined) asset.name = data.name;
          if (data.mode !== undefined) asset.mode = data.mode;
          if (data.ownership !== undefined) asset.ownership = data.ownership;
          if (data.tag !== undefined) asset.tag = data.tag;
          if (data.note !== undefined) asset.note = data.note;
          getEngine().saveToStorage();
        }
        return out;
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend editAsset failed:', err);
      }
    }
    const asset = getEngine().getAssets().find((a) => a.id === assetId);
    if (asset) {
      if (data.name !== undefined) asset.name = data.name;
      if (data.mode !== undefined) asset.mode = data.mode;
      if (data.ownership !== undefined) asset.ownership = data.ownership;
      if (data.tag !== undefined) asset.tag = data.tag;
      if (data.note !== undefined) asset.note = data.note;
      getEngine().saveToStorage();
    }
    return {
      id: assetId,
      name: data.name ?? asset?.name ?? '',
      mode: (data.mode ?? asset?.mode ?? 'individual') as AssetMode,
      ownership: (data.ownership ?? asset?.ownership ?? 'lab') as AssetOwner,
      tag: data.tag !== undefined ? data.tag : asset?.tag ?? null,
      note: data.note ?? asset?.note ?? '',
    };
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
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        await backendApi.recordAssetEvent(params.asset_id, {
          kind: params.kind,
          quantity: params.quantity,
          occurred_on: params.occurred_on,
          note: params.note,
          member_id: params.member_id,
          source: params.source,
          ledger_transaction_id: params.ledger_transaction_id,
        });
        return getEngine().recordAssetEvent(params);
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend recordAssetEvent failed:', err);
      }
    }
    return getEngine().recordAssetEvent(params);
  },

  async fixAssetEvent(params: {
    asset_id: number;
    event_id: number;
    quantity: number;
    occurred_on: string;
    note?: string;
  }): Promise<any> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        return await backendApi.fixAssetEvent(params.asset_id, params.event_id, {
          quantity: params.quantity,
          occurred_on: params.occurred_on,
          note: params.note,
        });
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend fixAssetEvent failed:', err);
      }
    }
    return { ok: true };
  },

  async getAssetActivity(fromDate?: string, toDate?: string): Promise<AssetActivityOut[]> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        return await backendApi.getAssetActivity({ from_date: fromDate, to_date: toDate });
      } catch (err) {
        console.warn('Backend getAssetActivity failed:', err);
      }
    }
    return [];
  },

  // -----------------------------------------------------------------------------------
  // Trust & Reconciliation (Backend Phase 10 & openapi.json)
  // -----------------------------------------------------------------------------------
  async getReconciliations(): Promise<Reconciliation[]> {
    return getEngine().getReconciliations();
  },

  async getReconciliationStatus(): Promise<ReconciliationStatus> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const s = await backendApi.getReconciliationStatus();
        return {
          last_match_id: s.last_match_id,
          last_match_date: s.last_match_date,
          last_match_through_entry: s.last_match_through_entry,
          days_since_last_match: s.days_since_last_match,
          entries_since_last_match: s.entries_since_last_match,
          latest_attempt_matched: s.latest_attempt_matched,
          latest_difference: s.latest_difference,
        };
      } catch (err) {
        console.warn('Backend getReconciliationStatus failed, falling back to engine:', err);
      }
    }
    return getEngine().getReconciliationStatus();
  },

  async getUnverifiedEntries() {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        return await backendApi.getUnverifiedEntries();
      } catch (err) {
        console.warn('Backend getUnverifiedEntries failed, falling back to engine:', err);
      }
    }
    return getEngine().getUnverifiedEntries();
  },

  async getDifferenceSuspects(difference: number, envelopeId?: number): Promise<DifferenceSuspect[]> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const suspects = await backendApi.getDifferenceSuspects(difference, envelopeId);
        return suspects.map((s) => ({
          entry_id: s.entry_id,
          kind: s.kind as any,
          occurred_on: s.occurred_on,
          effect: s.effect,
          note: s.note,
          why: s.why,
        }));
      } catch (err) {
        console.warn('Backend getDifferenceSuspects failed, falling back to engine:', err);
      }
    }
    return getEngine().getDifferenceSuspects(difference, envelopeId);
  },

  async recordReconciliation(params: {
    by: string;
    countedTotal: number;
    note?: string;
    countedEnvelopes?: Record<number, number>;
    date?: string;
  }): Promise<Reconciliation> {
    if (this.isBackendMode() && authStorage.getToken()) {
      try {
        const strCounted: Record<string, number> | undefined = params.countedEnvelopes
          ? Object.fromEntries(Object.entries(params.countedEnvelopes).map(([k, v]) => [k, v]))
          : undefined;
        const out = await backendApi.recordReconciliation({
          counted_total: params.countedTotal,
          counted: strCounted,
          note: params.note,
        });
        const rec: Reconciliation = {
          id: out.id,
          tenure_id: 1,
          through_entry_id: out.through_entry_id,
          checked_on: params.date ?? new Date().toISOString().split('T')[0],
          system_total: out.system_total,
          counted_total: out.counted_total,
          difference: out.difference,
          matched: out.matched,
          recorded_at: new Date().toISOString(),
          recorded_by: params.by,
          note: params.note ?? '',
        };
        try {
          getEngine().recordReconciliation(params);
        } catch {
          // ignore local engine mismatch in backend mode
        }
        return rec;
      } catch (err) {
        if (authStorage.getMode() === 'backend') throw err;
        console.warn('Backend recordReconciliation failed, falling back to engine:', err);
      }
    }
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

  resetToClean(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('mesl_vault_state_v4');
        localStorage.removeItem('mesl_vault_clean_v2');
        localStorage.removeItem('mesl_lab_finance_v1');
      } catch {}
    }
    getEngine().loadRawState(getCleanInitialData());
    getEngine().saveToStorage();
  },

  resetToSeed(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('mesl_vault_state_v4');
        localStorage.removeItem('mesl_vault_clean_v2');
        localStorage.removeItem('mesl_lab_finance_v1');
      } catch {}
    }
    getEngine().loadRawState(getCleanInitialData());
    getEngine().saveToStorage();
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
