import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function money(value: number | string | null | undefined, currency = 'EGP') {
  const n = Number(value ?? 0);
  try {
    return new Intl.NumberFormat('en-EG', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function num(value: number | string | null | undefined, digits = 2) {
  return Number(value ?? 0).toFixed(digits);
}

export function dateTime(value: string | Date | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function dateOnly(value: string | Date | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export function timeOnly(value: string | Date | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function elapsed(from: string | Date) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function startOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export const orderTypeLabel: Record<string, string> = {
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
};

export const statusLabel: Record<string, string> = {
  draft: 'Draft',
  new: 'New',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Served',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const statusTone: Record<string, string> = {
  draft: 'bg-ink-100 text-ink-600 border-ink-200',
  new: 'bg-blue-50 text-blue-700 border-blue-200',
  preparing: 'bg-amber-50 text-amber-700 border-amber-200',
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  served: 'bg-violet-50 text-violet-700 border-violet-200',
  completed: 'bg-emerald-600 text-white border-emerald-600',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
};

export const paymentTone: Record<string, string> = {
  unpaid: 'bg-rose-50 text-rose-700 border-rose-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  refunded: 'bg-ink-100 text-ink-600 border-ink-200',
  partially_refunded: 'bg-ink-100 text-ink-600 border-ink-200',
};

export function initials(name: string | null | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return '?';
  return parts.map((p) => p[0]?.toUpperCase()).join('');
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
