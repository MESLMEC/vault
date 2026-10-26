import { describe, it } from 'node:test';
import assert from 'node:assert';
import { FinanceEngine } from '../src/lib/db/engine';
import { getTestSeedData } from '../src/lib/db/seed';

describe('FinanceEngine Core Business Rules', () => {
  it('prevents spending more than an envelope balance (zero-overdraft invariant)', () => {
    const engine = new FinanceEngine(getTestSeedData());
    const balances = engine.getEnvelopeBalances();
    const compEnv = balances.find((b) => b.id === 2); // Components envelope (balance: ৳10,600)
    assert(compEnv);
    const balance = compEnv.balance;

    // Try to spend ৳1 more than available
    assert.throws(
      () => {
        engine.recordTransaction({
          kind: 'expense',
          occurred_on: '2025-10-15',
          recorded_by: 'Treasurer',
          note: 'Attempted overdraft',
          lines: [{ envelope_id: compEnv.id, amount: -(balance + 1) }],
        });
      },
      (err: any) => {
        assert(err.name === 'RefusalError');
        assert(err.message.includes('cannot be overdrawn'));
        return true;
      }
    );
  });

  it('enforces transfer amounts must sum to zero', () => {
    const engine = new FinanceEngine(getTestSeedData());
    assert.throws(
      () => {
        engine.recordTransaction({
          kind: 'transfer',
          occurred_on: '2025-10-15',
          recorded_by: 'Treasurer',
          note: 'Unbalanced transfer',
          lines: [
            { envelope_id: 1, amount: -500 },
            { envelope_id: 2, amount: 400 }, // sum = -100
          ],
        });
      },
      (err: any) => {
        assert(err.name === 'RefusalError');
        assert(err.message.includes('sum exactly to zero'));
        return true;
      }
    );
  });

  it('allocates according to priority cap fills and splits remainder', () => {
    const engine = new FinanceEngine(getTestSeedData());
    const suggestion = engine.getAllocationSuggestion(10000);

    // Capped priority 1 (Components & Stash) has target_cap 15000 and current balance 10600, gap is 4400
    const compSug = suggestion.find((s) => s.envelope_id === 2);
    assert(compSug);
    assert.strictEqual(compSug.suggested, 4400);
    assert.strictEqual(compSug.phase, 'cap_fill');

    // Total suggested must be <= 10000
    const totalSuggested = suggestion.reduce((sum, s) => sum + s.suggested, 0);
    assert(totalSuggested <= 10000);
  });

  it('calculates member standing accurately across shutdown weeks and rate changes', () => {
    const engine = new FinanceEngine(getTestSeedData());
    const standing = engine.getMemberStanding('2025-10-31');
    const tanvir = standing.find((s) => s.who_name === 'Tanvir Ahmed');
    assert(tanvir);
    // Tanvir paid ৳500 upfront for 8 billable weeks @ ৳50/wk = ৳400 owed. Balance should be +৳100 credit.
    assert.strictEqual(tanvir.owed, 400);
    assert.strictEqual(tanvir.credits, 500);
    assert.strictEqual(tanvir.balance, 100);
    assert.strictEqual(tanvir.weeks_overdue, 0);
  });

  it('detects transposed digits and extra zero typo suspects', () => {
    const engine = new FinanceEngine(getTestSeedData());
    // Suppose an expense was recorded as -2400 (Tx 6), but notes say -4200 (swapped digits)
    // diff = counted - screen = -4200 - (-2400) = -1800
    const suspects = engine.getDifferenceSuspects(-1800);
    assert(suspects.length > 0);
    const found = suspects.find((s) => s.entry_id === 6);
    assert(found);
    assert(found.why.includes('swapped'));
  });

  it('closes tenure, snapshots state, and creates carry-over in new tenure', async () => {
    const engine = new FinanceEngine(getTestSeedData());
    const prevBalances = engine.getEnvelopeBalances();
    const prevTotal = prevBalances.reduce((s, b) => s + b.balance, 0);

    const result = await engine.closeTenure({
      closeOn: '2025-10-31',
      by: 'Outgoing Treasurer',
      nextName: 'Tenure 2026-2027',
    });

    assert(result.checksum);
    assert(result.checksum.length === 64); // SHA-256 hex string

    // Check that new tenure is open
    const openTenure = engine.getOpenTenure();
    assert.strictEqual(openTenure.name, 'Tenure 2026-2027');
    assert.strictEqual(openTenure.opened_on, '2025-11-01');

    // Check carry-over balances match previous total
    const newBalances = engine.getEnvelopeBalances();
    const newTotal = newBalances.reduce((s, b) => s + b.balance, 0);
    assert.strictEqual(newTotal, prevTotal);
  });
});
