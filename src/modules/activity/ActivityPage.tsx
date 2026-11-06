import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Download, Eye, RefreshCw, Search } from 'lucide-react';
import { listActivity } from '@/services/activity.service';
import { cn, dateTime, downloadCsv, todayISO } from '@/lib/utils';
import type { ActivityLog } from '@/types';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Select,
} from '@/components/ui';

const ACTION_TONE = (action: string) => {
  if (/(cancel|void|delete|refund|fail)/i.test(action)) return 'bg-rose-50 text-rose-700 border-rose-200';
  if (/(create|insert|purchase|pay|complete)/i.test(action)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (/(update|adjust|role|status)/i.test(action)) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-ink-100 text-ink-600 border-ink-200';
};

export default function ActivityPage() {
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<ActivityLog | null>(null);

  const query = useQuery({
    queryKey: ['activity', search, action, from, to],
    queryFn: () =>
      listActivity({
        search: search || undefined,
        action: action || undefined,
        from: from || undefined,
        to: to || undefined,
        limit: 300,
      }),
  });

  const rows = query.data ?? [];

  const summary = useMemo(() => {
    const tables = new Map<string, number>();
    const actors = new Map<string, number>();
    for (const row of rows) {
      if (row.table_name) tables.set(row.table_name, (tables.get(row.table_name) ?? 0) + 1);
      const actor = row.actor?.full_name ?? 'System';
      actors.set(actor, (actors.get(actor) ?? 0) + 1);
    }
    return {
      tables: Array.from(tables, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      actors: Array.from(actors, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    };
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="Activity log"
        subtitle="Append-only audit trail of sensitive operations."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void query.refetch()} loading={query.isFetching}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(`activity-${todayISO()}.csv`, rows.map((r) => ({
                  when: r.created_at,
                  actor: r.actor?.full_name ?? 'System',
                  action: r.action,
                  table: r.table_name ?? '',
                  record_id: r.record_id ?? '',
                })))
              }
            >
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Entries</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900">{rows.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Most active table</p>
          <p className="mt-1 truncate text-lg font-semibold text-ink-900">{summary.tables[0]?.name ?? '—'}</p>
          <p className="text-xs text-ink-400">{summary.tables[0]?.count ?? 0} entries</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Top actor</p>
          <p className="mt-1 truncate text-lg font-semibold text-ink-900">{summary.actors[0]?.name ?? '—'}</p>
          <p className="text-xs text-ink-400">{summary.actors[0]?.count ?? 0} entries</p>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader title="Audit entries" subtitle="Newest first, last 300 records" />
        <div className="flex flex-wrap items-end gap-3 border-b border-ink-100 px-4 py-3">
          <Field label="Search" className="min-w-[200px] flex-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Action, table or record id…" className="pl-9" />
            </div>
          </Field>
          <Field label="Action contains">
            <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. inventory" />
          </Field>
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          {(search || action || from || to) && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setAction(''); setFrom(''); setTo(''); }}>
              Clear
            </Button>
          )}
        </div>

        {query.isLoading ? (
          <PageLoader label="Loading audit trail…" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Table</th>
                  <th>Record</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState icon={<Activity className="h-8 w-8" />} title="No activity found" /></td></tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="cursor-pointer hover:bg-ink-50" onClick={() => setSelected(row)}>
                      <td className="whitespace-nowrap text-xs text-ink-500">{dateTime(row.created_at)}</td>
                      <td className="text-sm text-ink-700">{row.actor?.full_name ?? 'System'}</td>
                      <td><Badge tone={ACTION_TONE(row.action)}>{row.action}</Badge></td>
                      <td className="font-mono text-xs text-ink-500">{row.table_name ?? '—'}</td>
                      <td className="max-w-[180px] truncate font-mono text-xs text-ink-400">{row.record_id ?? '—'}</td>
                      <td className="text-right">
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelected(row); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <Modal
          open
          onClose={() => setSelected(null)}
          title="Audit entry"
          subtitle={`${selected.action} · ${dateTime(selected.created_at)}`}
          size="md"
        >
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <dt className="text-ink-500">Actor</dt>
            <dd className="col-span-2 text-ink-800">{selected.actor?.full_name ?? 'System'}</dd>
            <dt className="text-ink-500">Table</dt>
            <dd className="col-span-2 font-mono text-xs text-ink-700">{selected.table_name ?? '—'}</dd>
            <dt className="text-ink-500">Record</dt>
            <dd className="col-span-2 break-all font-mono text-xs text-ink-700">{selected.record_id ?? '—'}</dd>
          </dl>
          <p className={cn('mt-4 mb-1 text-xs font-medium uppercase tracking-wide text-ink-500')}>Details</p>
          <pre className="max-h-72 overflow-auto rounded-lg bg-ink-900 p-3 text-[11px] leading-relaxed text-ink-100">
            {JSON.stringify(selected.details ?? {}, null, 2)}
          </pre>
        </Modal>
      )}
    </div>
  );
}
