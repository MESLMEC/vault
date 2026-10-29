import React, { useState, useEffect, useRef } from 'react';
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
  User,
  LogOut,
} from 'lucide-react';
import { api } from '../../services/api';
import { authStorage } from '../../services/backendApi';
import { Tenure, ReconciliationStatus, AllocationContext } from '../../lib/db/types';
import { formatTaka } from '../../lib/utils';
import { CommandPalette } from './CommandPalette';
import { AuthModal } from '../common/AuthModal';
import { useConfirmation } from '../../context/ConfirmationContext';
import { Sidebar, useSidebar, SidebarSection } from '../ui/Sidebar';

interface AppShellProps {
  currentView: string;
  onNavigate: (view: string) => void;
  children: React.ReactNode;
  onQuickRecord: (type: 'deposit' | 'expense' | 'fee') => void;
  refreshTrigger: number;
  onDataChanged: () => void;
  onLogout?: () => void;
}

function SidebarFooterContent({
  openTenure,
  onBackupExport,
  onBackupImport,
  onResetSeed,
}: {
  openTenure: Tenure | null;
  onBackupExport: () => void;
  onBackupImport: () => void;
  onResetSeed: () => void;
}) {
  const { collapsed } = useSidebar();

  return (
    <div className="space-y-1.5">
      {openTenure && (
        <div
          className={`rounded-lg border border-zinc-200/70 dark:border-zinc-800/70 bg-zinc-50/80 dark:bg-zinc-900/80 transition-all ${
            collapsed ? 'p-1.5 flex justify-center' : 'p-2 space-y-1'
          }`}
          title={collapsed ? `Active Term: ${openTenure.name} (since ${openTenure.opened_on})` : undefined}
        >
          {collapsed ? (
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                  Current Term
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </span>
              </div>
              <div className="font-semibold text-xs text-zinc-800 dark:text-zinc-200 truncate">
                {openTenure.name}
              </div>
              <div className="text-[10px] text-zinc-500 truncate">Since {openTenure.opened_on}</div>
            </>
          )}
        </div>
      )}

      {collapsed ? (
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={onBackupExport}
            className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
            title="Backup database JSON"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={onBackupImport}
            className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
            title="Restore database JSON"
          >
            <Upload className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="px-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Data & Storage
          </div>
          <div className="grid grid-cols-2 gap-1 text-xs">
            <button
              onClick={onBackupExport}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px] font-medium transition-colors"
              title="Export complete database backup as JSON"
            >
              <Download className="h-3.5 w-3.5" />
              Backup
            </button>
            <button
              onClick={onBackupImport}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px] font-medium transition-colors"
              title="Restore database from JSON backup"
            >
              <Upload className="h-3.5 w-3.5" />
              Restore
            </button>
          </div>
          <button
            onClick={onResetSeed}
            className="w-full flex items-center gap-1.5 rounded-md px-2 py-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px] transition-colors"
            title="Reset to clean blank database"
          >
            <RefreshCw className="h-3 w-3" />
            Reset Blank State
          </button>
        </div>
      )}
    </div>
  );
}

export const AppShell: React.FC<AppShellProps> = ({
  currentView,
  onNavigate,
  children,
  onQuickRecord,
  refreshTrigger,
  onDataChanged,
  onLogout,
}) => {
  const { confirm, notify } = useConfirmation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const username = authStorage.getUsername() || 'Treasurer';
  const [isDark, setIsDark] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('mesl_theme');
      if (stored === 'dark') return true;
      if (stored === 'light') return false;
    }
    return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
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

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    if (profileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [profileOpen]);

  const handleSignOut = async () => {
    setProfileOpen(false);
    const ok = await confirm({
      title: 'Sign Out',
      description: 'Are you sure you want to sign out of MESL Vault? You will need to log in again to access the treasury.',
      confirmLabel: 'Sign Out',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (ok) {
      api.auth.logout();
      onLogout?.();
    }
  };

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('mesl_theme', next ? 'dark' : 'light');
    }
    if (next) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const sidebarSections: SidebarSection[] = [
    {
      title: 'Treasury & Ledger',
      items: [
        {
          id: 'dashboard',
          label: 'Financial Overview',
          icon: <LayoutDashboard />,
        },
        {
          id: 'ledger',
          label: 'Money & Ledger',
          icon: <Coins />,
        },
        {
          id: 'dues',
          label: 'Fees & Members',
          icon: <Users />,
        },
      ],
    },
    {
      title: 'Operations',
      items: [
        {
          id: 'allocation',
          label: 'Allocation Session',
          icon: <Scale />,
        },
        {
          id: 'events',
          label: 'Events & Projects',
          icon: <Calendar />,
        },
        {
          id: 'assets',
          label: 'Equipment & Assets',
          icon: <Wrench />,
        },
      ],
    },
    {
      title: 'Governance',
      items: [
        {
          id: 'reconciliation',
          label: 'Monthly Match',
          icon: <CheckCircle2 />,
          badge:
            recStatus && recStatus.entries_since_last_match > 0
              ? `${recStatus.entries_since_last_match}`
              : undefined,
        },
        {
          id: 'handover',
          label: 'Tenure & Handover',
          icon: <FileText />,
        },
      ],
    },
  ];

  const sidebarHeader = (
    <div className="flex items-center gap-2.5 overflow-hidden">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-sm shadow-sm">
        M
      </div>
      <div className="truncate">
        <div className="font-semibold text-sm leading-tight text-zinc-900 dark:text-zinc-100">
          MESL Vault
        </div>
        <div className="text-[11px] text-zinc-500 truncate">Secure?</div>
      </div>
    </div>
  );

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
            notify({
              title: 'Backup Import Failed',
              description: err?.message || 'Could not parse or apply the backup JSON file.',
              variant: 'danger',
            });
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleResetSeed = async () => {
    const ok = await confirm({
      title: 'Reset Local Database',
      description: 'Clear all local records and reset to a clean blank database? This will clear all local dummy/sample changes.',
      confirmLabel: 'Reset Database',
      variant: 'danger',
    });
    if (ok) {
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

      {/* EasyUI Sidebar */}
      <Sidebar
        sections={sidebarSections}
        activeId={currentView}
        onActiveChange={onNavigate}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
        header={sidebarHeader}
        footer={
          <SidebarFooterContent
            openTenure={openTenure}
            onBackupExport={handleBackupExport}
            onBackupImport={handleBackupImport}
            onResetSeed={handleResetSeed}
          />
        }
      />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header Bar */}
        <header className="flex h-16 items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 sm:px-6 no-print">
          {/* Left: Sidebar Toggle & Search Bar */}
          <div className="flex items-center gap-3 sm:gap-4 flex-1 max-w-md lg:max-w-lg">
            <button
              onClick={() => {
                if (window.matchMedia('(min-width: 768px)').matches) {
                  setSidebarCollapsed(!sidebarCollapsed);
                } else {
                  setMobileOpen(!mobileOpen);
                }
              }}
              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              title="Toggle navigation (⌘B)"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Search Bar / Cmd+K trigger */}
            <button
              onClick={() => setCmdOpen(true)}
              className="w-full flex items-center justify-between gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 text-xs text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5 truncate">
                <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <span className="truncate">Search actions, members, entries...</span>
              </div>
              <kbd className="hidden sm:inline-flex items-center rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500 shadow-2xs shrink-0">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Right: Theme Switcher & Profile Icon with Sign Out */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme switcher */}
            <button
              onClick={toggleTheme}
              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            >
              {isDark ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Profile Icon with Dropdown to Sign Out */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen((prev) => !prev)}
                className="flex items-center gap-2 p-1 rounded-full border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 bg-zinc-50 dark:bg-zinc-800/80 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-zinc-400/40"
                title={`Signed in as ${username}`}
                aria-expanded={profileOpen}
              >
                <div className="h-8 w-8 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center text-xs font-bold uppercase shadow-sm">
                  {username.charAt(0) || 'T'}
                </div>
              </button>

              {/* Profile Dropdown */}
              {profileOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center gap-3 p-2.5 border-b border-zinc-100 dark:border-zinc-800">
                    <div className="h-9 w-9 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center text-sm font-bold uppercase shrink-0">
                      {username.charAt(0) || 'T'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                        {username}
                      </div>
                      <div className="text-[11px] text-zinc-500 truncate">
                        MESL Lab Treasurer
                      </div>
                    </div>
                  </div>

                  <div className="pt-1.5 mt-1 border-t border-zinc-100 dark:border-zinc-800">
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable View Content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
};
