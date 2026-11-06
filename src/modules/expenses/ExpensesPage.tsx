import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ArrowDownRight,
  Download,
  FileImage,
  Plus,
  Receipt,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import {
  createExpense,
  expenseTotals,
  getReceiptUrl,
  listExpenseCategories,
  listExpenses,
  voidExpense,
} from '@/services/expenses.service';
import { errorMessage } from '@/lib/supabase';
import { cn, dateOnly, downloadCsv, money, startOfMonthISO, todayISO } from '@/lib/utils';
import type { Expense } from '@/types';
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
  StatCard,
  Textarea,
} from '@/components/ui';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#f43f5e', '#14b8a6', '#64748b'];

export default function ExpensesPage() {
  const { currency } = useSettings();
  const { has } = useAuth();
  const qc = useQueryClient();
  const canCreate = has('expenses.create');
  const canView = has('expenses.view');

  const [from, setFrom] = useState(startOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<Expense | null>(null);

  const categoriesQuery = useQuery({ queryKey: ['expense-categories'], queryFn: listExpenseCategories });
  const listQuery = useQuery({
    queryKey: ['expenses', from, to, categoryId, search],
    queryFn: () => listExpenses({ from, to, categoryId: categoryId || undefined, search: search || undefined }),
  });
  const totalsQuery = useQuery({
    queryKey: ['expense-totals', from, to],
    queryFn: () => expenseTotals(from, to),
  });

  const expenses = listQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const totals = totalsQuery.data ?? [];

  const summary = useMemo(() => {
    const active = expenses.filter((e) => !e.is_void);
    const total = active.reduce((a, e) => a + Number(e.amount), 0);
    const top = [...totals].sort((a, b) => Number(b.total) - Number(a.total))[0];
    return {
      total,
      count: active.length,
      voided: expenses.length - active.length,
      top: top?.category ?? '—',
      topTotal: top ? Number(top.total) : 0,
      average: active.length ? total / active.length : 0,
    };
  }, [expenses, totals]);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['expenses'] }),
      qc.invalidateQueries({ queryKey: ['expense-totals'] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
  }

  async function openReceipt(path: string) {
    try {
      const url = await getReceiptUrl(path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (listQuery.isLoading && !listQuery.data) return <PageLoader label="Loading expenses…" />;

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Track operating costs with receipts and audit history."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(`expenses-${from}-to-${to}.csv`, expenses.map((e) => ({
                  date: e.expense_date,
                  category: e.category?.name ?? 'Uncategorised',
                  amount: e.amount,
                  description: e.description,
                  void: e.is_void,
                })))
              }
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            {canCreate && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Add expense</Button>}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total expenses" value={money(summary.total, currency)} icon={<Wallet className="h-5 w-5" />} />
        <StatCard label="Records" value={summary.count} icon={<Receipt className="h-5 w-5" />} tone="text-blue-600 bg-blue-50" />
        <StatCard label="Average ticket" value={money(summary.average, currency)} icon={<ArrowDownRight className="h-5 w-5" />} tone="text-violet-600 bg-violet-50" />
        <StatCard
          label={`Top: ${summary.top}`}
          value={money(summary.topTotal, currency)}
          hint={summary.voided > 0 ? `${summary.voided} voided excluded` : undefined}
          icon={<FileImage className="h-5 w-5" />}
          tone="text-amber-600 bg-amber-50"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Expense register" subtitle={`${from} → ${to}`} />
          <div className="flex flex-wrap items-end gap-3 border-b border-ink-100 px-4 py-3">
            <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <Field label="Category">
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Search" className="min-w-[180px] flex-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Description…" className="pl-9" />
              </div>
            </Field>
          </div>

          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th className="text-right">Amount</th>
                  <th>Receipt</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState icon={<Receipt className="h-8 w-8" />} title="No expenses in this period" /></td></tr>
                ) : (
                  expenses.map((e) => (
                    <tr key={e.id} className={cn(e.is_void && 'opacity-60')}>
                      <td className="whitespace-nowrap text-xs text-ink-500">{dateOnly(e.expense_date)}</td>
                      <td>
                        <p className={cn('text-sm font-medium text-ink-800', e.is_void && 'line-through')}>{e.description}</p>
                        <p className="text-xs text-ink-400">
                          {e.creator?.full_name ?? '—'}
                          {e.is_void && e.void_reason ? ` · Void: ${e.void_reason}` : ''}
                        </p>
                      </td>
                      <td>
                        <Badge>{e.category?.name ?? 'Uncategorised'}</Badge>
                      </td>
                      <td className="text-right font-medium tabular-nums">{money(e.amount, currency)}</td>
                      <td>
                        {e.receipt_path ? (
                          <Button variant="ghost" size="sm" onClick={() => void openReceipt(e.receipt_path!)}>
                            <FileImage className="h-4 w-4" /> View
                          </Button>
                        ) : (
                          <span className="text-xs text-ink-400">None</span>
                        )}
                      </td>
                      <td className="text-right">
                        {canView && !e.is_void && (
                          <Button variant="ghost" size="sm" className="text-rose-500" onClick={() => setVoidTarget(e)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="By category" subtitle="Active expenses only" />
          <div className="h-80 px-2 py-3">
            {totals.length === 0 ? (
              <EmptyState title="No data" description="Record an expense to see the split." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={totals} layout="vertical" margin={{ left: 8, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={100}
                    tick={{ fontSize: 11, fill: '#475569' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(value: number) => money(value, currency)}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={16}>
                    {totals.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {createOpen && (
        <ExpenseModal
          categories={categories}
          onClose={() => setCreateOpen(false)}
          onSaved={async () => { setCreateOpen(false); await refresh(); }}
        />
      )}
      {voidTarget && (
        <VoidModal
          expense={voidTarget}
          onClose={() => setVoidTarget(null)}
          onSaved={async () => { setVoidTarget(null); await refresh(); }}
        />
      )}
    </div>
  );
}

function ExpenseModal({
  categories,
  onClose,
  onSaved,
}: {
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (Number(amount) <= 0) return toast.error('Amount must be greater than zero.');
    if (!description.trim()) return toast.error('A description is required.');
    setBusy(true);
    try {
      await createExpense({
        category_id: categoryId || null,
        amount: Number(amount),
        expense_date: date,
        description: description.trim(),
        receipt,
      });
      toast.success('Expense recorded.');
      await onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add expense"
      size="md"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Save expense</Button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Uncategorised</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Amount" required>
          <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <Field label="Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Receipt" hint="Image or PDF, stored privately.">
          <input
            type="file"
            accept="image/*,application/pdf"
            className="block w-full text-xs text-ink-500 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-ink-700 hover:file:bg-ink-200"
            onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
          />
        </Field>
        <Field label="Description" required className="sm:col-span-2">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was purchased and why?" />
        </Field>
      </div>
    </Modal>
  );
}

function VoidModal({
  expense,
  onClose,
  onSaved,
}: {
  expense: Expense;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { currency } = useSettings();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason.trim()) return toast.error('A void reason is required.');
    setBusy(true);
    try {
      await voidExpense(expense.id, reason.trim());
      toast.success('Expense voided. The original record is preserved.');
      await onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Void expense"
      subtitle={`${expense.description} — ${money(expense.amount, currency)}`}
      size="sm"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="danger" loading={busy} onClick={submit}>Void expense</Button></>}
    >
      <Field label="Reason" required hint="Kept in the audit trail; the expense is excluded from reports.">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate entry" autoFocus />
      </Field>
    </Modal>
  );
}
