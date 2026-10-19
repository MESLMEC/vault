import React, { useState, useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { EnvelopeCardGrid } from './components/ledger/EnvelopeCardGrid';
import { LedgerTable } from './components/ledger/LedgerTable';
import { TransactionModal } from './components/ledger/TransactionModal';
import { DuesOverviewTable } from './components/dues/DuesOverviewTable';
import { QuickFeeCollectorModal } from './components/dues/QuickFeeCollectorModal';
import { AllocationScreen } from './components/allocation/AllocationScreen';
import { CostCentersScreen } from './components/events/CostCentersScreen';
import { AssetsScreen } from './components/assets/AssetsScreen';
import { ReconciliationScreen } from './components/reconciliation/ReconciliationScreen';
import { HandoverScreen } from './components/handover/HandoverScreen';
import { RefusalModal } from './components/common/RefusalModal';
import { api } from './services/api';
import {
  EnvelopeBalance,
  LedgerEntryView,
  MemberStanding,
  Member,
  Envelope,
  CostCenter,
} from './lib/db/types';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState('ledger');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Core data states
  const [envelopes, setEnvelopes] = useState<EnvelopeBalance[]>([]);
  const [entries, setEntries] = useState<LedgerEntryView[]>([]);
  const [standing, setStanding] = useState<MemberStanding[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);

  // Refusal Modal State
  const [refusalState, setRefusalState] = useState<{
    isOpen: boolean;
    reason: string;
    remediation?: string;
  }>({
    isOpen: false,
    reason: '',
  });

  // Quick Action Modals
  const [quickTxModal, setQuickTxModal] = useState<{
    isOpen: boolean;
    type: 'deposit' | 'expense' | 'transfer';
  }>({
    isOpen: false,
    type: 'deposit',
  });
  const [quickFeeOpen, setQuickFeeOpen] = useState(false);

  const triggerRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleError = (err: any) => {
    console.error('Handled refusal:', err);
    setRefusalState({
      isOpen: true,
      reason: err?.reason || err?.message || 'An unexpected error occurred.',
      remediation: err?.remediation,
    });
  };

  const loadData = async () => {
    try {
      const [envs, txs, st, mems, ccs] = await Promise.all([
        api.getEnvelopeBalances(),
        api.getEntriesCurrent(),
        api.getDuesOverview(),
        api.getMembers(),
        api.getCostCenters(),
      ]);
      setEnvelopes(envs);
      setEntries(txs);
      setStanding(st);
      setMembers(mems);
      setCostCenters(ccs);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, [refreshTrigger]);

  const handleQuickRecord = (type: 'deposit' | 'expense' | 'fee') => {
    if (type === 'fee') {
      setQuickFeeOpen(true);
    } else {
      setQuickTxModal({ isOpen: true, type });
    }
  };

  return (
    <AppShell
      currentView={currentView}
      onNavigate={setCurrentView}
      onQuickRecord={handleQuickRecord}
      refreshTrigger={refreshTrigger}
      onDataChanged={triggerRefresh}
    >
      {/* Human Refusal Explanation Modal */}
      <RefusalModal
        isOpen={refusalState.isOpen}
        onClose={() => setRefusalState((prev) => ({ ...prev, isOpen: false }))}
        reason={refusalState.reason}
        remediation={refusalState.remediation}
      />

      {/* Quick Record Transaction Modal */}
      <TransactionModal
        isOpen={quickTxModal.isOpen}
        onClose={() => setQuickTxModal((prev) => ({ ...prev, isOpen: false }))}
        initialType={quickTxModal.type}
        onTransactionSaved={triggerRefresh}
        onError={handleError}
      />

      {/* Quick Fee Collection Modal */}
      <QuickFeeCollectorModal
        isOpen={quickFeeOpen}
        onClose={() => setQuickFeeOpen(false)}
        onSuccess={triggerRefresh}
        onError={handleError}
      />

      {/* VIEW 1: Money & Ledger */}
      {currentView === 'ledger' && (
        <div className="space-y-8">
          <EnvelopeCardGrid
            envelopes={envelopes}
            onEnvelopeCreated={triggerRefresh}
            onError={handleError}
          />
          <LedgerTable
            entries={entries}
            envelopes={envelopes}
            costCenters={costCenters}
            onRefresh={triggerRefresh}
            onError={handleError}
          />
        </div>
      )}

      {/* VIEW 2: Fees & Members */}
      {currentView === 'dues' && (
        <DuesOverviewTable
          standing={standing}
          members={members}
          onRefresh={triggerRefresh}
          onError={handleError}
        />
      )}

      {/* VIEW 3: Allocation Sessions */}
      {currentView === 'allocation' && (
        <AllocationScreen onAllocated={triggerRefresh} onError={handleError} />
      )}

      {/* VIEW 4: Events & Cost Centers */}
      {currentView === 'events' && (
        <CostCentersScreen onRefresh={triggerRefresh} onError={handleError} />
      )}

      {/* VIEW 5: Equipment & Assets */}
      {currentView === 'assets' && (
        <AssetsScreen onRefresh={triggerRefresh} onError={handleError} />
      )}

      {/* VIEW 6: Monthly Reconciliation */}
      {currentView === 'reconciliation' && (
        <ReconciliationScreen onRefresh={triggerRefresh} onError={handleError} />
      )}

      {/* VIEW 7: Handover & Tenure */}
      {currentView === 'handover' && (
        <HandoverScreen onRefresh={triggerRefresh} onError={handleError} />
      )}
    </AppShell>
  );
};

export default App;
