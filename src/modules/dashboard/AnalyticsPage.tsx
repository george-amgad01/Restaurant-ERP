import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Banknote,
  Boxes,
  Download,
  Printer,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import {
  getDailyKpis,
  getEmployeePerformance,
  getExpenseTotals,
  getItemSales,
  getPaymentBreakdown,
} from '@/services/dashboard.service';
import { listStock } from '@/services/inventory.service';
import { cn, daysAgoISO, downloadCsv, money, num, todayISO } from '@/lib/utils';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, PageLoader, StatCard } from '@/components/ui';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#f43f5e', '#14b8a6', '#64748b'];

export default function AnalyticsPage() {
  const { currency, settings } = useSettings();
  const [from, setFrom] = useState(daysAgoISO(29));
  const [to, setTo] = useState(todayISO());

  const report = useQuery({
    queryKey: ['analytics', from, to],
    queryFn: async () => {
      const [kpis, items, employees, payments, expenses, stock] = await Promise.all([
        getDailyKpis(from, to),
        getItemSales(from, to),
        getEmployeePerformance(from, to),
        getPaymentBreakdown(from, to),
        getExpenseTotals(from, to),
        listStock(),
      ]);
      return { kpis, items, employees, payments, expenses, stock };
    },
  });

  const totals = useMemo(() => {
    const kpis = report.data?.kpis ?? [];
    const revenue = kpis.reduce((a, k) => a + Number(k.revenue), 0);
    const orders = kpis.reduce((a, k) => a + Number(k.orders_count), 0);
    const cogs = kpis.reduce((a, k) => a + Number(k.cogs), 0);
    const expenses = (report.data?.expenses ?? []).reduce((a, e) => a + Number(e.total), 0);
    const stockValue = (report.data?.stock ?? []).reduce((a, s) => a + Number(s.stock_value), 0);
    return {
      revenue,
      orders,
      cogs,
      expenses,
      stockValue,
      grossProfit: revenue - cogs,
      net: revenue - cogs - expenses,
      aov: orders ? revenue / orders : 0,
      margin: revenue ? ((revenue - cogs) / revenue) * 100 : 0,
    };
  }, [report.data]);

  if (report.isLoading) return <PageLoader label="Building report…" />;

  const items = report.data?.items ?? [];
  const employees = (report.data?.employees ?? []).filter((e) => e.orders_count > 0);
  const payments = report.data?.payments ?? [];
  const expenses = report.data?.expenses ?? [];
  const lowStock = (report.data?.stock ?? []).filter((s) => s.is_low);

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle={`${settings?.restaurant_name ?? 'Restaurant'} · ${from} → ${to}`}
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue" value={money(totals.revenue, currency)} icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard
          label="Gross profit"
          value={money(totals.grossProfit, currency)}
          hint={`${totals.margin.toFixed(1)}% margin · COGS ${money(totals.cogs, currency)}`}
          icon={<Banknote className="h-5 w-5" />}
          tone="text-emerald-600 bg-emerald-50"
        />
        <StatCard
          label="Net result"
          value={money(totals.net, currency)}
          hint={`Expenses ${money(totals.expenses, currency)}`}
          icon={<Wallet className="h-5 w-5" />}
          tone={totals.net >= 0 ? 'text-violet-600 bg-violet-50' : 'text-rose-600 bg-rose-50'}
        />
        <StatCard
          label="Inventory value"
          value={money(totals.stockValue, currency)}
          hint={`${lowStock.length} item(s) low`}
          icon={<Boxes className="h-5 w-5" />}
          tone="text-amber-600 bg-amber-50"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Revenue & profit" subtitle="Daily completed orders" />
          <div className="h-72 px-2 py-4">
            {(report.data?.kpis ?? []).length === 0 ? (
              <EmptyState title="No completed sales in this period" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={report.data?.kpis ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={70} />
                  <Tooltip formatter={(value: number) => money(value, currency)} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#059669" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="gross_profit" name="Gross profit" stroke="#7c3aed" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Payment mix" subtitle="Succeeded payments" />
          <div className="h-72 px-2 py-4">
            {payments.length === 0 ? (
              <EmptyState title="No payments" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={payments} dataKey="total" nameKey="method" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {payments.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value: number) => money(value, currency)} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Item profitability"
            subtitle="Snapshot cost at time of sale"
            actions={
              <Button variant="ghost" size="sm" onClick={() => downloadCsv(`item-sales-${from}-${to}.csv`, items.map((i) => ({
                item: i.item_name, quantity: i.quantity, revenue: i.revenue, cost: i.cost, profit: i.profit,
                margin_pct: Number(i.revenue) ? ((Number(i.profit) / Number(i.revenue)) * 100).toFixed(1) : '0',
              })))}>
                <Download className="h-4 w-4" /> CSV
              </Button>
            }
          />
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Cost</th>
                  <th className="text-right">Profit</th>
                  <th className="text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState title="No item sales" /></td></tr>
                ) : (
                  items.map((item) => {
                    const margin = Number(item.revenue) ? (Number(item.profit) / Number(item.revenue)) * 100 : 0;
                    return (
                      <tr key={item.menu_item_id ?? item.item_name}>
                        <td className="font-medium text-ink-800">{item.item_name}</td>
                        <td className="text-right tabular-nums">{item.quantity}</td>
                        <td className="text-right tabular-nums">{money(item.revenue, currency)}</td>
                        <td className="text-right tabular-nums text-ink-500">{money(item.cost, currency)}</td>
                        <td className={cn('text-right tabular-nums font-medium', Number(item.profit) >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                          {money(item.profit, currency)}
                        </td>
                        <td className="text-right">
                          <Badge tone={margin >= 50 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : margin >= 25 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200'}>
                            {margin.toFixed(1)}%
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Employee performance" subtitle="Completed orders credited to creator" actions={<Users className="h-4 w-4 text-ink-400" />} />
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="text-right">Orders</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Average</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr><td colSpan={4}><EmptyState title="No attributed sales" /></td></tr>
                ) : (
                  employees.map((e) => (
                    <tr key={e.profile_id}>
                      <td className="font-medium text-ink-800">{e.full_name}</td>
                      <td className="text-right tabular-nums">{e.orders_count}</td>
                      <td className="text-right tabular-nums">{money(e.revenue, currency)}</td>
                      <td className="text-right tabular-nums text-ink-500">{money(e.avg_order_value, currency)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Expenses" subtitle="By category in selected period" />
          <div className="h-64 px-2 py-4">
            {expenses.length === 0 ? (
              <EmptyState title="No expenses" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expenses} layout="vertical" margin={{ left: 8, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="category" width={110} tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value: number) => money(value, currency)} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={16}>
                    {expenses.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Stock health" subtitle={`${lowStock.length} low / ${report.data?.stock.length ?? 0} tracked`} />
          <div className="divide-y divide-ink-100">
            {lowStock.length === 0 ? (
              <EmptyState icon={<Boxes className="h-8 w-8" />} title="All items healthy" />
            ) : (
              lowStock.slice(0, 8).map((s) => (
                <div key={s.ingredient_id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm text-ink-800">{s.name}</p>
                    <p className="text-xs text-ink-500">Reorder at {num(s.low_stock_threshold, 1)} {s.unit}</p>
                  </div>
                  <span className="text-xs font-semibold text-amber-700">{num(s.quantity, 1)} {s.unit}</span>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-ink-100 px-4 py-3 text-xs text-ink-500">
            Average order value <span className="font-semibold text-ink-800">{money(totals.aov, currency)}</span> across {totals.orders} order(s).
          </div>
        </Card>
      </div>
    </div>
  );
}
