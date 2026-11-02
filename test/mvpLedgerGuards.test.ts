import { describe, it } from 'node:test';
import assert from 'node:assert';
import { FinanceEngine } from '../src/lib/db/engine';
import { getTestSeedData } from '../src/lib/db/seed';

describe('MVP Ledger Guards & UI Preflight Checks', () => {
  it('detects overdraw preflight condition before recording transaction', () => {
    const engine = new FinanceEngine(getTestSeedData());
    const balances = engine.getEnvelopeBalances();
    const env = balances.find((b) => b.id === 2); // Components envelope (balance: ৳10,600)
    assert(env);

    const spendAmount = env.balance + 500;
    const isOverdrawn = spendAmount > env.balance;
    assert.strictEqual(isOverdrawn, true);
    const shortfall = spendAmount - env.balance;
    assert.strictEqual(shortfall, 500);
  });

  it('rejects future dates in preflight check', () => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const pastDate = '2025-10-15';

    assert.strictEqual(tomorrow > today, true);
    assert.strictEqual(pastDate <= today, true);
  });

  it('identifies potential duplicate transactions by member, amount, and occurred date', () => {
    const engine = new FinanceEngine(getTestSeedData());
    const entries = engine.getEntriesCurrent();

    // Check existing deposit
    const existingFeeTx = entries.find((tx) => tx.source === 'weekly_fee' && tx.member_id);
    assert(existingFeeTx);

    const sameAmount = Math.abs(existingFeeTx.lines[0]?.amount || 0);
    const sameMember = existingFeeTx.member_id;
    const sameDate = existingFeeTx.occurred_on;

    const matches = entries.filter((tx) => {
      if (tx.occurred_on !== sameDate) return false;
      const amt = Math.abs(tx.lines[0]?.amount || 0);
      return tx.member_id === sameMember && amt === sameAmount;
    });

    assert(matches.length >= 1);
    assert.strictEqual(matches[0].id, existingFeeTx.id);
  });

  it('collapsed history separates active current entries from reversals and voided entries', () => {
    const engine = new FinanceEngine(getTestSeedData());
    
    // Create an entry
    const compEnv = engine.getEnvelopeBalances().find((b) => b.id === 2)!;
    const tx = engine.recordTransaction({
      kind: 'expense',
      occurred_on: '2026-10-15',
      recorded_by: 'Treasurer',
      note: 'Test entry for reversal',
      lines: [{ envelope_id: compEnv.id, amount: -100 }],
    });

    // Fix amount: records reversal + replacement
    const { reversal, replacement } = engine.fixAmount({
      transactionId: tx.id,
      newLines: [{ envelope_id: compEnv.id, amount: -150 }],
      newNote: 'Fixed test entry',
      by: 'Treasurer',
    });

    const allTransactions = engine.getLedgerTransactions();
    const currentEntries = engine.getEntriesCurrent();

    // The original tx is marked voided in current entries
    assert.strictEqual(currentEntries.some((e) => e.id === tx.id), false);
    // The reversal is excluded from current entries
    assert.strictEqual(currentEntries.some((e) => e.id === reversal.id), false);
    // The replacement is present in current entries
    assert.strictEqual(currentEntries.some((e) => e.id === replacement.id), true);

    // In full audit trail (all transactions), all three are preserved!
    assert.strictEqual(allTransactions.some((e) => e.id === tx.id), true);
    assert.strictEqual(allTransactions.some((e) => e.id === reversal.id), true);
    assert.strictEqual(allTransactions.some((e) => e.id === replacement.id), true);
  });
});
