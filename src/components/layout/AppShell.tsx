import React, { useState, useEffect } from 'react';
import {
  Coins,
  Users,
  Scale,
  Calendar,
  Wrench,
  CheckCircle2,
  FileText,
  PlusCircle,
  Menu,
  Moon,
  Sun,
  Download,
  Upload,
  RefreshCw,
  Search,
  AlertTriangle,
  Clock,
  ShieldCheck,
  LayoutDashboard,
} from 'lucide-react';
import { api } from '../../services/api';
import { Tenure, ReconciliationStatus, AllocationContext } from '../../lib/db/types';
import { formatTaka } from '../../lib/utils';
import { CommandPalette } from './CommandPalette';
import { AuthModal } from '../common/AuthModal';

interface AppShellProps {
  currentView: string;
  onNavigate: (view: string) => void;
  children: React.ReactNode;
  onQuickRecord: (type: 'deposit' | 'expense' | 'fee') => void;
  refreshTrigger: number;
  onDataChanged: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentView,
  onNavigate,
  children,
  onQuickRecord,
  refreshTrigger,
  onDataChanged,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.classList.contains('dark');
  });

  const [openTenure, setOpenTenure] = useState<Tenure | null>(null);
  const [recStatus, setRecStatus] = useState<ReconciliationStatus | null>(null);
  const [allocContext, setAllocContext] = useState<AllocationContext | null>(null);
  const [backendOnline, setBackendOnline] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(api.auth.isAuthenticated());

  useEffect(() => {
    const loadHeaderStats = async () => {
      try {
        const health = await api.auth.checkBackendHealth();
        setBackendOnline(health.online);
        setIsAuthenticated(api.auth.isAuthenticated());
      } catch {
        setBackendOnline(false);
      }
      try {
        const tenure = await api.getOpenTenure();
        setOpenTenure(tenure);
      } catch {
        setOpenTenure(null);
      }
      try {
        const rec = await api.getReconciliationStatus();
        setRecStatus(rec);
      } catch {}
      try {
        const ctx = await api.getAllocationContext();
        setAllocContext(ctx);
      } catch {}
    };
    loadHeaderStats();
  }, [refreshTrigger]);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Financial Overview', icon: LayoutDashboard, desc: 'Summary, Metrics & Charts' },
    { id: 'ledger', label: 'Money & Ledger', icon: Coins, desc: 'Envelopes & Cash Flow' },
    { id: 'dues', label: 'Fees & Members', icon: Users, desc: 'Weekly Dues & Arrears' },
    { id: 'allocation', label: 'Allocation Session', icon: Scale, desc: 'Divide General Pool' },
    { id: 'events', label: 'Events & Projects', icon: Calendar, desc: 'Cost Centers & Sweeps' },
    { id: 'assets', label: 'Equipment & Assets', icon: Wrench, desc: 'Inventory & Loans' },
    { id: 'reconciliation', label: 'Monthly Match', icon: CheckCircle2, desc: 'Verify Notes vs Screen' },
    { id: 'handover', label: 'Tenure & Handover', icon: FileText, desc: 'Lock Period & Print' },
  ];

  const handleBackupExport = () => {
    api.exportBackupJson();
  };

  const handleBackupImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            api.importBackupJson(event.target?.result as string);
            onDataChanged();
          } catch (err: any) {
            alert(err.message);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleResetSeed = () => {
    if (confirm('Reset lab database to default sample seed data? All current changes will be overwritten.')) {
      api.resetToSeed();
      onDataChanged();
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Command Palette */}
      <CommandPalette
        isOpen={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onNavigate={onNavigate}
        onQuickRecord={onQuickRecord}
        isDark={isDark}
        onToggleTheme={toggleTheme}
      />

      {/* Backend Auth & Mode Modal */}
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthChange={onDataChanged}
      />

      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 transition-all duration-200 z-30 no-print ${
          sidebarOpen ? 'w-64' : 'w-16'
        }`}
      >
        {/* Lab Branding Header */}
        <div className="flex h-16 items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4">
          {sidebarOpen ? (
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-sm shadow-sm">
                ME
              </div>
              <div className="truncate">
                <div className="font-semibold text-sm leading-tight text-zinc-900 dark:text-zinc-100">
                  MESL Vault
                </div>
                <div className="text-[11px] text-zinc-500 truncate">Electronics Lab Finance</div>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-sm">
              M
            </div>
          )}
        </div>

        {/* Current Tenure Tag */}
        {sidebarOpen && openTenure && (
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/60 dark:bg-zinc-900/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                Current Term
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Active
              </span>
            </div>
            <div className="font-semibold text-xs mt-1 text-zinc-800 dark:text-zinc-200 truncate">
              {openTenure.name}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">Since {openTenure.opened_on}</div>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                title={!sidebarOpen ? item.label : undefined}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
                } ${!sidebarOpen ? 'justify-center px-0' : ''}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {sidebarOpen && (
                  <div className="text-left flex-1 min-w-0">
                    <div className="truncate leading-snug">{item.label}</div>
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Utility Controls */}
        <div className="border-t border-zinc-200 dark:border-zinc-800 p-2 space-y-1">
          {sidebarOpen ? (
            <div className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Data & Storage
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <button
                  onClick={handleBackupExport}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px]"
                  title="Export complete database backup as JSON"
                >
                  <Download className="h-3.5 w-3.5" />
                  Backup
                </button>
                <button
                  onClick={handleBackupImport}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px]"
                  title="Restore database from JSON backup"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Restore
                </button>
              </div>
              <button
                onClick={handleResetSeed}
                className="w-full flex items-center gap-1.5 rounded-md px-2 py-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px]"
                title="Reset to lab sample seed data"
              >
                <RefreshCw className="h-3 w-3" />
                Reset Sample Data
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={handleBackupExport}
                className="p-2 rounded text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Backup"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header Bar */}
        <header className="flex h-16 items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 no-print">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200"
              title="Toggle sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Global Search / Cmd+K trigger */}
            <button
              onClick={() => setCmdOpen(true)}
              className="flex items-center gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search actions, members, entries...</span>
              <kbd className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Quick Financial Indicators */}
          <div className="hidden lg:flex items-center gap-6 text-xs">
            {/* Safe Pool Balance */}
            {allocContext && (
              <div className="flex items-center gap-2">
                <span className="text-zinc-400">Pool Available:</span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatTaka(allocContext.pool_balance)}
                </span>
                {allocContext.member_credit_held > 0 && (
                  <span
                    className="text-[11px] text-zinc-500"
                    title={`৳${allocContext.member_credit_held.toLocaleString()} member advance fee credit held`}
                  >
                    (Safe: {formatTaka(allocContext.pool_after_member_credit)})
                  </span>
                )}
              </div>
            )}

            {/* Reconciliation Health Tracker */}
            {recStatus && (
              <div className="flex items-center gap-2 border-l border-zinc-200 dark:border-zinc-800 pl-6">
                <Clock className="h-3.5 w-3.5 text-zinc-400" />
                <span className="text-zinc-400">Last Match:</span>
                <span
                  className={`font-mono font-medium ${
                    (recStatus.days_since_last_match ?? 0) > 30
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  {recStatus.days_since_last_match !== null
                    ? `${recStatus.days_since_last_match}d ago`
                    : 'Never'}
                </span>
                {recStatus.entries_since_last_match > 0 && (
                  <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
                    {recStatus.entries_since_last_match} unverified
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Top Actions: Quick Buttons & Theme */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onQuickRecord('deposit')}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm"
            >
              <PlusCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Money In</span>
            </button>

            <button
              onClick={() => onQuickRecord('expense')}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm"
            >
              <Coins className="h-3.5 w-3.5 text-red-500" />
              <span>Money Out</span>
            </button>

            <button
              onClick={() => onQuickRecord('fee')}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-sm"
            >
              <Users className="h-3.5 w-3.5" />
              <span>Collect Fees</span>
            </button>

            <button
              onClick={() => setAuthOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-sm"
              title="Click to manage backend connection and authentication"
            >
              <ShieldCheck className={`h-3.5 w-3.5 ${isAuthenticated ? 'text-emerald-500' : backendOnline ? 'text-blue-500' : 'text-zinc-400'}`} />
              <span className="hidden sm:inline">
                {isAuthenticated ? 'API: Live (Auth)' : backendOnline ? 'API: Live (Guest)' : 'Local Engine'}
              </span>
            </button>

            <button
              onClick={toggleTheme}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-600 dark:hover:text-zinc-200 ml-1"
              title="Toggle theme"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {/* Scrollable View Content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
};
