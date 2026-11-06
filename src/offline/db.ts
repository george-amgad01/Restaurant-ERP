import { openDB, type DBSchema } from 'idb';
import type { OutboxItem } from '@/types';

interface ErpDB extends DBSchema {
  outbox: {
    key: string;
    value: OutboxItem;
    indexes: { 'by-status': string; 'by-created': number };
  };
  cache: {
    key: string;
    value: { key: string; data: unknown; cached_at: number };
  };
}

export const dbPromise = openDB<ErpDB>('restaurant-erp', 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('outbox')) {
      const outbox = db.createObjectStore('outbox', { keyPath: 'operation_id' });
      outbox.createIndex('by-status', 'status');
      outbox.createIndex('by-created', 'created_at');
    }
    if (!db.objectStoreNames.contains('cache')) {
      db.createObjectStore('cache', { keyPath: 'key' });
    }
  },
});

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    /* non-fatal */
  }
}
