/**
 * MESL Vault Backend API Client
 * Generated and typed against mesl-finance-backend/docs/openapi.json (OpenAPI 3.1.0)
 *
 * Handles HTTP requests, JWT authentication, and RFC 9457 error normalization.
 */

import {
  CostCenterKind,
  CostCenterStatus,
  IncomeSource,
  EntryKind,
  AdjustmentKind,
} from '../lib/db/types';

// =====================================================================================
// OPENAPI SCHEMA TYPES
// =====================================================================================

export interface LoginRequest {
  username: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_at: string;
}

export interface EnvelopeOut {
  id: number;
  name: string;
  is_pool: boolean;
  target_cap: number | null;
  alloc_priority: number | null;
  active: boolean;
}

export interface CreateEnvelopeRequest {
  name: string;
  target_cap?: number | null;
  alloc_priority?: number | null;
}

export interface RenameEnvelopeRequest {
  name: string;
}

export interface EnvelopeSettingsRequest {
  target_cap?: number | null;
  alloc_priority?: number | null;
}

export interface CostCenterOut {
  id: number;
  name: string;
  kind: CostCenterKind;
  status: CostCenterStatus;
}

export interface CreateCostCenterRequest {
  name: string;
  kind: CostCenterKind;
}

export interface RenameCostCenterRequest {
  name: string;
}

export interface SetCostCenterStatusRequest {
  status: CostCenterStatus;
}

export interface AllocationContextOut {
  pool_balance: number;
  member_credit_held: number;
  pool_after_member_credit: number;
}

export interface StandingOut {
  member_id: number;
  member_name: string;
  is_member_now: boolean;
  weeks_owed: number;
  owed: number;
  credits: number;
  balance: number;
  weeks_overdue: number;
  oldest_unpaid_week: string | null;
}

export interface FeeRateOut {
  id: number;
  effective_from: string; // YYYY-MM-DD
  amount: number;
  recorded_at: string;
  recorded_by: string;
}

export interface CreateFeeRateRequest {
  effective_from: string;
  amount: number;
}

export interface ShutdownEventOut {
  id: number;
  week_start: string;
  is_shutdown: boolean;
  reason: string | null;
  recorded_at: string;
  recorded_by: string;
}

export interface SetShutdownRequest {
  from_week: string;
  to_week: string;
  is_shutdown: boolean;
  reason?: string | null;
}

export interface ShutdownResult {
  weeks: number;
}

export interface MemberOut {
  id: number;
  name: string;
  batch: string | null;
  note: string;
}

export interface CreateMemberRequest {
  name: string;
  batch?: string | null;
  note?: string;
}

export interface EditMemberRequest {
  name?: string;
  batch?: string | null;
  note?: string;
}

export interface MembershipPeriodOut {
  id: number;
  member_id: number;
  start_date: string;
  end_date: string | null;
}

export interface StartPeriodRequest {
  start_date: string;
}

export interface EndPeriodRequest {
  end_date: string;
}

export interface AdjustmentOut {
  id: number;
  member_id: number;
  kind: AdjustmentKind;
  amount: number;
  occurred_on: string;
  recorded_at: string;
  recorded_by: string;
  note: string;
}

export interface CreateAdjustmentRequest {
  kind: AdjustmentKind;
  amount: number;
  occurred_on: string;
  note: string;
}

export interface EntryOut {
  id: number;
  tenure_id: number;
  occurred_on: string;
  recorded_at: string;
  recorded_by: string;
  kind: EntryKind;
  note: string;
  tag: string | null;
  cost_center_id: number | null;
  source: IncomeSource | null;
  member_id: number | null;
  corrected_from: number | null;
}

export interface EntryCreated {
  id: number;
}

export interface DepositRequest {
  amount: number;
  envelope_id: number;
  occurred_on: string;
  cost_center_id?: number | null;
  member_id?: number | null;
  source?: IncomeSource | null;
  tag?: string | null;
  note?: string | null;
}

export interface ExpenseRequest {
  amount: number;
  envelope_id: number;
  occurred_on: string;
  cost_center_id?: number | null;
  tag?: string | null;
  note?: string | null;
}

export interface ExpenseCreated {
  id: number;
  kind: string;
  balance: number;
}

export interface TransferRequest {
  amount: number;
  from_envelope_id: number;
  to_envelope_id: number;
  occurred_on: string;
  cost_center_id?: number | null;
  tag?: string | null;
  note: string;
}

export interface TransferCreated {
  id: number;
  kind: string;
  from_balance: number;
  to_balance: number;
}

export interface RefundRequest {
  amount: number;
  occurred_on: string;
  cost_center_id?: number | null;
  member_id?: number | null;
  tag?: string | null;
  note?: string | null;
}

export interface RefundCreated {
  id: number;
  kind: string;
  balance: number;
}

export interface FixAmountRequest {
  amount: number;
  occurred_on: string;
  note?: string | null;
}

export interface FixAmountCreated {
  id: number;
  reversal_id: number;
  corrected_from: number;
  kind: string;
  balance: number;
}

export interface LabelEditRequest {
  occurred_on?: string | null;
  note?: string | null;
  tag?: string | null;
  cost_center_id?: number | null;
  source?: IncomeSource | null;
}

export interface EntryLabelsOut {
  id: number;
  kind: string;
  note: string;
  tag: string | null;
  cost_center_id: number | null;
  occurred_on: string;
  source: IncomeSource | null;
}

export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string | any;
  instance?: string;
}

export interface ApiRefusalError extends Error {
  reason: string;
  remediation?: string;
  status?: number;
  raw?: any;
}

// =====================================================================================
// AUTH & CONFIGURATION STORAGE
// =====================================================================================

const TOKEN_KEY = 'mesl_backend_token';
const USERNAME_KEY = 'mesl_backend_username';
const MODE_KEY = 'mesl_backend_mode'; // 'auto' | 'backend' | 'engine'
const API_URL_KEY = 'mesl_backend_api_url';

const memoryStore = new Map<string, string>();

function safeGet(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem) {
      return localStorage.getItem(key);
    }
  } catch {}
  return memoryStore.get(key) ?? null;
}

function safeSet(key: string, val: string): void {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.setItem) {
      localStorage.setItem(key, val);
      return;
    }
  } catch {}
  memoryStore.set(key, val);
}

function safeRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.removeItem) {
      localStorage.removeItem(key);
      return;
    }
  } catch {}
  memoryStore.delete(key);
}

export const authStorage = {
  getToken(): string | null {
    return safeGet(TOKEN_KEY);
  },
  setToken(token: string): void {
    safeSet(TOKEN_KEY, token);
  },
  clearToken(): void {
    safeRemove(TOKEN_KEY);
  },
  getUsername(): string {
    return safeGet(USERNAME_KEY) || 'treasurer';
  },
  setUsername(username: string): void {
    safeSet(USERNAME_KEY, username);
  },
  getMode(): 'auto' | 'backend' | 'engine' {
    return (safeGet(MODE_KEY) as any) || 'auto';
  },
  setMode(mode: 'auto' | 'backend' | 'engine'): void {
    safeSet(MODE_KEY, mode);
  },
  getBaseUrl(): string {
    return safeGet(API_URL_KEY) || '';
  },
  setBaseUrl(url: string): void {
    safeSet(API_URL_KEY, url);
  },
};

// =====================================================================================
// HTTP CLIENT CORE
// =====================================================================================

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = authStorage.getBaseUrl();
  const url = `${baseUrl}${path}`;
  const token = authStorage.getToken();

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (netErr: any) {
    const error: ApiRefusalError = new Error(
      `Cannot connect to MESL Finance backend at ${url}. ${netErr.message || ''}`
    ) as ApiRefusalError;
    error.reason = `Backend server is unreachable (${netErr.message || 'Network error'}).`;
    error.remediation = 'Ensure the FastAPI backend is running (e.g. at http://localhost:8000) or switch to Local Simulation Mode.';
    error.raw = netErr;
    throw error;
  }

  if (!response.ok) {
    let errorData: any = null;
    try {
      errorData = await response.json();
    } catch {
      errorData = { detail: await response.text() };
    }

    const err: ApiRefusalError = new Error(
      errorData?.detail?.toString() || errorData?.title || `Request failed with status ${response.status}`
    ) as ApiRefusalError;
    err.status = response.status;
    err.raw = errorData;

    // Handle 401 Unauthorized
    if (response.status === 401) {
      err.reason = 'Authentication Required or Expired.';
      err.remediation = 'Please log in with the Treasurer credentials to perform this action.';
      throw err;
    }

    // Handle 422 Validation Error
    if (response.status === 422 && Array.isArray(errorData?.detail)) {
      const messages = errorData.detail
        .map((d: any) => `${d.loc?.join('.') || 'field'}: ${d.msg}`)
        .join('; ');
      err.reason = `Validation failed: ${messages}`;
      err.remediation = 'Please check the values entered and submit again.';
      throw err;
    }

    // Handle RFC 9457 Problem Details (409, 400, 404, etc.)
    err.reason = errorData?.detail || errorData?.title || `Backend error (${response.status})`;
    if (response.status === 409) {
      err.remediation = 'The requested operation violates database business constraints (e.g., negative balance, duplicate name, or closed tenure).';
    } else if (response.status === 404) {
      err.remediation = 'The requested entity could not be found.';
    } else {
      err.remediation = 'Review the transaction details and retry.';
    }

    throw err;
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

// =====================================================================================
// BACKEND API CLIENT OBJECT
// =====================================================================================

export const backendApi = {
  // Health & Connectivity probe
  async probeHealth(): Promise<{ online: boolean; authenticated: boolean }> {
    try {
      const baseUrl = authStorage.getBaseUrl();
      const token = authStorage.getToken();
      const res = await fetch(`${baseUrl}/api/v1/allocation-context`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        return { online: true, authenticated: true };
      }
      if (res.status === 401) {
        return { online: true, authenticated: false };
      }
      return { online: true, authenticated: false };
    } catch {
      return { online: false, authenticated: false };
    }
  },

  // Auth (Phase 4)
  async login(credentials: LoginRequest): Promise<TokenResponse> {
    const data = await request<TokenResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    authStorage.setToken(data.access_token);
    authStorage.setUsername(credentials.username);
    return data;
  },

  logout(): void {
    authStorage.clearToken();
  },

  // Cost Centers (Phase 5)
  async getCostCenters(params?: { kind?: CostCenterKind; status?: CostCenterStatus }): Promise<CostCenterOut[]> {
    const query = new URLSearchParams();
    if (params?.kind) query.set('kind', params.kind);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<CostCenterOut[]>(`/api/v1/cost-centers${qs}`);
  },

  async createCostCenter(data: CreateCostCenterRequest): Promise<CostCenterOut> {
    return request<CostCenterOut>('/api/v1/cost-centers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async renameCostCenter(costCenterId: number, name: string): Promise<CostCenterOut> {
    return request<CostCenterOut>(`/api/v1/cost-centers/${costCenterId}/rename`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  async setCostCenterStatus(costCenterId: number, status: CostCenterStatus): Promise<CostCenterOut> {
    return request<CostCenterOut>(`/api/v1/cost-centers/${costCenterId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  },

  // Envelopes (Phase 5)
  async getEnvelopes(): Promise<EnvelopeOut[]> {
    return request<EnvelopeOut[]>('/api/v1/envelopes');
  },

  async createEnvelope(data: CreateEnvelopeRequest): Promise<EnvelopeOut> {
    return request<EnvelopeOut>('/api/v1/envelopes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async renameEnvelope(envelopeId: number, name: string): Promise<EnvelopeOut> {
    return request<EnvelopeOut>(`/api/v1/envelopes/${envelopeId}/rename`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  async updateEnvelopeSettings(envelopeId: number, data: EnvelopeSettingsRequest): Promise<EnvelopeOut> {
    return request<EnvelopeOut>(`/api/v1/envelopes/${envelopeId}/settings`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deactivateEnvelope(envelopeId: number): Promise<EnvelopeOut> {
    return request<EnvelopeOut>(`/api/v1/envelopes/${envelopeId}/deactivate`, {
      method: 'POST',
    });
  },

  // Allocation Context (Phase 7)
  async getAllocationContext(): Promise<AllocationContextOut> {
    return request<AllocationContextOut>('/api/v1/allocation-context');
  },

  // Fees & Dues (Phase 7)
  async getDues(): Promise<StandingOut[]> {
    return request<StandingOut[]>('/api/v1/dues');
  },

  async getFeeRates(): Promise<FeeRateOut[]> {
    return request<FeeRateOut[]>('/api/v1/fee-rates');
  },

  async addFeeRate(data: CreateFeeRateRequest): Promise<FeeRateOut> {
    return request<FeeRateOut>('/api/v1/fee-rates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getShutdownWeeks(): Promise<ShutdownEventOut[]> {
    return request<ShutdownEventOut[]>('/api/v1/shutdown-weeks');
  },

  async setShutdownWeeks(data: SetShutdownRequest): Promise<ShutdownResult> {
    return request<ShutdownResult>('/api/v1/shutdown-weeks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Members & Periods & Adjustments (Phase 7)
  async getMembers(): Promise<MemberOut[]> {
    return request<MemberOut[]>('/api/v1/members');
  },

  async createMember(data: CreateMemberRequest): Promise<MemberOut> {
    return request<MemberOut>('/api/v1/members', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async editMember(memberId: number, data: EditMemberRequest): Promise<MemberOut> {
    return request<MemberOut>(`/api/v1/members/${memberId}/edit`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getMemberPeriods(memberId: number): Promise<MembershipPeriodOut[]> {
    return request<MembershipPeriodOut[]>(`/api/v1/members/${memberId}/periods`);
  },

  async startMemberPeriod(memberId: number, startDate: string): Promise<MembershipPeriodOut> {
    return request<MembershipPeriodOut>(`/api/v1/members/${memberId}/periods/start`, {
      method: 'POST',
      body: JSON.stringify({ start_date: startDate }),
    });
  },

  async endMemberPeriod(memberId: number, endDate: string): Promise<MembershipPeriodOut> {
    return request<MembershipPeriodOut>(`/api/v1/members/${memberId}/periods/end`, {
      method: 'POST',
      body: JSON.stringify({ end_date: endDate }),
    });
  },

  async getMemberAdjustments(memberId: number): Promise<AdjustmentOut[]> {
    return request<AdjustmentOut[]>(`/api/v1/members/${memberId}/adjustments`);
  },

  async addMemberAdjustment(memberId: number, data: CreateAdjustmentRequest): Promise<AdjustmentOut> {
    return request<AdjustmentOut>(`/api/v1/members/${memberId}/adjustments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Ledger Transactions (Phase 6 & 7)
  async getEntries(tenureId?: number): Promise<EntryOut[]> {
    const qs = tenureId ? `?tenure_id=${tenureId}` : '';
    return request<EntryOut[]>(`/api/v1/entries${qs}`);
  },

  async recordDeposit(data: DepositRequest): Promise<EntryCreated> {
    return request<EntryCreated>('/api/v1/deposits', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async recordExpense(data: ExpenseRequest): Promise<ExpenseCreated> {
    return request<ExpenseCreated>('/api/v1/expenses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async recordTransfer(data: TransferRequest): Promise<TransferCreated> {
    return request<TransferCreated>('/api/v1/transfers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async recordRefund(data: RefundRequest): Promise<RefundCreated> {
    return request<RefundCreated>('/api/v1/refunds', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async fixAmount(entryId: number, data: FixAmountRequest): Promise<FixAmountCreated> {
    return request<FixAmountCreated>(`/api/v1/entries/${entryId}/fix-amount`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async editLabels(entryId: number, data: LabelEditRequest): Promise<EntryLabelsOut> {
    return request<EntryLabelsOut>(`/api/v1/entries/${entryId}/edit-labels`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
