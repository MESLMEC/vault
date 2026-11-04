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
          source: 'other',
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

  it('sends member fee refund with POST /api/v1/refunds and enforces member_id', async () => {
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

    // Rejects when member_id is 0 / falsy
    await assert.rejects(
      async () => {
        await backendApi.recordRefund({
          amount: 250,
          occurred_on: '2026-10-26',
          member_id: 0,
        });
      },
      /member_id is strictly required/
    );
  });

  it('GET /api/v1/assets/activity requires from_date and to_date query params', async () => {
    mockResponse = { status: 200, ok: true, body: [] };
    await backendApi.getAssetActivity({ from_date: '2026-01-01', to_date: '2026-12-31' });
    assert.strictEqual(lastFetch?.url, '/api/v1/assets/activity?from_date=2026-01-01&to_date=2026-12-31');

    await assert.rejects(
      async () => {
        await backendApi.getAssetActivity({ from_date: '', to_date: '2026-12-31' });
      },
      /from_date and to_date are required/
    );
  });

  it('POST /api/v1/deposits enforces weekly_fee and non-weekly_fee constraints', async () => {
    mockResponse = { status: 201, ok: true, body: { id: 10 } };

    // Weekly fee: member_id required, envelope_id omitted
    await backendApi.recordDeposit({
      amount: 50,
      occurred_on: '2026-10-28',
      source: 'weekly_fee',
      member_id: 7,
    });
    const weeklyBody = JSON.parse(lastFetch?.options?.body as string);
    assert.strictEqual(weeklyBody.source, 'weekly_fee');
    assert.strictEqual(weeklyBody.member_id, 7);
    assert.strictEqual(weeklyBody.envelope_id, undefined);

    // Weekly fee missing member_id: rejected
    await assert.rejects(
      async () => {
        await backendApi.recordDeposit({
          amount: 50,
          occurred_on: '2026-10-28',
          source: 'weekly_fee',
        });
      },
      /member_id is required/
    );

    // Non-weekly fee: member_id forbidden, envelope_id permitted
    await backendApi.recordDeposit({
      amount: 1500,
      occurred_on: '2026-10-28',
      source: 'admin_grant',
      envelope_id: 2,
    });
    const grantBody = JSON.parse(lastFetch?.options?.body as string);
    assert.strictEqual(grantBody.source, 'admin_grant');
    assert.strictEqual(grantBody.envelope_id, 2);
    assert.strictEqual(grantBody.member_id, undefined);

    // Non-weekly fee with member_id: rejected
    await assert.rejects(
      async () => {
        await backendApi.recordDeposit({
          amount: 1500,
          occurred_on: '2026-10-28',
          source: 'admin_grant',
          member_id: 3,
        });
      },
      /member_id is forbidden/
    );
  });

  it('POST /api/v1/envelopes/{id}/settings always sends both target_cap and alloc_priority keys', async () => {
    mockResponse = { status: 200, ok: true, body: { id: 1, name: 'Ops', target_cap: null, alloc_priority: null, is_pool: false, active: true } };

    await backendApi.updateEnvelopeSettings(1, { target_cap: null, alloc_priority: null });
    let body = JSON.parse(lastFetch?.options?.body as string);
    assert('target_cap' in body);
    assert('alloc_priority' in body);
    assert.strictEqual(body.target_cap, null);
    assert.strictEqual(body.alloc_priority, null);

    await backendApi.updateEnvelopeSettings(1, { target_cap: 5000, alloc_priority: 2 });
    body = JSON.parse(lastFetch?.options?.body as string);
    assert.strictEqual(body.target_cap, 5000);
    assert.strictEqual(body.alloc_priority, 2);
  });

  it('POST /api/v1/entries/{id}/fix-amount requires non-blank note and preserves occurred_on', async () => {
    mockResponse = { status: 201, ok: true, body: { id: 99, reversal_id: 98, corrected_from: 10, kind: 'expense', balance: 4000 } };

    await backendApi.fixAmount(10, {
      amount: 450,
      occurred_on: '2026-10-20',
      note: 'Corrected receipt typo',
    });
    assert.strictEqual(lastFetch?.url, '/api/v1/entries/10/fix-amount');
    const body = JSON.parse(lastFetch?.options?.body as string);
    assert.strictEqual(body.amount, 450);
    assert.strictEqual(body.occurred_on, '2026-10-20');
    assert.strictEqual(body.note, 'Corrected receipt typo');

    await assert.rejects(
      async () => {
        await backendApi.fixAmount(10, {
          amount: 450,
          occurred_on: '2026-10-20',
          note: '   ',
        });
      },
      /non-blank note is required/
    );
  });

  it('POST /api/v1/assets creates asset without quantity field', async () => {
    mockResponse = {
      status: 201,
      ok: true,
      body: {
        id: 15,
        name: 'Rigol DS1054Z',
        mode: 'individual',
        ownership: 'lab',
        tag: 'OSC-01',
        note: 'Main bench',
      },
    };

    const result = await backendApi.createAsset({
      name: 'Rigol DS1054Z',
      mode: 'individual',
      ownership: 'lab',
      tag: 'OSC-01',
      note: 'Main bench',
    });

    assert.strictEqual(lastFetch?.url, '/api/v1/assets');
    assert.strictEqual(lastFetch?.options?.method, 'POST');
    const body = JSON.parse(lastFetch?.options?.body as string);
    assert.strictEqual(body.name, 'Rigol DS1054Z');
    assert.strictEqual(body.mode, 'individual');
    assert.strictEqual(body.ownership, 'lab');
    assert.strictEqual(body.tag, 'OSC-01');
    assert.strictEqual(body.note, 'Main bench');
    assert.strictEqual('quantity' in body, false);
    assert.strictEqual(result.id, 15);
  });

  it('POST /api/v1/assets/{id}/events sends schema-compliant fields including ledger_transaction_id for purchases', async () => {
    mockResponse = {
      status: 201,
      ok: true,
      body: {
        id: 101,
        asset_id: 15,
        kind: 'acquired',
        quantity: 5,
        occurred_on: '2026-11-04',
        note: 'New batch',
        ledger_transaction_id: 10,
      },
    };

    await backendApi.recordAssetEvent(15, {
      kind: 'acquired',
      quantity: 5,
      occurred_on: '2026-11-04',
      note: 'New batch',
      source: 'purchase',
      ledger_transaction_id: 10,
    });

    assert.strictEqual(lastFetch?.url, '/api/v1/assets/15/events');
    assert.strictEqual(lastFetch?.options?.method, 'POST');
    const body = JSON.parse(lastFetch?.options?.body as string);
    assert.strictEqual(body.kind, 'acquired');
    assert.strictEqual(body.quantity, 5);
    assert.strictEqual(body.occurred_on, '2026-11-04');
    assert.strictEqual(body.source, 'purchase');
    assert.strictEqual(body.ledger_transaction_id, 10);
    assert.strictEqual(body.note, 'New batch');
    assert.strictEqual('cost_center_id' in body, false);
    assert.strictEqual('recorded_by' in body, false);
  });

  it('POST /api/v1/assets/{id}/events/{event_id}/fix returns FixEventOut with ledger_transaction_id', async () => {
    mockResponse = {
      status: 201,
      ok: true,
      body: {
        id: 102,
        asset_id: 15,
        kind: 'acquired',
        quantity: 4,
        occurred_on: '2026-11-04',
        note: 'Original note',
        reversal_id: 103,
        ledger_transaction_id: 10,
      },
    };

    const fixOut = await backendApi.fixAssetEvent(15, 101, {
      quantity: 4,
      occurred_on: '2026-11-04',
      note: 'Count correction',
    });

    assert.strictEqual(lastFetch?.url, '/api/v1/assets/15/events/101/fix');
    assert.strictEqual(lastFetch?.options?.method, 'POST');
    assert.strictEqual(fixOut.id, 102);
    assert.strictEqual(fixOut.reversal_id, 103);
    assert.strictEqual(fixOut.ledger_transaction_id, 10);
  });

  it('GET /api/v1/entries receives entry lines, net_effect, and size (issue #5)', async () => {
    mockResponse = {
      status: 200,
      ok: true,
      body: [
        {
          id: 42,
          tenure_id: 1,
          kind: 'deposit',
          occurred_on: '2026-02-01',
          recorded_at: '2026-02-01T10:00:00Z',
          recorded_by: 'treasurer',
          note: 'Sponsorship intake',
          tag: 'fest',
          cost_center_id: null,
          member_id: null,
          source: 'sponsorship',
          corrected_from: null,
          lines: [
            { envelope_id: 1, amount: 5000 },
          ],
          net_effect: 5000,
          size: 5000,
        },
        {
          id: 43,
          tenure_id: 1,
          kind: 'transfer',
          occurred_on: '2026-02-02',
          recorded_at: '2026-02-02T11:00:00Z',
          recorded_by: 'treasurer',
          note: 'Fund event',
          tag: 'allocation',
          cost_center_id: 2,
          member_id: null,
          source: null,
          corrected_from: null,
          lines: [
            { envelope_id: 1, amount: -2000 },
            { envelope_id: 2, amount: 2000 },
          ],
          net_effect: 0,
          size: 2000,
        },
      ],
    };

    const entries = await backendApi.getEntries();
    assert.strictEqual(lastFetch?.url, '/api/v1/entries');
    assert.strictEqual(entries.length, 2);

    const dep = entries[0];
    assert.strictEqual(dep.id, 42);
    assert.strictEqual(dep.lines.length, 1);
    assert.strictEqual(dep.lines[0].envelope_id, 1);
    assert.strictEqual(dep.lines[0].amount, 5000);
    assert.strictEqual(dep.net_effect, 5000);
    assert.strictEqual(dep.size, 5000);

    const xfer = entries[1];
    assert.strictEqual(xfer.id, 43);
    assert.strictEqual(xfer.lines.length, 2);
    assert.strictEqual(xfer.lines[0].amount, -2000);
    assert.strictEqual(xfer.lines[1].amount, 2000);
    assert.strictEqual(xfer.net_effect, 0);
    assert.strictEqual(xfer.size, 2000);

    // Verify getLedgerLines parses the entry lines with transaction ids
    const lines = await backendApi.getLedgerLines();
    assert.strictEqual(lines.length, 3);
    assert.strictEqual(lines[0].transaction_id, 42);
    assert.strictEqual(lines[0].envelope_id, 1);
    assert.strictEqual(lines[0].amount, 5000);
    assert.strictEqual(lines[1].transaction_id, 43);
    assert.strictEqual(lines[1].envelope_id, 1);
    assert.strictEqual(lines[1].amount, -2000);
    assert.strictEqual(lines[2].transaction_id, 43);
    assert.strictEqual(lines[2].envelope_id, 2);
    assert.strictEqual(lines[2].amount, 2000);
  });
});
