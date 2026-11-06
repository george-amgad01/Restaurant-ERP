import { supabase } from '@/lib/supabase';
import type { DailyKpi, EmployeePerformance, ItemSale, Order } from '@/types';

export async function getDailyKpis(from: string, to: string) {
  const { data, error } = await supabase
    .from('v_daily_kpis')
    .select('*')
    .gte('day', from)
    .lte('day', to)
    .order('day');
  if (error) throw error;
  return (data ?? []) as DailyKpi[];
}

export async function getItemSales(from: string, to: string) {
  const { data, error } = await supabase.rpc('item_sales', {
    p_from: `${from}T00:00:00`,
    p_to: `${to}T23:59:59`,
  });
  if (error) throw error;
  return (data ?? []) as ItemSale[];
}

export async function getEmployeePerformance(from: string, to: string) {
  const { data, error } = await supabase.rpc('employee_performance', {
    p_from: `${from}T00:00:00`,
    p_to: `${to}T23:59:59`,
  });
  if (error) throw error;
  return (data ?? []) as EmployeePerformance[];
}

export async function getOpenOrders() {
  const { data, error } = await supabase
    .from('v_open_orders')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Order[];
}

export async function getPaymentBreakdown(from: string, to: string) {
  const { data, error } = await supabase
    .from('payments')
    .select('method, amount')
    .eq('status', 'succeeded')
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`);
  if (error) throw error;

  const totals = new Map<string, number>();
  for (const row of (data ?? []) as { method: string; amount: number }[]) {
    totals.set(row.method, (totals.get(row.method) ?? 0) + Number(row.amount));
  }
  return Array.from(totals, ([method, total]) => ({ method, total }));
}

export async function getExpenseTotals(from: string, to: string) {
  const { data, error } = await supabase.rpc('expense_totals', { p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []) as { category: string; total: number }[];
}

export async function getLowStock() {
  const { data, error } = await supabase.from('v_low_stock').select('*').order('quantity');
  if (error) throw error;
  return data ?? [];
}

export async function getOrderCounts() {
  const { data, error } = await supabase.from('v_open_orders').select('status');
  if (error) throw error;
  const counts = { new: 0, preparing: 0, ready: 0, served: 0, draft: 0 } as Record<string, number>;
  for (const row of (data ?? []) as { status: string }[]) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}
