import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Coins,
  ShieldCheck,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Wallet,
  Calendar,
  Layers,
  PieChart as PieChartIcon,
  BarChart3,
  Activity,
  PlusCircle,
  Clock,
  Sparkles,
  DollarSign,
  ChevronRight,
  Scale,
  Share2,
} from 'lucide-react';
import { FeeReceiptModal } from '../dues/FeeReceiptModal';
import { InteractiveAreaChart, AreaChartData, ChartPoint } from '../ui/InteractiveAreaChart';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  EnvelopeBalance,
  LedgerEntryView,
  MemberStanding,
  CostCenterSummary,
  ReconciliationStatus,
  AllocationContext,
} from '@/lib/db/types';
import { formatTaka, formatDate } from '@/lib/utils';

interface FinanceDashboardProps {
  envelopes: EnvelopeBalance[];
  entries: LedgerEntryView[];
  standing: MemberStanding[];
  costCenters: CostCenterSummary[];
  recStatus: ReconciliationStatus | null;
  allocContext: AllocationContext | null;
  onNavigate: (view: string) => void;
  onQuickRecord: (type: 'deposit' | 'expense' | 'fee') => void;
}

// Chart visual palettes
const ENVELOPE_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#64748b', // slate
];

const SOURCE_COLORS: Record<string, string> = {
  admin_grant: '#3b82f6',
  weekly_fee: '#10b981',
  sponsorship: '#f59e0b',
  registration: '#8b5cf6',
  donation: '#06b6d4',
  other: '#64748b',
};

const SOURCE_LABELS: Record<string, string> = {
  admin_grant: 'Admin & Dept Grants',
  weekly_fee: 'Member Weekly Fees',
  sponsorship: 'Sponsorships & Partners',
  registration: 'Event Registrations',
  donation: 'Donations & Gifts',
  other: 'Other Receipts',
};

export const FinanceDashboard: React.FC<FinanceDashboardProps> = ({
  envelopes,
  entries,
  standing,
  costCenters,
  recStatus,
  allocContext,
  onNavigate,
  onQuickRecord,
}) => {
  const [timelineMode, setTimelineMode] = useState<'monthly' | 'cumulative'>('cumulative');
  const [timeRange, setTimeRange] = useState<'all' | '6m' | '30d'>('all');
  const [receiptTx, setReceiptTx] = useState<LedgerEntryView | null>(null);

  // --- 1. OVERALL TOTAL FINANCIAL KPI METRICS ---
  const kpis = useMemo(() => {
    // Total liquid cash is sum of all active envelopes
    const totalLiquid = envelopes.reduce((acc, env) => acc + (env.active ? env.balance : 0), 0);
    const generalPool = envelopes.find((e) => e.is_pool)?.balance ?? 0;
    const allocatedEnvelopesTotal = totalLiquid - generalPool;

    // Filter valid (non-voided, non-reversal) transactions
    const validEntries = entries.filter((e) => !e.is_voided && e.kind !== 'reversal');

    let totalInflow = 0;
    let totalOutflow = 0;

    validEntries.forEach((tx) => {
      if (tx.kind === 'deposit' || tx.kind === 'opening') {
        const sumIn = tx.lines.reduce((s, l) => (l.amount > 0 ? s + l.amount : s), 0);
        totalInflow += sumIn;
      } else if (tx.kind === 'expense') {
        const sumOut = tx.lines.reduce((s, l) => (l.amount < 0 ? s + Math.abs(l.amount) : s), 0);
        totalOutflow += sumOut;
      }
    });

    const netSurplus = totalInflow - totalOutflow;

    // Member dues metrics
    const totalArrears = standing.reduce(
      (sum, m) => (m.balance < 0 ? sum + Math.abs(m.balance) : sum),
      0
    );
    const totalPrepaid = standing.reduce(
      (sum, m) => (m.balance > 0 ? sum + m.balance : sum),
      0
    );
    const activeMembers = standing.filter((m) => m.is_member_now);
    const membersInGoodStanding = activeMembers.filter((m) => m.balance >= 0).length;
    const complianceRate =
      activeMembers.length > 0
        ? Math.round((membersInGoodStanding / activeMembers.length) * 100)
        : 100;
    const severeArrearsCount = standing.filter((m) => m.weeks_overdue >= 4).length;

    return {
      totalLiquid,
      generalPool,
      allocatedEnvelopesTotal,
      totalInflow,
      totalOutflow,
      netSurplus,
      totalArrears,
      totalPrepaid,
      activeMembersCount: activeMembers.length,
      complianceRate,
      severeArrearsCount,
    };
  }, [envelopes, entries, standing]);

  // --- 2. MONTHLY TIMELINE CASH FLOW DATA ---
  const timelineData = useMemo(() => {
    // Sort chronological
    const sorted = [...entries]
      .filter((e) => !e.is_voided && e.kind !== 'reversal')
      .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));

    // Group by Month (YYYY-MM)
    const monthMap = new Map<
      string,
      { month: string; label: string; inflow: number; outflow: number; net: number; balance: number }
    >();

    let runningBalance = 0;

    sorted.forEach((tx) => {
      const monthKey = tx.occurred_on.slice(0, 7); // e.g. "2025-09"
      if (!monthMap.has(monthKey)) {
        const d = new Date(monthKey + '-01T00:00:00');
        const label = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        monthMap.set(monthKey, {
          month: monthKey,
          label,
          inflow: 0,
          outflow: 0,
          net: 0,
          balance: 0,
        });
      }

      const item = monthMap.get(monthKey)!;

      if (tx.kind === 'deposit' || tx.kind === 'opening') {
        const inAmt = tx.lines.reduce((s, l) => (l.amount > 0 ? s + l.amount : s), 0);
        item.inflow += inAmt;
        runningBalance += inAmt;
      } else if (tx.kind === 'expense') {
        const outAmt = tx.lines.reduce((s, l) => (l.amount < 0 ? s + Math.abs(l.amount) : s), 0);
        item.outflow += outAmt;
        runningBalance -= outAmt;
      }

      item.net = item.inflow - item.outflow;
      item.balance = runningBalance;
    });

    const result = Array.from(monthMap.values());

    // Apply timeRange filter if specified
    if (timeRange === '30d') {
      return result.slice(-2);
    } else if (timeRange === '6m') {
      return result.slice(-6);
    }
    return result;
  }, [entries, timeRange]);

  // --- 2.1 INTERACTIVE AREA CHART VELOCITY DATA ---
  const velocityChartData = useMemo<AreaChartData>(() => {
    const valid = [...entries]
      .filter((e) => !e.is_voided && e.kind !== 'reversal')
      .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));

    const dayDeltaMap = new Map<string, number>();
    valid.forEach((tx) => {
      let net = 0;
      if (tx.kind === 'deposit' || tx.kind === 'opening') {
        net = tx.lines.reduce((s, l) => (l.amount > 0 ? s + l.amount : s), 0);
      } else if (tx.kind === 'expense') {
        net = -tx.lines.reduce((s, l) => (l.amount < 0 ? s + Math.abs(l.amount) : s), 0);
      }
      dayDeltaMap.set(tx.occurred_on, (dayDeltaMap.get(tx.occurred_on) || 0) + net);
    });

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const totalLiquid = envelopes.reduce((acc, env) => acc + (env.active ? env.balance : 0), 0);

    const buildDaysSeries = (numDays: number): ChartPoint[] => {
      const points: ChartPoint[] = [];
      let currentVal = totalLiquid;
      for (let i = 0; i < numDays; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const utcMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

        points.unshift({ date: utcMs, value: Math.max(0, currentVal) });

        const deltaOnDay = dayDeltaMap.get(dateStr) || 0;
        currentVal -= deltaOnDay;
      }
      return points;
    };

    const earliestDateStr = valid.length > 0 ? valid[0].occurred_on : new Date().toISOString().split('T')[0];
    const earliestDate = new Date(earliestDateStr + 'T00:00:00');
    const allDays = Math.max(14, Math.ceil((today.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    return {
      '7D': buildDaysSeries(7),
      '30D': buildDaysSeries(30),
      '6M': buildDaysSeries(Math.min(180, allDays)),
      'ALL': buildDaysSeries(Math.min(365 * 3, allDays)),
    };
  }, [entries, envelopes]);

  // --- 3. ENVELOPE DISTRIBUTION DATA ---
  const envelopeChartData = useMemo(() => {
    const total = envelopes.reduce((acc, env) => acc + (env.active ? Math.max(0, env.balance) : 0), 0);
    return envelopes
      .filter((e) => e.active && e.balance > 0)
      .map((env, idx) => ({
        id: env.id,
        name: env.name,
        value: env.balance,
        isPool: env.is_pool,
        targetCap: env.target_cap,
        percent: total > 0 ? Math.round((env.balance / total) * 100) : 0,
        fill: ENVELOPE_COLORS[idx % ENVELOPE_COLORS.length],
      }));
  }, [envelopes]);

  // --- 4. REVENUE / INCOME SOURCES BREAKDOWN ---
  const incomeSourcesData = useMemo(() => {
    const sourceMap: Record<string, number> = {
      admin_grant: 0,
      weekly_fee: 0,
      sponsorship: 0,
      registration: 0,
      donation: 0,
      other: 0,
    };

    entries.forEach((tx) => {
      if (!tx.is_voided && (tx.kind === 'deposit' || tx.kind === 'opening')) {
        const src = tx.source || (tx.kind === 'opening' ? 'other' : 'other');
        const inAmt = tx.lines.reduce((s, l) => (l.amount > 0 ? s + l.amount : s), 0);
        sourceMap[src] = (sourceMap[src] || 0) + inAmt;
      }
    });

    return Object.entries(sourceMap)
      .filter(([_, val]) => val > 0)
      .map(([key, value]) => ({
        sourceKey: key,
        name: SOURCE_LABELS[key] || key,
        amount: value,
        fill: SOURCE_COLORS[key] || '#64748b',
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [entries]);

  // --- 5. COST CENTERS & PROJECTS SOLVENCY ---
  const costCenterChartData = useMemo(() => {
    return costCenters.map((cc) => ({
      name: cc.name.length > 20 ? cc.name.slice(0, 18) + '...' : cc.name,
      fullName: cc.name,
      allocated: cc.money_in,
      spent: cc.money_out,
      leftover: cc.leftover,
      status: cc.status,
      kind: cc.kind,
    }));
  }, [costCenters]);

  // --- 6. TOP MEMBERS WITH ARREARS ---
  const membersWithArrears = useMemo(() => {
    return standing
      .filter((m) => m.balance < 0)
      .sort((a, b) => a.balance - b.balance) // most negative first
      .slice(0, 5);
  }, [standing]);

  // Chart configuration for shadcn chart container
  const cashFlowChartConfig: ChartConfig = {
    inflow: {
      label: 'Cash Inflow',
      color: '#10b981',
    },
    outflow: {
      label: 'Cash Outflow',
      color: '#f43f5e',
    },
    balance: {
      label: 'Net Reserve',
      color: '#6366f1',
    },
  };

  const costCenterChartConfig: ChartConfig = {
    allocated: {
      label: 'Budget In',
      color: '#3b82f6',
    },
    spent: {
      label: 'Spent Out',
      color: '#f43f5e',
    },
    leftover: {
      label: 'Leftover',
      color: '#10b981',
    },
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Lab Financial Overview
            </h1>
            <Badge variant="outline" className="border-emerald-300 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 font-mono text-[11px] gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Ledger Synced
            </Badge>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Real-time health, virtual envelope caps, cash velocity, dues compliance, and project solvency.
          </p>
        </div>

        {/* Header Action Shortcuts */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onQuickRecord('deposit')}
            className="text-xs gap-1.5"
          >
            <ArrowDownRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Money In</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onQuickRecord('expense')}
            className="text-xs gap-1.5"
          >
            <ArrowUpRight className="h-3.5 w-3.5 text-red-500" />
            <span>Money Out</span>
          </Button>
          <Button
            size="sm"
            onClick={() => onQuickRecord('fee')}
            className="text-xs gap-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
          >
            <Users className="h-3.5 w-3.5" />
            <span>Collect Fees</span>
          </Button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Liquid Treasury */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Lab Treasury
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Coins className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-50">
              {formatTaka(kpis.totalLiquid)}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
              <span>Allocated Envelopes:</span>
              <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
                {formatTaka(kpis.allocatedEnvelopesTotal)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-2.5">
              <Badge variant="success" className="text-[10px] px-1.5 py-0">
                100% Backed by Cash
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* KPI 2: General Pool & Safe Balance */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Unallocated Pool
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Wallet className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-50">
              {formatTaka(kpis.generalPool)}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
              <span>Safe (Net Credit):</span>
              <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
                {allocContext ? formatTaka(allocContext.pool_after_member_credit) : '—'}
              </span>
            </div>
            <div className="flex items-center gap-1 mt-2.5">
              <button
                onClick={() => onNavigate('allocation')}
                className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
              >
                Run Allocation Session <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* KPI 3: Cash Flow Net & Burn Rate */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Net Financial Flow
            </CardTitle>
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
              kpis.netSurplus >= 0
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
            }`}>
              {kpis.netSurplus >= 0 ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${
              kpis.netSurplus >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}>
              {kpis.netSurplus >= 0 ? `+${formatTaka(kpis.netSurplus)}` : formatTaka(kpis.netSurplus)}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
              <span>In: {formatTaka(kpis.totalInflow)}</span>
              <span>Out: {formatTaka(kpis.totalOutflow)}</span>
            </div>
            <div className="mt-2.5">
              <Progress
                value={kpis.totalInflow > 0 ? Math.min(100, Math.round((kpis.totalOutflow / kpis.totalInflow) * 100)) : 0}
                className="h-1.5"
                indicatorClassName="bg-rose-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* KPI 4: Member Dues & Audit Compliance */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Dues Health & Audit
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-50">
                {kpis.complianceRate}%
              </div>
              <Badge variant={kpis.totalArrears > 0 ? 'warning' : 'success'} className="text-[10px]">
                {kpis.totalArrears > 0 ? `${formatTaka(kpis.totalArrears)} Arrears` : 'Clean'}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
              <span>Prepaid Credits:</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                +{formatTaka(kpis.totalPrepaid)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2.5">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Audit: {recStatus?.days_since_last_match !== null && recStatus?.days_since_last_match !== undefined ? `${recStatus.days_since_last_match}d ago` : 'None'}
              </span>
              {recStatus && recStatus.entries_since_last_match > 0 && (
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  {recStatus.entries_since_last_match} unverified
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Charts Section 1: Cash Flow & Balance Trajectory */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-emerald-500" />
              Cash Flow Velocity & Cumulative Reserve
            </CardTitle>
            <CardDescription>
              Chronological inflow receipts, expenditures, and liquid lab reserve progression.
            </CardDescription>
          </div>

          <div className="flex items-center gap-3">
            {timelineMode === 'monthly' && (
              /* Range Selector for Bar Breakdown */
              <div className="flex items-center rounded-lg border border-border bg-muted/30 p-1 text-xs">
                <button
                  onClick={() => setTimeRange('all')}
                  className={`px-2.5 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                    timeRange === 'all'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All Time
                </button>
                <button
                  onClick={() => setTimeRange('6m')}
                  className={`px-2.5 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                    timeRange === '6m'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  6 Months
                </button>
                <button
                  onClick={() => setTimeRange('30d')}
                  className={`px-2.5 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                    timeRange === '30d'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Recent
                </button>
              </div>
            )}

            {/* Toggle Graph Mode */}
            <div className="flex items-center rounded-lg border border-border bg-muted/30 p-1 text-xs">
              <button
                onClick={() => setTimelineMode('cumulative')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                  timelineMode === 'cumulative'
                    ? 'bg-background text-foreground shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Interactive Velocity
              </button>
              <button
                onClick={() => setTimelineMode('monthly')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                  timelineMode === 'monthly'
                    ? 'bg-background text-foreground shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                In vs Out Breakdown
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-2">
          {timelineMode === 'cumulative' ? (
            <InteractiveAreaChart
              data={velocityChartData}
              defaultRange="30D"
              title="Liquid Cash Reserve"
              height={300}
              currencySymbol="৳"
              chartColor="text-emerald-500 dark:text-emerald-400"
            />
          ) : (
            <ChartContainer config={cashFlowChartConfig} className="h-[280px] w-full pt-4">
              <BarChart data={timelineData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `৳${(val / 1000).toFixed(0)}k`}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(val, name) => (
                        <div className="flex items-center justify-between gap-4 w-full">
                          <span className="text-muted-foreground">
                            {name === 'inflow' ? 'Cash Inflow' : 'Cash Outflow'}:
                          </span>
                          <span className="font-mono font-semibold tabular-nums text-foreground">
                            {formatTaka(Number(val))}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Bar
                  dataKey="inflow"
                  name="inflow"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
                <Bar
                  dataKey="outflow"
                  name="outflow"
                  fill="#f43f5e"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>

        <CardFooter className="flex items-center justify-between border-t border-border/40 py-2.5 px-6 text-xs text-muted-foreground bg-muted/10">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Total Inflows: <strong className="font-mono text-foreground">{formatTaka(kpis.totalInflow)}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              Total Outflows: <strong className="font-mono text-foreground">{formatTaka(kpis.totalOutflow)}</strong>
            </span>
          </div>
          <button
            onClick={() => onNavigate('ledger')}
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-1"
          >
            View Detailed Ledger <ChevronRight className="h-3 w-3" />
          </button>
        </CardFooter>
      </Card>

      {/* Row 2: Two Columns: Envelope Allocation & Revenue Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Envelope Distribution & Budget Caps */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <PieChartIcon className="h-4 w-4 text-blue-500" />
                Virtual Envelope Distribution
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 gap-1"
                onClick={() => onNavigate('ledger')}
              >
                <span>Manage</span>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
            <CardDescription>
              Allocation across dedicated pots and unallocated pool balance.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col justify-between pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              {/* Donut Chart */}
              <div className="h-[200px] w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={envelopeChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                    >
                      {envelopeChartData.map((entry) => (
                        <Cell key={`cell-${entry.id}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any) => [formatTaka(Number(val)), 'Balance']}
                      contentStyle={{
                        backgroundColor: 'rgba(24, 24, 27, 0.95)',
                        border: '1px solid rgba(63, 63, 70, 0.4)',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Envelope Utilization Details */}
              <div className="space-y-3 pr-2">
                {envelopeChartData.map((env) => {
                  const cap = env.targetCap;
                  const capPct = cap ? Math.min(100, Math.round((env.value / cap) * 100)) : null;

                  return (
                    <div key={env.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 truncate font-medium text-zinc-800 dark:text-zinc-200">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: env.fill }}
                          />
                          <span className="truncate">{env.name}</span>
                          {env.isPool && (
                            <span className="text-[10px] text-blue-500 font-semibold">(Pool)</span>
                          )}
                        </span>
                        <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100 shrink-0">
                          {formatTaka(env.value)}
                        </span>
                      </div>

                      {cap !== null && capPct !== null ? (
                        <div className="space-y-0.5">
                          <Progress
                            value={capPct}
                            className="h-1.5"
                            indicatorClassName={capPct >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}
                          />
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>Cap: {formatTaka(cap)}</span>
                            <span>{capPct}% filled</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-muted-foreground">
                          {env.isPool ? 'Flexible Buffer' : 'No Cap Limit'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>

          <CardFooter className="border-t border-border/40 py-2.5 px-6 text-xs text-muted-foreground bg-muted/10 flex justify-between">
            <span>
              Total Envelopes: <strong className="text-foreground">{envelopeChartData.length} active</strong>
            </span>
            <button
              onClick={() => onNavigate('allocation')}
              className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
            >
              Divide Pool Funds <ChevronRight className="h-3 w-3" />
            </button>
          </CardFooter>
        </Card>

        {/* Revenue Streams by Source */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-emerald-500" />
              Income Breakdown by Source
            </CardTitle>
            <CardDescription>
              Categorized revenue receipts funding the laboratory treasury.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex-1 pt-2">
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={incomeSourcesData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `৳${(val / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    width={110}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(val: any) => [formatTaka(Number(val)), 'Total Inflow']}
                    contentStyle={{
                      backgroundColor: 'rgba(24, 24, 27, 0.95)',
                      border: '1px solid rgba(63, 63, 70, 0.4)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {incomeSourcesData.map((entry) => (
                      <Cell key={`source-${entry.sourceKey}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>

          <CardFooter className="border-t border-border/40 py-2.5 px-6 text-xs text-muted-foreground bg-muted/10 flex justify-between">
            <span>
              Top Inflow: <strong className="text-foreground">{incomeSourcesData[0]?.name ?? 'N/A'}</strong> ({formatTaka(incomeSourcesData[0]?.amount ?? 0)})
            </span>
            <button
              onClick={() => onQuickRecord('deposit')}
              className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5"
            >
              Record New Deposit <ChevronRight className="h-3 w-3" />
            </button>
          </CardFooter>
        </Card>
      </div>

      {/* Row 3: Cost Centers / Event Solvency & Member Arrears */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cost Centers & Event Solvency (2 cols) */}
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calendar className="h-4 w-4 text-amber-500" />
                  Events & Project Budgets (Cost Centers)
                </CardTitle>
                <CardDescription>
                  Tracking allocated project funds against actual expenses and sweeping leftovers.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 gap-1"
                onClick={() => onNavigate('events')}
              >
                <span>View All</span>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="flex-1 pt-2">
            <ChartContainer config={costCenterChartConfig} className="h-[220px] w-full">
              <BarChart data={costCenterChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `৳${val}`}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(val, name) => (
                        <div className="flex items-center justify-between gap-4 w-full">
                          <span className="text-muted-foreground">
                            {name === 'allocated' ? 'Budget In' : name === 'spent' ? 'Spent' : 'Leftover'}:
                          </span>
                          <span className="font-mono font-semibold tabular-nums text-foreground">
                            {formatTaka(Number(val))}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Bar dataKey="allocated" name="allocated" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="spent" name="spent" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="leftover" name="leftover" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>

          <CardFooter className="border-t border-border/40 py-2.5 px-6 text-xs text-muted-foreground bg-muted/10 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                Budget In
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                Spent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Leftover
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {costCenters.filter((c) => c.status === 'active').length} active projects
            </span>
          </CardFooter>
        </Card>

        {/* Member Dues Overdue & Arrears Watchlist (1 col) */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Arrears Watchlist
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 gap-1"
                onClick={() => onNavigate('dues')}
              >
                <span>Dues Sheet</span>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
            <CardDescription>
              Members with unpaid weekly contributions requiring follow-up.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex-1 space-y-3 pt-2">
            {membersWithArrears.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-36 text-center text-muted-foreground">
                <ShieldCheck className="h-8 w-8 text-emerald-500 mb-2" />
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Zero Outstanding Arrears!
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  All active lab members are up to date on their weekly dues.
                </p>
              </div>
            ) : (
              membersWithArrears.map((m) => (
                <div
                  key={m.who_id}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                      {m.who_name}
                    </div>
                    <div className="text-[11px] text-rose-500 font-medium">
                      {m.weeks_overdue} {m.weeks_overdue === 1 ? 'week' : 'weeks'} overdue
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-xs font-bold text-rose-600 dark:text-rose-400">
                      {formatTaka(m.balance)}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => onQuickRecord('fee')}
                      title="Quick collect fee"
                    >
                      Collect
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>

          <CardFooter className="border-t border-border/40 py-2.5 px-6 text-xs text-muted-foreground bg-muted/10 flex justify-between">
            <span>
              Total Uncollected: <strong className="text-rose-600 dark:text-rose-400 font-mono">{formatTaka(kpis.totalArrears)}</strong>
            </span>
            <button
              onClick={() => onQuickRecord('fee')}
              className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
            >
              Quick Collect <ChevronRight className="h-3 w-3" />
            </button>
          </CardFooter>
        </Card>
      </div>

      {/* Row 4: Recent High Impact Activity / Audit Health */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-zinc-500" />
              Recent High-Impact Financial Activity
            </CardTitle>
            <CardDescription>
              Latest immutable double-entry ledger transactions recorded in current tenure.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('ledger')}
            className="text-xs gap-1"
          >
            <span>Full Ledger Book</span>
            <ChevronRight className="h-3 w-3" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-medium">
                  <th className="pb-2 pl-1">Date</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Description / Note</th>
                  <th className="pb-2">Source / Cost Center</th>
                  <th className="pb-2">Logged By</th>
                  <th className="pb-2 pr-1 text-right">Net Value</th>
                  <th className="pb-2 text-center w-12">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {entries
                  .filter((e) => !e.is_voided)
                  .slice(0, 5)
                  .map((tx) => {
                    const isPositive =
                      tx.kind === 'deposit' || tx.kind === 'opening' || tx.kind === 'sweep';
                    const totalAmt = tx.lines.reduce((s, l) => s + Math.abs(l.amount), 0);
                    const isFee =
                      tx.source === 'weekly_fee' ||
                      tx.tag === 'fees' ||
                      !!tx.member_id ||
                      !!tx.member_name;

                    return (
                      <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 pl-1 font-mono text-muted-foreground">
                          {formatDate(tx.occurred_on)}
                        </td>
                        <td className="py-2.5">
                          <Badge
                            variant={
                              tx.kind === 'deposit'
                                ? 'success'
                                : tx.kind === 'expense'
                                ? 'destructive'
                                : tx.kind === 'transfer'
                                ? 'info'
                                : 'secondary'
                            }
                            className="capitalize text-[10px] font-normal"
                          >
                            {tx.kind}
                          </Badge>
                        </td>
                        <td className="py-2.5 font-medium text-foreground max-w-xs truncate">
                          {tx.note || '—'}
                        </td>
                        <td className="py-2.5 text-muted-foreground">
                          {tx.cost_center_name ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                              {tx.cost_center_name}
                            </span>
                          ) : tx.source ? (
                            <span className="capitalize">{tx.source.replace('_', ' ')}</span>
                          ) : tx.tag ? (
                            <span className="text-[11px]">#{tx.tag}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2.5 text-muted-foreground">{tx.recorded_by}</td>
                        <td className="py-2.5 pr-1 text-right font-mono font-semibold">
                          <span
                            className={
                              isPositive
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : tx.kind === 'expense'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-foreground'
                            }
                          >
                            {tx.kind === 'expense'
                              ? `-${formatTaka(totalAmt)}`
                              : isPositive
                              ? `+${formatTaka(totalAmt)}`
                              : formatTaka(totalAmt)}
                          </span>
                        </td>
                        <td className="py-2.5 text-center">
                          {isFee ? (
                            <button
                              onClick={() => setReceiptTx(tx)}
                              title="Share fee receipt / snapshot"
                              className="p-1 rounded text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                            >
                              <Share2 className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <FeeReceiptModal
        isOpen={!!receiptTx}
        onClose={() => setReceiptTx(null)}
        transaction={receiptTx}
      />
    </div>
  );
};
