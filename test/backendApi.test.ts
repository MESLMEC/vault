import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { backendApi, authStorage } from '../src/services/backendApi';

// Mock global fetch for testing
let lastFetch: { url: string; options?: RequestInit } | null = null;
let mockResponse: { status: number; ok: boolean; body: any } = {
  status: 200,
  ok: true,
  body: {},
};

(global as any).fetch = async (url: string, options?: RequestInit) => {
  lastFetch = { url, options };
  return {
    status: mockResponse.status,
    ok: mockResponse.ok,
    json: async () => mockResponse.body,
    text: async () => JSON.stringify(mockResponse.body),
  };
};

describe('Backend API Client Contract Tests', () => {
  beforeEach(() => {
    lastFetch = null;
    authStorage.clearToken();
    authStorage.setBaseUrl('');
    mockResponse = { status: 200, ok: true, body: {} };
  });

  it('authenticates via POST /api/v1/auth/login and stores bearer token', async () => {
    mockResponse = {
      status: 200,
      ok: true,
      body: {
        access_token: 'fake-jwt-token-xyz',
        token_type: 'bearer',
        expires_at: '2026-10-29T10:00:00Z',
      },
    };

    const res = await backendApi.login({ username: 'treasurer', password: 'change-me' });
    assert.strictEqual(res.access_token, 'fake-jwt-token-xyz');
    assert.strictEqual(lastFetch?.url, '/api/v1/auth/login');
    assert.strictEqual(lastFetch?.options?.method, 'POST');
    assert.strictEqual(authStorage.getToken(), 'fake-jwt-token-xyz');
  });

  it('attaches Bearer token to subsequent requests', async () => {
    authStorage.setToken('test-bearer-123');
    mockResponse = { status: 200, ok: true, body: [] };

    await backendApi.getEnvelopes();
    assert.strictEqual(lastFetch?.url, '/api/v1/envelopes');
    const headers = lastFetch?.options?.headers as Record<string, string>;
    assert.strictEqual(headers?.['Authorization'], 'Bearer test-bearer-123');
  });

  it('translates 422 validation errors into readable refusal errors', async () => {
    mockResponse = {
      status: 422,
      ok: false,
      body: {
        detail: [
          { loc: ['body', 'occurred_on'], msg: 'Input should be a valid date' },
        ],
      },
    };

    await assert.rejects(
      async () => {
        await backendApi.recordDeposit({
          amount: 500,
          envelope_id: 1,
          occurred_on: 'invalid-date',
        });
      },
      (err: any) => {
        assert(err.reason.includes('Validation failed'));
        assert(err.reason.includes('occurred_on'));
        return true;
      }
    );
  });

  it('translates RFC 9457 409 conflict errors into database rule refusals', async () => {
    mockResponse = {
      status: 409,
      ok: false,
      body: {
        title: 'Rule Violation',
        status: 409,
        detail: 'Envelope cannot be overdrawn below zero.',
      },
    };

    await assert.rejects(
      async () => {
        await backendApi.recordExpense({
          amount: 999999,
          envelope_id: 2,
          occurred_on: '2026-10-26',
        });
      },
      (err: any) => {
        assert.strictEqual(err.status, 409);
        assert.strictEqual(err.reason, 'Envelope cannot be overdrawn below zero.');
        assert(err.remediation.includes('business constraints'));
        return true;
      }
    );
  });

  it('formats query params for cost centers correctly', async () => {
    mockResponse = { status: 200, ok: true, body: [] };
    await backendApi.getCostCenters({ kind: 'competition', status: 'active' });
    assert.strictEqual(lastFetch?.url, '/api/v1/cost-centers?kind=competition&status=active');
  });

  it('sends member fee refund with POST /api/v1/refunds', async () => {
    mockResponse = { status: 201, ok: true, body: { id: 42, kind: 'expense', balance: 5000 } };
    const res = await backendApi.recordRefund({
      amount: 250,
      occurred_on: '2026-10-26',
      member_id: 3,
      note: 'Return advance fee',
    });
    assert.strictEqual(res.id, 42);
    assert.strictEqual(lastFetch?.url, '/api/v1/refunds');
    assert.strictEqual(lastFetch?.options?.method, 'POST');
    const parsedBody = JSON.parse(lastFetch?.options?.body as string);
    assert.strictEqual(parsedBody.amount, 250);
    assert.strictEqual(parsedBody.member_id, 3);
  });
});
