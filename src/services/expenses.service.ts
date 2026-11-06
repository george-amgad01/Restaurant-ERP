import { supabase } from '@/lib/supabase';
import type { Expense, ExpenseCategory } from '@/types';

export interface ExpenseFilters {
  from?: string;
  to?: string;
  categoryId?: string;
  search?: string;
}

export async function listExpenses(filters: ExpenseFilters = {}) {
  let query = supabase
    .from('expenses')
    .select('*, category:expense_categories(name), creator:profiles(full_name)')
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(300);

  if (filters.from) query = query.gte('expense_date', filters.from);
  if (filters.to) query = query.lte('expense_date', filters.to);
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.search) query = query.ilike('description', `%${filters.search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Expense[];
}

export async function listExpenseCategories() {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []) as ExpenseCategory[];
}

export async function uploadReceipt(file: File, userId: string) {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${userId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('expense-receipts').upload(path, file);
  if (error) throw error;
  return path;
}

export async function createExpense(input: {
  category_id: string | null;
  amount: number;
  expense_date: string;
  description: string;
  receipt?: File | null;
}) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not authenticated');

  let receiptPath: string | null = null;
  if (input.receipt) receiptPath = await uploadReceipt(input.receipt, userId);

  const { data, error } = await supabase
    .from('expenses')
    .insert({
      category_id: input.category_id,
      amount: input.amount,
      expense_date: input.expense_date,
      description: input.description,
      receipt_path: receiptPath,
      created_by: userId,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateExpense(id: string, patch: Partial<Expense>) {
  const { error } = await supabase.from('expenses').update(patch).eq('id', id);
  if (error) throw error;
}

export async function voidExpense(id: string, reason: string) {
  const { error } = await supabase
    .from('expenses')
    .update({ is_void: true, void_reason: reason })
    .eq('id', id);
  if (error) throw error;
}

export async function getReceiptUrl(path: string) {
  const { data, error } = await supabase.storage
    .from('expense-receipts')
    .createSignedUrl(path, 60 * 5);
  if (error) throw error;
  return data.signedUrl;
}

export async function expenseTotals(from: string, to: string) {
  const { data, error } = await supabase.rpc('expense_totals', { p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []) as { category: string; total: number }[];
}
