import { dbPromise } from './db';
import type { OutboxItem } from '@/types';

export const OUTBOX_EVENT = 'erp-outbox-changed';

function notify() {
  window.dispatchEvent(new Event(OUTBOX_EVENT));
}

export async function enqueue(item: Omit<OutboxItem, 'created_at' | 'attempts' | 'next_retry_at' | 'status'>) {
  const db = await dbPromise;
  const record: OutboxItem = {
    ...item,
    created_at: Date.now(),
    attempts: 0,
    next_retry_at: 0,
    status: 'pending',
  };
  await db.put('outbox', record);
  notify();
  return record;
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const db = await dbPromise;
  const items = await db.getAllFromIndex('outbox', 'by-created');
  return items;
}

export async function updateOutbox(operationId: string, patch: Partial<OutboxItem>) {
  const db = await dbPromise;
  const existing = await db.get('outbox', operationId);
  if (!existing) return;
  await db.put('outbox', { ...existing, ...patch });
  notify();
}

export async function removeOutbox(operationId: string) {
  const db = await dbPromise;
  await db.delete('outbox', operationId);
  notify();
}

export async function outboxCounts() {
  const items = await listOutbox();
  return {
    pending: items.filter((i) => i.status === 'pending' || i.status === 'processing').length,
    failed: items.filter((i) => i.status === 'failed').length,
    done: items.filter((i) => i.status === 'done').length,
    total: items.length,
    items,
  };
}

export async function clearDone() {
  const db = await dbPromise;
  const items = await listOutbox();
  await Promise.all(items.filter((i) => i.status === 'done').map((i) => db.delete('outbox', i.operation_id)));
  notify();
}
