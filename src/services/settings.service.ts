import { supabase } from '@/lib/supabase';
import type { OrderTypeSetting, PaymentMethod } from '@/types';

export async function listPaymentMethods(includeInactive = false) {
  let query = supabase.from('payment_methods').select('*').order('sort_order');
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PaymentMethod[];
}

export async function savePaymentMethod(input: Partial<PaymentMethod> & { code: string; name: string }) {
  if (input.id) {
    const { error } = await supabase.from('payment_methods').update(input).eq('id', input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await supabase.from('payment_methods').insert(input).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function deletePaymentMethod(id: string) {
  const { error } = await supabase.from('payment_methods').delete().eq('id', id);
  if (error) throw error;
}

export async function listOrderTypes() {
  const { data, error } = await supabase.from('order_type_settings').select('*').order('order_type');
  if (error) throw error;
  return (data ?? []) as OrderTypeSetting[];
}

export async function updateOrderType(orderType: string, patch: Partial<OrderTypeSetting>) {
  const { error } = await supabase.from('order_type_settings').update(patch).eq('order_type', orderType);
  if (error) throw error;
}

export async function listExpenseCategoriesAll() {
  const { data, error } = await supabase.from('expense_categories').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as { id: string; name: string; is_active: boolean }[];
}

export async function saveExpenseCategory(input: { id?: string; name: string; is_active?: boolean }) {
  if (input.id) {
    const { error } = await supabase.from('expense_categories').update(input).eq('id', input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await supabase.from('expense_categories').insert(input).select('id').single();
  if (error) throw error;
  return data.id as string;
}
