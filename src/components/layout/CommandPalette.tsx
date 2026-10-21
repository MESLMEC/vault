import React, { useEffect, useState } from 'react';
import {
  Search,
  PlusCircle,
  Users,
  Coins,
  Scale,
  Calendar,
  Wrench,
  CheckCircle2,
  FileText,
  Moon,
  Sun,
  X,
  LayoutDashboard,
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
  onQuickRecord: (type: 'deposit' | 'expense' | 'fee') => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onQuickRecord,
  isDark,
  onToggleTheme,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery('');
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actions = [
    {
      category: 'Quick Financial Actions',
      items: [
        {
          id: 'record-deposit',
          label: 'Record Money In (Deposit)',
          desc: 'Log general funds, sponsorship, or grant into Pool',
          icon: PlusCircle,
          run: () => onQuickRecord('deposit'),
        },
        {
          id: 'record-expense',
          label: 'Record Money Out (Expense)',
          desc: 'Log component or tool purchase out of an envelope',
          icon: Coins,
          run: () => onQuickRecord('expense'),
        },
        {
          id: 'collect-fees',
          label: 'Collect Weekly Member Fees',
          desc: 'Quick multi-member dues entry & lump sums',
          icon: Users,
          run: () => onQuickRecord('fee'),
        },
      ],
    },
    {
      category: 'Navigate to Views',
      items: [
        {
          id: 'nav-dashboard',
          label: 'Financial Overview',
          desc: 'Key metrics, charts, cash velocity & envelope distribution',
          icon: LayoutDashboard,
          run: () => onNavigate('dashboard'),
        },
        {
          id: 'nav-ledger',
          label: 'Money & Ledger',
          desc: 'Envelope cards and full transaction history',
          icon: Coins,
          run: () => onNavigate('ledger'),
        },
        {
          id: 'nav-dues',
          label: 'Members & Standing',
          desc: 'Weekly dues, who owes, and waivers',
          icon: Users,
          run: () => onNavigate('dues'),
        },
        {
          id: 'nav-allocation',
          label: 'Allocation Session',
          desc: 'Split pool into envelopes with committee',
          icon: Scale,
          run: () => onNavigate('allocation'),
        },
        {
          id: 'nav-events',
          label: 'Events & Cost Centers',
          desc: 'Competitions, projects, and leftover sweeps',
          icon: Calendar,
          run: () => onNavigate('events'),
        },
        {
          id: 'nav-assets',
          label: 'Equipment & Register',
          desc: 'Who has what, lending, and admin replacements',
          icon: Wrench,
          run: () => onNavigate('assets'),
        },
        {
          id: 'nav-reconciliation',
          label: 'Monthly Reconciliation (Match)',
          desc: 'Match screen to treasurer notes & suspect diagnosis',
          icon: CheckCircle2,
          run: () => onNavigate('reconciliation'),
        },
        {
          id: 'nav-handover',
          label: 'Tenure & Handover Ceremony',
          desc: 'Close committee term & print paper certificate',
          icon: FileText,
          run: () => onNavigate('handover'),
        },
      ],
    },
    {
      category: 'System',
      items: [
        {
          id: 'toggle-theme',
          label: isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme',
          desc: 'Toggle application color scheme',
          icon: isDark ? Sun : Moon,
          run: onToggleTheme,
        },
      ],
    },
  ];

  const filteredCategories = actions
    .map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.desc.toLowerCase().includes(query.toLowerCase())
      ),
    }))
    .filter((cat) => cat.items.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl">
        <div className="flex items-center border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
          <Search className="h-5 w-5 text-zinc-400 mr-3" />
          <input
            type="text"
            placeholder="Type a command or jump to screen... (ESC to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none"
          />
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {filteredCategories.length === 0 ? (
            <div className="py-8 text-center text-sm text-zinc-500">
              No matching commands found for "{query}".
            </div>
          ) : (
            filteredCategories.map((cat) => (
              <div key={cat.category} className="mb-3">
                <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {cat.category}
                </div>
                <div className="space-y-0.5">
                  {cat.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          item.run();
                          onClose();
                        }}
                        className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{item.label}</div>
                          <div className="text-xs text-zinc-500 truncate">{item.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-2 text-[11px] text-zinc-400 flex items-center justify-between">
          <span>Navigate with mouse or arrow keys</span>
          <span>Press ESC to dismiss</span>
        </div>
      </div>
    </div>
  );
};
