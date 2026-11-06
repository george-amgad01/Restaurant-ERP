import { dbPromise } from './db';

export async function setCache(key: string, data: unknown) {
  const db = await dbPromise;
  await db.put('cache', { key, data, cached_at: Date.now() });
}

export async function getCache<T>(key: string): Promise<{ data: T; cached_at: number } | null> {
  const db = await dbPromise;
  const row = await db.get('cache', key);
  if (!row) return null;
  return { data: row.data as T, cached_at: row.cached_at };
}

export async function isFresh(key: string, maxAgeMs: number) {
  const row = await getCache(key);
  return !!row && Date.now() - row.cached_at < maxAgeMs;
}
