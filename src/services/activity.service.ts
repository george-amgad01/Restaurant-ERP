import { supabase } from '@/lib/supabase';
import type { ActivityLog } from '@/types';

export interface ActivityFilters {
  search?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export async function listActivity(filters: ActivityFilters = {}) {
  let query = supabase
    .from('activity_logs')
    .select('*, actor:profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.action) query = query.ilike('action', `%${filters.action}%`);
  if (filters.from) query = query.gte('created_at', `${filters.from}T00:00:00`);
  if (filters.to) query = query.lte('created_at', `${filters.to}T23:59:59`);
  if (filters.search) {
    query = query.or(
      `action.ilike.%${filters.search}%,table_name.ilike.%${filters.search}%,record_id.ilike.%${filters.search}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ActivityLog[];
}

export async function listSyncOperations(limit = 100) {
  const { data, error } = await supabase
    .from('sync_operations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
