import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { OUTBOX_EVENT, listOutbox, removeOutbox, updateOutbox } from '@/offline/outbox';
import { processOutbox, retryAll, startSyncWorker } from '@/offline/syncWorker';
import type { OutboxItem } from '@/types';

interface SyncContextValue {
  items: OutboxItem[];
  pending: number;
  failed: number;
  done: number;
  online: boolean;
  syncing: boolean;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
  retryOne: (id: string) => Promise<void>;
  discard: (id: string) => Promise<void>;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setItems(await listOutbox());
  }, []);

  useEffect(() => {
    void refresh();
    if (!user) return;

    // Replaying the outbox requires a valid session; starting the worker while
    // signed out would only produce avoidable 401 retries.
    const stop = startSyncWorker();
    const onChange = () => void refresh();
    const onOnline = () => {
      setOnline(true);
      void refresh();
    };
    const onOffline = () => setOnline(false);

    window.addEventListener(OUTBOX_EVENT, onChange);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      stop();
      window.removeEventListener(OUTBOX_EVENT, onChange);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [user?.id, refresh]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await processOutbox();
      await refresh();
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  const retry = useCallback(async () => {
    setSyncing(true);
    try {
      await retryAll();
      await refresh();
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  const retryOne = useCallback(
    async (id: string) => {
      await updateOutbox(id, { status: 'pending', next_retry_at: 0 });
      await syncNow();
    },
    [syncNow],
  );

  const discard = useCallback(
    async (id: string) => {
      await removeOutbox(id);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<SyncContextValue>(() => {
    const pending = items.filter((i) => i.status === 'pending' || i.status === 'processing').length;
    const failed = items.filter((i) => i.status === 'failed').length;
    const done = items.filter((i) => i.status === 'done').length;
    return {
      items,
      pending,
      failed,
      done,
      online,
      syncing,
      refresh,
      retry,
      retryOne,
      discard,
      syncNow,
    };
  }, [items, online, syncing, refresh, retry, retryOne, discard, syncNow]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside SyncProvider');
  return ctx;
}
