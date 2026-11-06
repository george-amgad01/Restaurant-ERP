import { supabase } from '@/lib/supabase';
import type { AiMessage, AiReport } from '@/types';

export async function askAssistant(question: string) {
  const { data, error } = await supabase.functions.invoke('ai-assistant', {
    body: { question },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as { answer: string; period?: { from: string; to: string } };
}

export async function listReports(limit = 30) {
  const { data, error } = await supabase
    .from('ai_reports')
    .select('*')
    .order('report_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AiReport[];
}

export async function listMessages(limit = 50) {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AiMessage[];
}

export async function generateDailyReport(date: string) {
  const { data, error } = await supabase.functions.invoke('ai-daily-report', { body: { date } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as { date: string; summary: string };
}

export async function getDailyMetrics(date: string) {
  const { data, error } = await supabase.rpc('ai_daily_metrics', { p_date: date });
  if (error) throw error;
  return data as Record<string, unknown>;
}
