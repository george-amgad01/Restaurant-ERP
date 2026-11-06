import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  CheckCircle2,
  ChefHat,
  Clock,
  Expand,
  Flame,
  RefreshCw,
  Utensils,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase, errorMessage } from '@/lib/supabase';
import { useSync } from '@/context/SyncContext';
import { useRealtimeRefetch } from '@/realtime/useRealtimeRefetch';
import { setOrderStatus } from '@/services/orders.service';
import { cn, elapsed, orderTypeLabel, statusLabel } from '@/lib/utils';
import type { Order } from '@/types';
import { Badge, Button, EmptyState, Spinner } from '@/components/ui';

async function fetchTickets() {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .in('status', ['new', 'preparing', 'ready'])
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Order[];
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function Timer({ createdAt }: { createdAt: string }) {
  const now = useNow(5000);
  const mins = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60000));
  const tone = mins >= 20 ? 'text-rose-600' : mins >= 10 ? 'text-amber-600' : 'text-emerald-600';
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', tone)}>
      <Clock className="h-3.5 w-3.5" />
      {elapsed(createdAt)}
    </span>
  );
}

export default function KitchenPage() {
  const { online } = useSync();
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('kds-sound') === '1');
  const [busyId, setBusyId] = useState<string | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const initialLoad = useRef(true);

  const query = useQuery({
    queryKey: ['kds-tickets'],
    queryFn: fetchTickets,
    refetchInterval: 60000,
  });

  useRealtimeRefetch(() => void query.refetch(), { table: 'orders' });

  const tickets = query.data ?? [];

  const beep = useCallback(() => {
    try {
      const ctx = audioRef.current ?? new AudioContext();
      audioRef.current = ctx;
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.55);
    } catch {
      /* audio unavailable */
    }
  }, []);

  // Detect new tickets and alert once per id.
  useEffect(() => {
    if (!tickets.length) return;
    const newOnes = tickets.filter((t) => !knownIds.current.has(t.id));
    if (!initialLoad.current && newOnes.length > 0 && soundOn) beep();
    for (const t of tickets) knownIds.current.add(t.id);
    initialLoad.current = false;
  }, [tickets, soundOn, beep]);

  function enableSound() {
    const ctx = audioRef.current ?? new AudioContext();
    audioRef.current = ctx;
    void ctx.resume();
    beep();
    setSoundOn(true);
    localStorage.setItem('kds-sound', '1');
  }

  function disableSound() {
    setSoundOn(false);
    localStorage.setItem('kds-sound', '0');
  }

  async function move(order: Order, next: 'preparing' | 'ready' | 'served') {
    setBusyId(order.id);
    try {
      await setOrderStatus(order.id, next, `Kitchen: ${statusLabel[next]}`);
      await query.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const columns = useMemo(
    () => [
      { status: 'new', title: 'New tickets', tone: 'border-t-blue-500', items: tickets.filter((t) => t.status === 'new') },
      { status: 'preparing', title: 'Preparing', tone: 'border-t-amber-500', items: tickets.filter((t) => t.status === 'preparing') },
      { status: 'ready', title: 'Ready to serve', tone: 'border-t-emerald-500', items: tickets.filter((t) => t.status === 'ready') },
    ],
    [tickets],
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">Kitchen display</h1>
          <p className="mt-0.5 flex items-center gap-2 text-sm text-ink-500">
            <span className={cn('inline-flex items-center gap-1', online ? 'text-emerald-600' : 'text-amber-600')}>
              <span className={cn('h-2 w-2 rounded-full', online ? 'bg-emerald-500' : 'bg-amber-500')} />
              {online ? 'Live' : 'Reconnecting…'}
            </span>
            · {tickets.length} open tickets
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {soundOn ? (
            <Button variant="outline" size="sm" onClick={disableSound}><Bell className="h-4 w-4" /> Sound on</Button>
          ) : (
            <Button variant="primary" size="sm" onClick={enableSound}><BellOff className="h-4 w-4" /> Enable sound</Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {query.isFetching ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />} Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void document.documentElement.requestFullscreen();
            }}
          >
            <Expand className="h-4 w-4" /> Fullscreen
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="grid h-64 place-items-center"><Spinner className="h-8 w-8 text-brand-600" /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {columns.map((col) => (
            <div key={col.status} className={cn('rounded-xl border border-ink-200 border-t-4 bg-ink-50/60', col.tone)}>
              <div className="flex items-center justify-between px-3 py-2">
                <h2 className="text-sm font-semibold text-ink-800">{col.title}</h2>
                <Badge tone="bg-white text-ink-600 border-ink-200">{col.items.length}</Badge>
              </div>
              <div className="max-h-[calc(100vh-220px)] space-y-2 overflow-y-auto p-2">
                {col.items.length === 0 ? (
                  <EmptyState title="No tickets" description="Orders appear here in real time." />
                ) : (
                  col.items.map((order) => (
                    <div key={order.id} className="rounded-xl border border-ink-200 bg-white p-3 shadow-card">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-base font-semibold text-ink-900">#{order.order_number}</p>
                          <p className="text-xs text-ink-500">
                            {orderTypeLabel[order.order_type]}
                            {order.table_no ? ` · Table ${order.table_no}` : ''}
                            {order.customer_name ? ` · ${order.customer_name}` : ''}
                          </p>
                        </div>
                        <Timer createdAt={order.created_at} />
                      </div>

                      {order.status === 'ready' && (
                        <Badge tone="bg-emerald-50 text-emerald-700 border-emerald-200" className="mt-2">
                          <CheckCircle2 className="h-3 w-3" /> Ready
                        </Badge>
                      )}

                      <div className="mt-2 space-y-1 border-t border-ink-100 pt-2">
                        {(order.order_items ?? []).map((item) => (
                          <div key={item.id} className="flex items-start justify-between gap-2 text-sm">
                            <div className="min-w-0">
                              <p className="text-ink-800">
                                <span className="mr-1 inline-grid h-5 w-5 place-items-center rounded bg-ink-100 text-xs font-semibold">
                                  {item.quantity}
                                </span>
                                {item.item_name}
                              </p>
                              {item.notes && (
                                <p className="ml-6 text-xs font-medium text-amber-600">{item.notes}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {order.notes && (
                        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">{order.notes}</p>
                      )}

                      <div className="mt-3 flex gap-2">
                        {order.status === 'new' && (
                          <Button size="sm" className="flex-1" onClick={() => void move(order, 'preparing')} loading={busyId === order.id}>
                            <Flame className="h-4 w-4" /> Start
                          </Button>
                        )}
                        {order.status === 'preparing' && (
                          <Button size="sm" className="flex-1" onClick={() => void move(order, 'ready')} loading={busyId === order.id}>
                            <CheckCircle2 className="h-4 w-4" /> Ready
                          </Button>
                        )}
                        {order.status === 'ready' && (
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => void move(order, 'served')} loading={busyId === order.id}>
                            <Utensils className="h-4 w-4" /> Served
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!soundOn && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <ChefHat className="h-4 w-4" />
          Browsers block audio until staff interact with the page. Click “Enable sound” once per shift.
        </div>
      )}
    </div>
  );
}
