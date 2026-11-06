import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  CloudOff,
  CloudUpload,
  Database,
  Eye,
  HardDrive,
  RefreshCw,
  RotateCcw,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSync } from '@/context/SyncContext';
import { listSyncOperations } from '@/services/activity.service';
import { clearDone } from '@/offline/outbox';
import { supabase } from '@/lib/supabase';
import { cn, dateTime, num } from '@/lib/utils';
import type { OutboxItem } from '@/types';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Modal,
  PageHeader,
  PageLoader,
  StatCard,
  Tabs,
} from '@/components/ui';

interface SyncHealth {
  pending: number;
  failed: number;
  succeeded_today: number;
  oldest_pending_minutes: number;
}

const OUTBOX_TONE: Record<string, string> = {
  pending: 'bg-blue-50 text-blue-700 border-blue-200',
  processing: 'bg-amber-50 text-amber-700 border-amber-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const SERVER_TONE: Record<string, string> = {
  processing: 'bg-amber-50 text-amber-700 border-amber-200',
  succeeded: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function SyncPage() {
  const { items, pending, failed, done, online, syncing, syncNow, retry, retryOne, discard, refresh } = useSync();
  const qc = useQueryClient();
  const [tab, setTab] = useState('queue');
  const [selected, setSelected] = useState<OutboxItem | null>(null);

  const serverQuery = useQuery({
    queryKey: ['sync-operations'],
    queryFn: () => listSyncOperations(200),
  });
  const healthQuery = useQuery({
    queryKey: ['sync-health'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('sync_health');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? { pending: 0, failed: 0, succeeded_today: 0, oldest_pending_minutes: 0 }) as SyncHealth;
    },
  });

  const local = useMemo(
    () => [...items].sort((a, b) => b.created_at - a.created_at),
    [items],
  );

  async function refreshEverything() {
    await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ['sync-operations'] }), qc.invalidateQueries({ queryKey: ['sync-health'] })]);
  }

  async function onSyncNow() {
    await syncNow();
    await refreshEverything();
    toast.success('Sync pass finished.');
  }

  async function onRetryAll() {
    await retry();
    await refreshEverything();
    toast.success('Retry pass finished.');
  }

  async function onClearDone() {
    await clearDone();
    await refresh();
    toast.success('Completed local operations cleared.');
  }

  const health = healthQuery.data;

  return (
    <div>
      <PageHeader
        title="Offline & sync"
        subtitle="POS operations are written to a local outbox and replayed idempotently."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void refreshEverything()} loading={syncing}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button onClick={() => void onSyncNow()} loading={syncing} disabled={!online}>
              <CloudUpload className="h-4 w-4" /> Sync now
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm"
        style={{ borderColor: online ? '#a7f3d0' : '#fde68a', background: online ? '#ecfdf5' : '#fffbeb' }}>
        {online ? <Wifi className="h-4 w-4 text-emerald-600" /> : <WifiOff className="h-4 w-4 text-amber-600" />}
        <span className={online ? 'text-emerald-800' : 'text-amber-800'}>
          {online
            ? 'Connected. Queued operations replay automatically every 30 seconds and when the connection returns.'
            : 'Offline. You can keep selling; operations are queued locally and will replay when back online.'}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Local pending" value={pending} icon={<HardDrive className="h-5 w-5" />} tone="text-blue-600 bg-blue-50" />
        <StatCard label="Local failed" value={failed} icon={<CloudOff className="h-5 w-5" />} tone="text-rose-600 bg-rose-50" />
        <StatCard label="Local completed" value={done} icon={<CheckCircle2 className="h-5 w-5" />} tone="text-emerald-600 bg-emerald-50" />
        <StatCard
          label="Server succeeded (24h)"
          value={health?.succeeded_today ?? 0}
          hint={health ? `${health.failed} failed server-side` : undefined}
          icon={<Database className="h-5 w-5" />}
          tone="text-violet-600 bg-violet-50"
        />
      </div>

      <div className="mt-4 mb-3 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'queue', label: 'Local queue', count: items.length },
            { value: 'server', label: 'Server ledger', count: serverQuery.data?.length ?? 0 },
          ]}
        />
        {tab === 'queue' && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void onRetryAll()} disabled={failed === 0} loading={syncing}>
              <RotateCcw className="h-4 w-4" /> Retry failed
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void onClearDone()} disabled={done === 0}>
              <Trash2 className="h-4 w-4" /> Clear completed
            </Button>
          </div>
        )}
      </div>

      {tab === 'queue' ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Operation</th>
                  <th>Reference</th>
                  <th>Attempts</th>
                  <th>Status</th>
                  <th>Last error</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {local.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState icon={<CloudUpload className="h-8 w-8" />} title="Queue is empty" description="All offline operations have been synced." />
                    </td>
                  </tr>
                ) : (
                  local.map((item) => (
                    <tr key={item.operation_id}>
                      <td className="whitespace-nowrap text-xs text-ink-500">{dateTime(new Date(item.created_at))}</td>
                      <td className="font-mono text-xs text-ink-700">{item.kind}</td>
                      <td className="text-xs text-ink-500">{item.local_ref ?? item.operation_id.slice(0, 8)}</td>
                      <td className="text-center tabular-nums">{item.attempts}</td>
                      <td><Badge tone={OUTBOX_TONE[item.status] ?? ''}>{item.status}</Badge></td>
                      <td className="max-w-[220px] truncate text-xs text-rose-600">{item.last_error ?? '—'}</td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" title="View payload" onClick={() => setSelected(item)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {item.status === 'failed' && (
                            <Button size="sm" variant="ghost" title="Retry" className="text-emerald-600" onClick={() => void retryOne(item.operation_id)}>
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                          {item.status !== 'processing' && (
                            <Button size="sm" variant="ghost" title="Discard" className="text-rose-500" onClick={() => void discard(item.operation_id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-ink-100 px-4 py-3 text-xs text-ink-500">
            Each operation carries a client-generated <span className="font-mono">operation_id</span>. Retries reuse it, so the server cannot apply an operation twice.
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Server idempotency ledger"
            subtitle={`Oldest processing operation: ${num(health?.oldest_pending_minutes ?? 0, 0)} min`}
            actions={
              <Button variant="ghost" size="sm" onClick={() => void serverQuery.refetch()} loading={serverQuery.isFetching}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            }
          />
          {serverQuery.isLoading ? (
            <PageLoader label="Loading ledger…" />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Operation ID</th>
                    <th>Kind</th>
                    <th>Attempts</th>
                    <th>Status</th>
                    <th>Last error</th>
                  </tr>
                </thead>
                <tbody>
                  {(serverQuery.data ?? []).length === 0 ? (
                    <tr><td colSpan={6}><EmptyState title="No server operations yet" /></td></tr>
                  ) : (
                    (serverQuery.data ?? []).map((op: Record<string, unknown>) => (
                      <tr key={String(op.operation_id)}>
                        <td className="whitespace-nowrap text-xs text-ink-500">{dateTime(String(op.created_at))}</td>
                        <td className="font-mono text-[11px] text-ink-500">{String(op.operation_id).slice(0, 12)}…</td>
                        <td className="font-mono text-xs text-ink-700">{String(op.kind)}</td>
                        <td className="text-center tabular-nums">{String(op.attempts ?? 0)}</td>
                        <td><Badge tone={SERVER_TONE[String(op.status)] ?? ''}>{String(op.status)}</Badge></td>
                        <td className="max-w-[260px] truncate text-xs text-rose-600">{op.last_error ? String(op.last_error) : '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {selected && (
        <Modal open onClose={() => setSelected(null)} title={`Operation — ${selected.kind}`} subtitle={selected.operation_id} size="lg">
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone={OUTBOX_TONE[selected.status] ?? ''}>{selected.status}</Badge>
            <Badge>Attempts {selected.attempts}</Badge>
            {selected.depends_on && <Badge>Depends on {selected.depends_on.slice(0, 8)}</Badge>}
            <Badge>{selected.created_at ? dateTime(new Date(selected.created_at)) : '—'}</Badge>
          </div>
          {selected.last_error && (
            <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{selected.last_error}</p>
          )}
          <pre className="max-h-[55vh] overflow-auto rounded-lg bg-ink-900 p-3 text-[11px] leading-relaxed text-ink-100">
            {JSON.stringify(selected.payload, null, 2)}
          </pre>
        </Modal>
      )}

      <div className={cn('mt-4 flex items-start gap-2 rounded-lg border border-ink-200 bg-white p-3 text-xs text-ink-500', online && 'text-ink-500')}>
        <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
        <span>
          Card payments taken offline are allowed when enabled in Settings and must include a reference. Reconcile them against the terminal when connectivity returns.
        </span>
      </div>
    </div>
  );
}
