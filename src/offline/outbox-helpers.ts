import { enqueue } from './outbox';
import { supabase } from '@/lib/supabase';

export interface OfflineResult<T> {
  queued: boolean;
  data?: T;
}

function isNetworkError(err: unknown) {
  if (!navigator.onLine) return true;
  const message = String((err as { message?: string })?.message ?? err ?? '');
  return /failed to fetch|networkerror|network request failed|load failed|timeout/i.test(message);
}

/**
 * Run an idempotent operation online, or queue it for replay when offline.
 * The operation id is generated ONCE by the caller and reused on retries.
 */
export async function runWithOfflineSupport<T>(opts: {
  operationId: string;
  kind: 'create_order' | 'pay_order' | 'set_order_status' | 'create_and_pay';
  payload: Record<string, unknown>;
  localRef?: string;
  dependsOn?: string;
  online: () => Promise<T>;
}): Promise<OfflineResult<T>> {
  if (!navigator.onLine) {
    await enqueue({
      operation_id: opts.operationId,
      kind: opts.kind,
      payload: opts.payload,
      local_ref: opts.localRef,
      depends_on: opts.dependsOn,
    });
    return { queued: true };
  }

  try {
    const data = await opts.online();
    return { queued: false, data };
  } catch (err) {
    if (isNetworkError(err)) {
      await enqueue({
        operation_id: opts.operationId,
        kind: opts.kind,
        payload: opts.payload,
        local_ref: opts.localRef,
        depends_on: opts.dependsOn,
      });
      return { queued: true };
    }
    throw err;
  }
}

export function newOperationId() {
  return crypto.randomUUID();
}

export function localRef() {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `L-${new Date().toISOString().slice(5, 10).replace('-', '')}-${suffix}`;
}

export { supabase };
