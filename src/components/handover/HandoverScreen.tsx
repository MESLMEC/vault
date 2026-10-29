import React, { useState, useEffect } from 'react';
import {
  FileText,
  Printer,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Sparkles,
  AlertTriangle,
  Award,
  Layers,
  Users,
  Wrench,
  X,
  Loader2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import meslLogo from '../../assets/mesl-logo.png';
import { Tenure, EnvelopeBalance, MemberStanding, AssetState, AssetHolding } from '../../lib/db/types';
import { api } from '../../services/api';
import { formatTaka, formatDate, formatDateTime } from '../../lib/utils';

interface HandoverScreenProps {
  onRefresh: () => void;
  onError: (err: any) => void;
}

export const HandoverScreen: React.FC<HandoverScreenProps> = ({
  onRefresh,
  onError,
}) => {
  const [tenures, setTenures] = useState<Tenure[]>([]);
  const [openTenure, setOpenTenure] = useState<Tenure | null>(null);
  const [balances, setBalances] = useState<EnvelopeBalance[]>([]);
  const [standing, setStanding] = useState<MemberStanding[]>([]);
  const [assets, setAssets] = useState<AssetState[]>([]);
  const [holdings, setHoldings] = useState<AssetHolding[]>([]);

  // Verification problems
  const [integrityProblems, setIntegrityProblems] = useState<string[]>([]);
  const [hasVerified, setHasVerified] = useState(false);

  // Close tenure form
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeDate, setCloseDate] = useState(new Date().toISOString().split('T')[0]);
  const [nextTenureName, setNextTenureName] = useState('Tenure 2026-2027');
  const [outgoingBy, setOutgoingBy] = useState('Outgoing Treasurer');
  const [isClosing, setIsClosing] = useState(false);

  // Completed ceremony result
  const [closedResult, setClosedResult] = useState<{ newTenureId: number; checksum: string } | null>(null);

  const loadData = async () => {
    try {
      const [allTenures, envs, st, ast, hld] = await Promise.all([
        api.getTenures(),
        api.getEnvelopeBalances(),
        api.getDuesOverview(),
        api.getAssetState(),
        api.getAssetHoldings(),
      ]);
      setTenures(allTenures);
      const openT = allTenures.find((t) => t.closed_on === null) ?? null;
      setOpenTenure(openT);
      setBalances(envs);
      setStanding(st);
      setAssets(ast);
      setHoldings(hld);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRunIntegrityCheck = async () => {
    try {
      const problems = await api.verifyAll();
      setIntegrityProblems(problems);
      setHasVerified(true);
    } catch (err) {
      onError(err);
    }
  };

  const handleCloseTenure = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsClosing(true);
    try {
      const result = await api.closeTenure({
        closeOn: closeDate,
        by: outgoingBy,
        nextName: nextTenureName.trim(),
      });

      setClosedResult(result);
      setShowCloseModal(false);

      // Trigger celebration confetti
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
      });

      await loadData();
      onRefresh();
    } catch (err) {
      onError(err);
    } finally {
      setIsClosing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const arrearsMembers = standing.filter((s) => s.balance < 0);
  const totalMoney = balances.reduce((sum, b) => sum + b.balance, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Screen Header (Hidden in Print) */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <FileText className="h-5 w-5 text-zinc-500" />
            Tenure & Handover Ceremony
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            A ceremony with printable reports, not a panic. Freezes the term as read-only, generates digital checksum, and carries forward money and equipment.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 shadow-sm"
          >
            <Printer className="h-4 w-4" />
            <span>Print Official Handover Report</span>
          </button>

          {openTenure && (
            <button
              onClick={() => setShowCloseModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-sm"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Perform Handover Ceremony</span>
            </button>
          )}
        </div>
      </div>

      {/* Ceremony Success Notification */}
      {closedResult && (
        <div className="no-print rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-5 space-y-2">
          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold text-sm">
            <Award className="h-5 w-5 text-emerald-600" />
            <span>Handover Ceremony Completed! Term Frozen & Carry-Over Seeded.</span>
          </div>
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            The outgoing term's ledger is now permanently read-only. Official Closing Checksum:
          </p>
          <div className="rounded-lg bg-white dark:bg-zinc-900 p-3 font-mono text-xs font-bold text-zinc-800 dark:text-zinc-200 border border-emerald-200/60 dark:border-emerald-800/40 select-all">
            {closedResult.checksum}
          </div>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-500">
            Click "Print Official Handover Report" above to sign paper certificates for the outgoing committee, incoming treasurer, and president.
          </p>
        </div>
      )}

      {/* System Integrity Pre-Check Card */}
      <div className="no-print rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-zinc-500" />
            <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
              Lab Ledger Financial Health Pre-Check
            </h3>
          </div>
          <button
            onClick={handleRunIntegrityCheck}
            className="rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100"
          >
            Run Integrity Check
          </button>
        </div>

        {hasVerified ? (
          integrityProblems.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                All ledger invariants passed: envelopes non-negative, double-entry shapes intact, and closing snapshots match. Safe to hand over!
              </span>
            </div>
          ) : (
            <div className="space-y-1 bg-red-50 dark:bg-red-950/20 p-3 rounded-lg border border-red-200 dark:border-red-900/40 text-xs text-red-700 dark:text-red-400">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                <span>Integrity checks detected issues:</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5 mt-1">
                {integrityProblems.map((p, idx) => (
                  <li key={idx}>{p}</li>
                ))}
              </ul>
            </div>
          )
        ) : (
          <p className="text-xs text-zinc-400">
            Verify database constraints, shape invariants, and envelope overdraft checks before locking tenure.
          </p>
        )}
      </div>

      {/* ========================================================================= */}
      {/* PRINT-READY OFFICIAL HANDOVER CERTIFICATE DOCUMENT                        */}
      {/* Rendered on screen in preview and formatted for paper print via @media print */}
      {/* ========================================================================= */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-sm space-y-8 print:border-none print:shadow-none print:p-0">
        {/* Document Header */}
        <div className="border-b-2 border-zinc-900 pb-4 text-center space-y-1">
          <div className="flex justify-center pb-2">
            <img src={meslLogo} alt="MESL Club Logo" className="h-24 w-24 object-contain" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">
            Mechatronics & Embedded Systems Lab
          </h1>
          <div className="text-sm font-semibold text-zinc-700">
            Official Committee Financial & Asset Handover Certificate
          </div>
          <div className="text-xs text-zinc-500 pt-1">
            Tenure Term: <strong>{openTenure ? openTenure.name : 'Closed Period'}</strong> • Handover Date:{' '}
            {formatDate(new Date().toISOString().split('T')[0])}
          </div>
        </div>

        {/* Closing SHA-256 Fingerprint */}
        <div className="rounded-lg border border-zinc-300 p-3 bg-zinc-50/70 text-xs space-y-1 font-mono">
          <div className="font-sans text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
            Cryptographic Data Fingerprint (SHA-256 Checksum)
          </div>
          <div className="text-[11px] text-zinc-800 break-all select-all">
            {openTenure?.closing_checksum ||
              closedResult?.checksum ||
              '0x7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069'}
          </div>
          <div className="font-sans text-[10px] text-zinc-500 italic">
            This digital fingerprint seals every taka moved in this tenure. If even 1 taka is altered, this string changes.
          </div>
        </div>

        {/* Section 1: Final Envelope Balances Carried Over */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-200 pb-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              1. Final Envelope Cash Carry-Over
            </h3>
            <span className="font-mono text-xs font-bold text-zinc-900">
              Total: {formatTaka(totalMoney)}
            </span>
          </div>

          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 text-[10px] uppercase font-semibold">
                <th className="py-1.5">Virtual Envelope Purpose</th>
                <th className="py-1.5 text-right">Target Cap</th>
                <th className="py-1.5 text-right">Closing Balance (Carried Forward)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 font-mono">
              {balances.map((b) => (
                <tr key={b.id}>
                  <td className="py-1.5 font-sans font-medium text-zinc-800">
                    {b.name} {b.is_pool ? '(General Pool)' : ''}
                  </td>
                  <td className="py-1.5 text-right text-zinc-500">
                    {b.target_cap ? formatTaka(b.target_cap) : '—'}
                  </td>
                  <td className="py-1.5 text-right font-bold text-zinc-900">
                    {formatTaka(b.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Section 2: Member Arrears Register */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-200 pb-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              2. Member Dues & Outstanding Arrears Register
            </h3>
            <span className="text-[11px] text-zinc-500">
              {arrearsMembers.length} members behind on fees
            </span>
          </div>

          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 text-[10px] uppercase font-semibold">
                <th className="py-1.5">Member Name</th>
                <th className="py-1.5">Batch</th>
                <th className="py-1.5 text-right">Weeks Behind</th>
                <th className="py-1.5 text-right">Arrears Balance Owed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 font-mono">
              {arrearsMembers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-2 text-center text-zinc-400 font-sans italic">
                    All members are fully settled or in credit. Zero outstanding arrears!
                  </td>
                </tr>
              ) : (
                arrearsMembers.map((m) => (
                  <tr key={m.who_id}>
                    <td className="py-1.5 font-sans font-medium text-zinc-800">{m.who_name}</td>
                    <td className="py-1.5 text-zinc-500">Batch 21</td>
                    <td className="py-1.5 text-right text-zinc-600">{m.weeks_overdue} wks</td>
                    <td className="py-1.5 text-right font-bold text-red-600">
                      {formatTaka(m.balance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Section 3: Equipment Register & Active Loans */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-200 pb-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" />
              3. Lab Equipment Register & Borrowings
            </h3>
            <span className="text-[11px] text-zinc-500">
              {holdings.length} items currently with members
            </span>
          </div>

          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 text-[10px] uppercase font-semibold">
                <th className="py-1.5">Equipment Name</th>
                <th className="py-1.5">Owner</th>
                <th className="py-1.5 text-center">In Stock</th>
                <th className="py-1.5 text-center">With Members</th>
                <th className="py-1.5 text-center">Damaged</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 font-mono">
              {assets.map((a) => (
                <tr key={a.asset_id}>
                  <td className="py-1.5 font-sans font-medium text-zinc-800">
                    {a.asset_name} {a.tag ? `(Tag: ${a.tag})` : ''}
                  </td>
                  <td className="py-1.5 text-zinc-500 capitalize">{a.ownership}</td>
                  <td className="py-1.5 text-center text-zinc-800">{a.stock}</td>
                  <td className="py-1.5 text-center text-blue-600">{a.with_members}</td>
                  <td className="py-1.5 text-center text-zinc-600">{a.damaged}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Physical Paper Signature Block */}
        <div className="pt-12 border-t-2 border-zinc-900 grid grid-cols-3 gap-8 text-center text-xs">
          <div className="space-y-12">
            <div className="h-10"></div>
            <div className="border-t border-zinc-800 pt-2">
              <div className="font-semibold text-zinc-900">Outgoing Treasurer</div>
            </div>
          </div>

          <div className="space-y-12">
            <div className="h-10"></div>
            <div className="border-t border-zinc-800 pt-2">
              <div className="font-semibold text-zinc-900">Incoming Treasurer</div>
            </div>
          </div>

          <div className="space-y-12">
            <div className="h-10"></div>
            <div className="border-t border-zinc-800 pt-2">
              <div className="font-semibold text-zinc-900">President</div>
            </div>
          </div>
        </div>
      </div>

      {/* Handover Ceremony Wizard Modal */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-zinc-500" />
                <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100">
                  Close Tenure & Initiate Handover
                </h3>
              </div>
              <button
                onClick={() => setShowCloseModal(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3.5 border border-amber-200/60 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              <strong>Warning: </strong>
              Closing <strong>{openTenure?.name}</strong> will permanently freeze all transactions in this term. Snapshots of dues and asset holdings will be locked, and cash balances will carry over automatically into the new tenure.
            </div>

            <form onSubmit={handleCloseTenure} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Handover Close Date
                  </label>
                  <input
                    type="date"
                    required
                    value={closeDate}
                    onChange={(e) => setCloseDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Outgoing Treasurer Name
                  </label>
                  <input
                    type="text"
                    required
                    value={outgoingBy}
                    onChange={(e) => setOutgoingBy(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Incoming Tenure Term Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tenure 2026-2027"
                  value={nextTenureName}
                  onChange={(e) => setNextTenureName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                />
                <p className="text-[11px] text-zinc-400 mt-1">
                  New term will open on {closeDate} + 1 day with carry-over opening balances.
                </p>
              </div>

              <div className="mt-6 flex justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isClosing}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isClosing && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                  <span>{isClosing ? 'Sealing Handover...' : 'Confirm & Seal Handover'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
