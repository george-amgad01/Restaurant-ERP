import { supabase } from '@/lib/supabase';

/**
 * Subscribes to order changes. Realtime is a hint: callers must also refetch
 * on subscribe and on reconnect (see useRealtimeRefetch).
 */
export function subscribeToOrders(
  onChange: () => void,
  filter?: { table?: 'orders' | 'order_items' | 'inventory' | 'menu_items'; channelName?: string },
) {
  const table = filter?.table ?? 'orders';
  const name = filter?.channelName ?? `realtime-${table}-${Math.random().toString(36).slice(2, 8)}`;

  const channel = supabase
    .channel(name)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToTable(table: string, onChange: () => void, channelName?: string) {
  return subscribeToOrders(onChange, { table: table as never, channelName });
}
