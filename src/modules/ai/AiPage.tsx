import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Bot,
  CalendarClock,
  Loader2,
  Send,
  Sparkles,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import {
  askAssistant,
  generateDailyReport,
  getDailyMetrics,
  listMessages,
  listReports,
} from '@/services/ai.service';
import { errorMessage } from '@/lib/supabase';
import { dateOnly, money, num, todayISO } from '@/lib/utils';
import type { AiMessage, AiReport } from '@/types';
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
  Tabs,
  Textarea,
} from '@/components/ui';

const SUGGESTIONS = [
  'What were my best selling items this week?',
  'Compare revenue this month with last month.',
  'Which ingredients are at risk of running out?',
  'Where am I losing the most money?',
];

export default function AiPage() {
  const { has } = useAuth();
  const { settings } = useSettings();
  const canUse = has('ai.use');
  const canView = has('ai.view_reports');

  const [tab, setTab] = useState(canUse ? 'assistant' : 'reports');

  return (
    <div>
      <PageHeader
        title="AI assistant"
        subtitle="Business answers grounded in your live data, plus automated daily reports."
        actions={
          settings?.ai_report_time ? (
            <Badge tone="bg-brand-50 text-brand-700 border-brand-200">
              <CalendarClock className="h-3 w-3" /> Daily report at {settings.ai_report_time.slice(0, 5)}
            </Badge>
          ) : undefined
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ...(canUse ? [{ value: 'assistant', label: 'Assistant' }] : []),
          ...(canView ? [{ value: 'reports', label: 'Daily reports' }] : []),
        ]}
      />

      <div className="mt-4">
        {tab === 'assistant' && canUse ? <AssistantPanel /> : null}
        {tab === 'reports' && canView ? <ReportsPanel /> : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Chat                                                                       */
/* -------------------------------------------------------------------------- */
function AssistantPanel() {
  const qc = useQueryClient();
  const messagesQuery = useQuery({ queryKey: ['ai-messages'], queryFn: () => listMessages(100) });
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [extra, setExtra] = useState<AiMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const history = useMemo(
    () => [...(messagesQuery.data ?? []), ...extra],
    [messagesQuery.data, extra],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history.length, pending]);

  async function send(question: string) {
    const text = question.trim();
    if (!text || pending) return;
    setDraft('');
    const tempUser: AiMessage = {
      id: -Date.now(),
      user_id: 'local',
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setExtra((prev) => [...prev, tempUser]);
    setPending(text);
    try {
      const result = await askAssistant(text);
      const reply: AiMessage = {
        id: -Date.now() - 1,
        user_id: 'local',
        role: 'assistant',
        content: result.answer,
        created_at: new Date().toISOString(),
      };
      setExtra((prev) => [...prev, reply]);
      await qc.invalidateQueries({ queryKey: ['ai-messages'] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-4">
      <Card className="flex min-h-[65vh] flex-col xl:col-span-3">
        <CardHeader
          title="Chat with your data"
          subtitle="Answers include a DATA block with figures the assistant was allowed to see."
          actions={<Sparkles className="h-4 w-4 text-brand-500" />}
        />
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4" style={{ maxHeight: '58vh' }}>
          {messagesQuery.isLoading ? (
            <PageLoader label="Loading conversation…" />
          ) : history.length === 0 ? (
            <EmptyState
              icon={<Bot className="h-10 w-10" />}
              title="Ask about sales, stock or costs"
              description="Try one of the suggested questions below. The assistant never exposes secrets and only sees the aggregate data your role permits."
            />
          ) : (
            history.map((message) => <Bubble key={message.id} message={message} />)
          )}
          {pending && (
            <div className="flex items-start gap-2">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-ink-100 px-3.5 py-2.5 text-sm text-ink-500">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analysing your data…
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-ink-100 p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => void send(s)}
                disabled={Boolean(pending)}
                className="rounded-full border border-ink-200 px-2.5 py-1 text-[11px] text-ink-600 transition hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask a business question…"
              className="min-h-[44px] flex-1 resize-none"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
            />
            <Button type="submit" loading={Boolean(pending)} disabled={!draft.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Card>

      <Card className="h-fit">
        <CardHeader title="How it works" />
        <ul className="space-y-3 p-4 text-xs text-ink-500">
          <li><span className="font-medium text-ink-700">Server-side key.</span> The Gemini key lives only in Supabase Edge Function secrets.</li>
          <li><span className="font-medium text-ink-700">Yours only.</span> Every row is protected by RLS; the function runs with your JWT.</li>
          <li><span className="font-medium text-ink-700">Quota.</span> Questions are rate-limited per user per day to control cost.</li>
          <li><span className="font-medium text-ink-700">No card data.</span> Payment references are never sent to the model.</li>
        </ul>
      </Card>
    </div>
  );
}

function Bubble({ message }: { message: AiMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
          isUser ? 'bg-ink-800 text-white' : 'bg-brand-50 text-brand-600'
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
          isUser ? 'rounded-tr-sm bg-ink-800 text-white' : 'rounded-tl-sm bg-ink-100 text-ink-800'
        }`}
      >
        {isUser ? <p className="whitespace-pre-wrap">{message.content}</p> : <MarkdownText text={message.content} />}
      </div>
    </div>
  );
}

/** Very small markdown subset: headings, bullets, bold and paragraphs. */
function MarkdownText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      {text.split('\n').map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} className="h-1" />;
        if (trimmed.startsWith('### ')) return <p key={index} className="font-semibold text-ink-900">{inline(trimmed.slice(4))}</p>;
        if (trimmed.startsWith('## ')) return <p key={index} className="font-semibold text-ink-900">{inline(trimmed.slice(3))}</p>;
        if (trimmed.startsWith('# ')) return <p key={index} className="font-semibold text-ink-900">{inline(trimmed.slice(2))}</p>;
        if (/^[-*]\s/.test(trimmed)) return <p key={index} className="pl-3">• {inline(trimmed.slice(2))}</p>;
        return <p key={index}>{inline(trimmed)}</p>;
      })}
    </div>
  );
}

function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Daily reports                                                              */
/* -------------------------------------------------------------------------- */
function ReportsPanel() {
  const { currency } = useSettings();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<AiReport | null>(null);

  const reportsQuery = useQuery({ queryKey: ['ai-reports'], queryFn: () => listReports(60) });
  const metricsQuery = useQuery({
    queryKey: ['ai-metrics', date],
    queryFn: () => getDailyMetrics(date),
    enabled: Boolean(date),
  });

  const metrics = (metricsQuery.data ?? {}) as Record<string, unknown>;

  async function generate() {
    setGenerating(true);
    try {
      await generateDailyReport(date);
      toast.success(`Daily report generated for ${date}.`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['ai-reports'] }),
        qc.invalidateQueries({ queryKey: ['ai-metrics', date] }),
      ]);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Card>
          <CardHeader
            title="Generate a report"
            subtitle="Sends the day's aggregated metrics to Gemini and stores the summary."
            actions={
              <Button onClick={() => void generate()} loading={generating} disabled={!date}>
                <Sparkles className="h-4 w-4" /> Generate
              </Button>
            }
          />
          <div className="flex flex-wrap items-end gap-3 p-4">
            <Field label="Report date">
              <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <div className="flex-1 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-xs text-ink-500">
              {metricsQuery.isFetching
                ? 'Loading metrics…'
                : Object.keys(metrics).length === 0
                  ? 'No metrics for this date yet.'
                  : `Orders ${String(metrics.orders_count ?? 0)} · Revenue ${money(Number(metrics.revenue ?? 0), currency)} · Gross profit ${money(Number(metrics.gross_profit ?? 0), currency)}`}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Report history" subtitle="Newest first" actions={<BarChart3 className="h-4 w-4 text-ink-400" />} />
          <div className="divide-y divide-ink-100">
            {reportsQuery.isLoading ? (
              <PageLoader label="Loading reports…" />
            ) : (reportsQuery.data ?? []).length === 0 ? (
              <EmptyState icon={<Sparkles className="h-8 w-8" />} title="No reports yet" description="Generate today's report or wait for the scheduled run." />
            ) : (
              (reportsQuery.data ?? []).map((report) => (
                <button
                  key={report.id}
                  onClick={() => setSelected(report)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-ink-50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-800">{dateOnly(report.report_date)}</p>
                    <p className="line-clamp-1 text-xs text-ink-500">{report.summary_md ?? report.error ?? 'No content'}</p>
                  </div>
                  <Badge tone={report.status === 'succeeded' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}>
                    {report.status}
                  </Badge>
                </button>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader title="Today's metrics" subtitle="What the AI sees" />
        <div className="space-y-3 p-4 text-sm">
          <Metric label="Orders" value={String(metrics.orders_count ?? 0)} />
          <Metric label="Revenue" value={money(Number(metrics.revenue ?? 0), currency)} />
          <Metric label="COGS" value={money(Number(metrics.cogs ?? 0), currency)} />
          <Metric label="Gross profit" value={money(Number(metrics.gross_profit ?? 0), currency)} />
          <Metric label="Expenses" value={money(Number(metrics.expenses ?? 0), currency)} />
          <Metric label="Average order value" value={money(Number(metrics.avg_order_value ?? 0), currency)} />
          <Metric label="Completed orders" value={num(Number(metrics.completed_orders ?? 0), 0)} />
          <Metric label="Cancelled orders" value={num(Number(metrics.cancelled_orders ?? 0), 0)} />
          <Metric label="Low stock items" value={num(Number(metrics.low_stock_count ?? 0), 0)} />
        </div>
      </Card>

      {selected && (
        <Modal open onClose={() => setSelected(null)} title={`Daily report — ${dateOnly(selected.report_date)}`} size="lg">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <Badge tone={selected.status === 'succeeded' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}>
              {selected.status}
            </Badge>
            {selected.model && <span>Model: {selected.model}</span>}
            {selected.generated_at && <span>Generated {dateOnly(selected.generated_at)}</span>}
          </div>
          {selected.error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{selected.error}</p>}
          <MarkdownText text={selected.summary_md ?? 'No summary stored.'} />
        </Modal>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-ink-100 pb-2 last:border-0 last:pb-0">
      <span className="text-ink-500">{label}</span>
      <span className="font-medium tabular-nums text-ink-900">{value}</span>
    </div>
  );
}
