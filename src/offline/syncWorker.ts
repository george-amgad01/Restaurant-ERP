import { listOutbox, updateOutbox } from './outbox';
import { executeOutboxItem, isPermanentError } from './executor';
import { requestPersistence } from './db';

let running = false;
let timer: number | null = null;

function backoffMs(attempts: number) {
  const base = [2000, 5000, 15000, 60000, 300000][Math.min(attempts, 4)];
  return base + Math.floor(Math.random() * 1000);
}

export async function processOutbox(): Promise<{ processed: number; failed: number }> {
  if (running) return { processed: 0, failed: 0 };
  if (!navigator.onLine) return { processed: 0, failed: 0 };

  running = true;
  let processed = 0;
  let failed = 0;

  try {
    await requestPersistence();
    const items = await listOutbox();
    const now = Date.now();

    for (const item of items) {
      if (item.status === 'done' || item.status === 'failed') continue;
      if (item.next_retry_at > now) continue;

      try {
        await updateOutbox(item.operation_id, { status: 'processing' });
        await executeOutboxItem(item);
        await updateOutbox(item.operation_id, { status: 'done', last_error: undefined });
        processed += 1;
      } catch (err) {
        const permanent = isPermanentError(err);
        const attempts = item.attempts + 1;
        await updateOutbox(item.operation_id, {
          status: permanent ? 'failed' : 'pending',
          attempts,
          last_error: String((err as { message?: string })?.message ?? err),
          next_retry_at: permanent ? 0 : Date.now() + backoffMs(attempts),
        });
        if (permanent) failed += 1;
        if (!navigator.onLine) break;
      }
    }
  } finally {
    running = false;
  }

  return { processed, failed };
}

export function startSyncWorker() {
  void processOutbox();

  const onOnline = () => void processOutbox();
  window.addEventListener('online', onOnline);

  timer = window.setInterval(() => {
    if (navigator.onLine) void processOutbox();
  }, 30000);

  return () => {
    if (timer) window.clearInterval(timer);
    window.removeEventListener('online', onOnline);
  };
}

/** Retry everything that is currently pending or failed. */
export async function retryAll() {
  const items = await listOutbox();
  await Promise.all(
    items
      .filter((i) => i.status !== 'done')
      .map((i) => updateOutbox(i.operation_id, { status: 'pending', next_retry_at: 0 })),
  );
  return processOutbox();
}
