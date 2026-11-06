import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  ChefHat,
  CircleDollarSign,
  ClipboardList,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { useRealtimeRefetch } from '@/realtime/useRealtimeRefetch';
import {
  getDailyKpis,
  getEmployeePerformance,
  getExpenseTotals,
  getItemSales,
  getLowStock,
  getOpenOrders,
  getPaymentBreakdown,
} from '@/services/dashboard.service';
import { daysAgoISO, money, todayISO, statusLabel, statusTone, orderTypeLabel } from '@/lib/utils';
import { Badge, Card, CardHeader, EmptyState, PageHeader, PageLoader, StatCard } from '@/components/ui';
import { cn } from '@/lib/utils';

const STATUS_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#f43f5e', '#64748b'];

function Delta({ current, previous }: { current: number; previous: number }) {
  if (!previous) return <span className="text-xs text-ink-400">No prior data</span>;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium',
        up ? 'text-emerald-600' : 'text-rose-600',
      )}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export default function DashboardPage() {
  const { currency, settings } = useSettings();
  const { has } = useAuth();
  const [days, setDays] = useState(30);

  const from = daysAgoISO(days - 1);
  const to = todayISO();
  const prevFrom = daysAgoISO(days * 2 - 1);
  const prevTo = daysAgoISO(days);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', from, to, prevFrom, prevTo],
    queryFn: async () => {
      const [kpis, prevKpis, items, expenses, expensesPrev, lowStock, employees, payments] = await Promise.all([
        getDailyKpis(from, to),
        getDailyKpis(prevFrom, prevTo),
        getItemSales(from, to),
        getExpenseTotals(from, to),
        getExpenseTotals(prevFrom, prevTo),
        getLowStock(),
        has('dashboard.view') ? getEmployeePerformance(from, to) : Promise.resolve([]),
        getPaymentBreakdown(from, to),
      ]);
      return { kpis, prevKpis, items, expenses, expensesPrev, lowStock, employees, payments };
    },
  });

  const openQuery = useQuery({
    queryKey: ['open-orders'],
    queryFn: getOpenOrders,
  });
  useRealtimeRefetch(() => void openQuery.refetch(), { table: 'orders' });

  const totals = useMemo(() => {
    const k = data?.kpis ?? [];
    const p = data?.prevKpis ?? [];
    const sum = (rows: typeof k, key: keyof (typeof k)[number]) =>
      rows.reduce((acc, row) => acc + Number(row[key] ?? 0), 0);

    const revenue = sum(k, 'revenue');
    const prevRevenue = sum(p, 'revenue');
    const orders = sum(k, 'orders_count');
    const prevOrders = sum(p, 'orders_count');
    const profit = sum(k, 'gross_profit');
    const prevProfit = sum(p, 'gross_profit');
    const cogs = sum(k, 'cogs');
    const expenses = (data?.expenses ?? []).reduce((a, e) => a + Number(e.total), 0);
    const prevExpenses = (data?.expensesPrev ?? []).reduce((a, e) => a + Number(e.total), 0);

    return {
      revenue,
      prevRevenue,
      orders,
      prevOrders,
      profit,
      prevProfit,
      cogs,
      expenses,
      prevExpenses,
      aov: orders ? revenue / orders : 0,
      prevAov: prevOrders ? prevRevenue / prevOrders : 0,
      net: profit - expenses,
      margin: revenue > 0 ? (profit / revenue) * 100 : 0,
    };
  }, [data]);

  const openOrders = openQuery.data ?? [];
  const openByStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const order of openOrders) map.set(order.status, (map.get(order.status) ?? 0) + 1);
    return map;
  }, [openOrders]);

  if (isLoading) return <PageLoader label="Loading business indicators…" />;

  const topItems = (data?.items ?? []).slice(0, 6);
  const worstItems = [...(data?.items ?? [])].filter((i) => i.quantity >= 2).slice(-5).reverse();
  const periods = [7, 30, 90];

  return (
    <div>
      <PageHeader
        title="Owner dashboard"
        subtitle={`${settings?.restaurant_name ?? 'Restaurant'} · ${from} → ${to}`}
        actions={
          <div className="flex rounded-lg border border-ink-200 bg-white p-1">
            {periods.map((p) => (
              <button
                key={p}
                onClick={() => setDays(p)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition',
                  days === p ? 'bg-brand-600 text-white' : 'text-ink-500 hover:text-ink-800',
                )}
              >
                {p}d
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={money(totals.revenue, currency)}
          hint={undefined}
          icon={<CircleDollarSign className="h-5 w-5" />}
        />
        <StatCard
          label="Orders"
          value={totals.orders}
          icon={<ClipboardList className="h-5 w-5" />}
          tone="text-blue-600 bg-blue-50"
        />
        <StatCard
          label="Avg. order value"
          value={money(totals.aov, currency)}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="text-violet-600 bg-violet-50"
        />
        <StatCard
          label="Net result"
          value={money(totals.net, currency)}
          hint={`Gross profit ${money(totals.profit, currency)} − expenses`}
          icon={<Wallet className="h-5 w-5" />}
          tone={totals.net >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="card flex items-center justify-between px-4 py-3 text-sm">
          <span className="text-ink-500">Revenue vs previous period</span>
          <Delta current={totals.revenue} previous={totals.prevRevenue} />
        </div>
        <div className="card flex items-center justify-between px-4 py-3 text-sm">
          <span className="text-ink-500">Orders vs previous period</span>
          <Delta current={totals.orders} previous={totals.prevOrders} />
        </div>
        <div className="card flex items-center justify-between px-4 py-3 text-sm">
          <span className="text-ink-500">Gross margin</span>
          <span className="font-semibold text-ink-800">{totals.margin.toFixed(1)}%</span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Sales trend" subtitle="Completed & paid orders" />
          <div className="h-72 px-2 py-4">
            {(data?.kpis ?? []).length === 0 ? (
              <EmptyState title="No sales in this period" description="Completed orders will appear here." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.kpis ?? []}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={70} />
                  <Tooltip
                    formatter={(value: number) => money(value, currency)}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#059669" strokeWidth={2} fill="url(#revenueFill)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Ongoing orders" subtitle="Live" actions={<Badge tone="bg-brand-50 text-brand-700 border-brand-200">{openOrders.length} open</Badge>} />
          <div className="divide-y divide-ink-100">
            {openOrders.length === 0 ? (
              <EmptyState icon={<ChefHat className="h-8 w-8" />} title="No open orders" />
            ) : (
              openOrders.slice(0, 6).map((order) => (
                <Link key={order.id} to={`/orders?id=${order.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-ink-50">
                  <div>
                    <p className="text-sm font-medium text-ink-800">#{order.order_number}</p>
                    <p className="text-xs text-ink-500">
                      {orderTypeLabel[order.order_type]}
                      {order.table_no ? ` · Table ${order.table_no}` : ''}
                    </p>
                  </div>
                  <Badge tone={statusTone[order.status]}>{statusLabel[order.status]}</Badge>
                </Link>
              ))
            )}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-ink-100 px-4 py-3 text-xs text-ink-500">
            {Array.from(openByStatus.entries()).map(([status, count]) => (
              <span key={status} className="rounded-full bg-ink-100 px-2 py-0.5">
                {statusLabel[status]}: {count}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Top selling items" subtitle="By revenue" />
          <div className="h-64 px-3 py-3">
            {topItems.length === 0 ? (
              <EmptyState title="No item sales yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topItems} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="item_name"
                    width={110}
                    tick={{ fontSize: 11, fill: '#475569' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(value: number) => money(value, currency)}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <Bar dataKey="revenue" fill="#10b981" radius={[0, 6, 6, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Expenses by category" subtitle="Selected period" />
          <div className="h-64 px-3 py-3">
            {(data?.expenses ?? []).length === 0 ? (
              <EmptyState title="No expenses recorded" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data?.expenses ?? []}
                    dataKey="total"
                    nameKey="category"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {(data?.expenses ?? []).map((_, index) => (
                      <Cell key={index} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => money(value, currency)}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-[11px] text-ink-500">
            {(data?.expenses ?? []).slice(0, 6).map((e, i) => (
              <span key={e.category} className="inline-flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[i % STATUS_COLORS.length] }}
                />
                {e.category}
              </span>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Low stock alerts" subtitle="Reorder soon" actions={<AlertTriangle className="h-4 w-4 text-amber-500" />} />
          <div className="divide-y divide-ink-100">
            {(data?.lowStock ?? []).length === 0 ? (
              <EmptyState title="Stock levels are healthy" />
            ) : (
              (data?.lowStock ?? []).slice(0, 6).map((item: { ingredient_id: string; name: string; quantity: number; unit: string; low_stock_threshold: number }) => (
                <div key={item.ingredient_id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm text-ink-800">{item.name}</p>
                    <p className="text-xs text-ink-500">Threshold {item.low_stock_threshold} {item.unit}</p>
                  </div>
                  <span className="text-xs font-semibold text-amber-700">
                    {item.quantity} {item.unit}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-ink-100 px-4 py-3">
            <Link to="/inventory" className="text-xs font-medium text-brand-700 hover:underline">
              Open inventory →
            </Link>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Employee performance" subtitle="By completed revenue" actions={<Users className="h-4 w-4 text-ink-400" />} />
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="text-right">Orders</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Avg.</th>
                </tr>
              </thead>
              <tbody>
                {(data?.employees ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center text-xs text-ink-400">No data</td>
                  </tr>
                ) : (
                  (data?.employees ?? []).slice(0, 6).map((e) => (
                    <tr key={e.profile_id}>
                      <td className="font-medium text-ink-800">{e.full_name}</td>
                      <td className="text-right">{e.orders_count}</td>
                      <td className="text-right">{money(e.revenue, currency)}</td>
                      <td className="text-right text-ink-500">{money(e.avg_order_value, currency)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Needs attention" subtitle="Items worth reviewing" actions={<Banknote className="h-4 w-4 text-ink-400" />} />
          <div className="space-y-3 p-4">
            <div className="flex items-start gap-3 rounded-lg border border-ink-200 p-3">
              <Receipt className="mt-0.5 h-4 w-4 text-ink-400" />
              <div className="text-sm">
                <p className="font-medium text-ink-800">Cost of goods sold</p>
                <p className="text-xs text-ink-500">
                  {money(totals.cogs, currency)} in this period — {totals.revenue > 0 ? ((totals.cogs / totals.revenue) * 100).toFixed(1) : '0'}% of revenue.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-ink-200 p-3">
              <Wallet className="mt-0.5 h-4 w-4 text-ink-400" />
              <div className="text-sm">
                <p className="font-medium text-ink-800">Expenses</p>
                <p className="text-xs text-ink-500">
                  {money(totals.expenses, currency)} · <Delta current={totals.expenses} previous={totals.prevExpenses} /> vs previous
                </p>
              </div>
            </div>
            {worstItems.length > 0 && (
              <div className="rounded-lg border border-ink-200 p-3">
                <p className="text-sm font-medium text-ink-800">Lowest revenue items</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {worstItems.map((i) => (
                    <span key={i.menu_item_id} className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-600">
                      {i.item_name} · {i.quantity}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
