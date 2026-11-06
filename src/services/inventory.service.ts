import { supabase } from '@/lib/supabase';
import type { InventoryStock, InventoryTransaction, Supplier } from '@/types';

export async function listStock() {
  const { data, error } = await supabase.from('v_inventory_stock').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as InventoryStock[];
}

export async function listLowStock() {
  const { data, error } = await supabase.from('v_low_stock').select('*').order('quantity');
  if (error) throw error;
  return (data ?? []) as InventoryStock[];
}

export async function listTransactions(filters: {
  ingredientId?: string;
  type?: string;
  from?: string;
  to?: string;
  limit?: number;
} = {}) {
  let query = supabase
    .from('inventory_transactions')
    .select('*, ingredient:ingredients(name, unit), supplier:suppliers(name)')
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.ingredientId) query = query.eq('ingredient_id', filters.ingredientId);
  if (filters.type && filters.type !== 'all') query = query.eq('type', filters.type);
  if (filters.from) query = query.gte('created_at', `${filters.from}T00:00:00`);
  if (filters.to) query = query.lte('created_at', `${filters.to}T23:59:59`);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as InventoryTransaction[];
}

export async function listSuppliers() {
  const { data, error } = await supabase.from('suppliers').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Supplier[];
}

export async function saveSupplier(input: Partial<Supplier> & { name: string }) {
  if (input.id) {
    const { error } = await supabase.from('suppliers').update(input).eq('id', input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await supabase.from('suppliers').insert(input).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function recordPurchase(
  supplierId: string | null,
  items: { ingredient_id: string; quantity: number; unit_cost: number }[],
  reference?: string,
) {
  const { error } = await supabase.rpc('record_purchase', {
    p_supplier_id: supplierId,
    p_items: items,
    p_reference: reference ?? null,
  });
  if (error) throw error;
}

export async function recordWaste(ingredientId: string, quantity: number, reason: string) {
  const { error } = await supabase.rpc('record_inventory_transaction', {
    p_ingredient_id: ingredientId,
    p_type: 'waste',
    p_quantity: Math.abs(quantity),
    p_unit_cost: null,
    p_reason: reason,
    p_supplier_id: null,
    p_reference: null,
  });
  if (error) throw error;
}

export async function recordAdjustment(ingredientId: string, quantity: number, reason: string) {
  const { error } = await supabase.rpc('record_inventory_transaction', {
    p_ingredient_id: ingredientId,
    p_type: 'adjustment',
    p_quantity: quantity,
    p_unit_cost: null,
    p_reason: reason,
    p_supplier_id: null,
    p_reference: null,
  });
  if (error) throw error;
}

export async function submitStocktake(
  items: { ingredient_id: string; counted_quantity: number }[],
  reason: string,
) {
  const { error } = await supabase.rpc('stocktake', { p_items: items, p_reason: reason });
  if (error) throw error;
}

export async function checkConsistency() {
  const { data, error } = await supabase.rpc('inventory_consistency');
  if (error) throw error;
  return (data ?? []) as {
    ingredient_id: string;
    name: string;
    balance: number;
    ledger_total: number;
    difference: number;
  }[];
}
