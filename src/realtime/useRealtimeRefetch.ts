import { useEffect, useRef } from 'react';
import { subscribeToOrders } from './channels';

/**
 * Refetch on mount, on any realtime event, and on reconnect.
 * Debounced so bursts of changes don't hammer the database.
 */
export function useRealtimeRefetch(
  reload: () => void,
  options: { table?: 'orders' | 'order_items' | 'inventory' | 'menu_items'; enabled?: boolean } = {},
) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const { table = 'orders', enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    let timer: number | null = null;
    const trigger = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => reloadRef.current(), 400);
    };

    const unsubscribe = subscribeToOrders(trigger, { table });
    window.addEventListener('online', trigger);
    window.addEventListener('focus', trigger);

    return () => {
      if (timer) window.clearTimeout(timer);
      unsubscribe();
      window.removeEventListener('online', trigger);
      window.removeEventListener('focus', trigger);
    };
  }, [table, enabled]);
}
