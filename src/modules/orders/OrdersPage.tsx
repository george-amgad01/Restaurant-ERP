import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Ban,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Download,
  FileText,
  Printer,
  Search,
  Send,
  Utensils,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useSync } from '@/context/SyncContext';
import { useRealtimeRefetch } from '@/realtime/useRealtimeRefetch';
import { getOrder, listOrders, recordPayment, refundOrder, setOrderStatus } from '@/services/orders.service';
import { errorMessage } from '@/lib/supabase';
import { printReceipt } from '@/lib/receipt';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Pagination,
  Select,
  Textarea,
} from '@/components/ui';
import {
  downloadCsv,
  dateOnly,
  dateTime,
  money,
  orderTypeLabel,
  paymentTone,
  statusLabel,
  statusTone,
} from '@/lib/utils';
import type { Order, OrderStatus } from '@/types';

const PAGE_SIZE = 25;

export default function OrdersPage() {
  const { has } = useAuth();
  const { settings, paymentMethods, currency } = useSettings();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [paymentStatus, setPaymentStatus] = useState('all');
  const [orderType, setOrderType] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('id'));
  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);

  const filters = useMemo(
    () => ({ search, status, payment_status: paymentStatus, order_type: orderType, from, to, page }),
    [search, status, paymentStatus, orderType, from, to, page],
  );

  const listQuery = useQuery({
    queryKey: ['orders', filters],
    queryFn: () =>
      listOrders({
        search,
        status,
        payment_status: paymentStatus,
        order_type: orderType,
        from: from || undefined,
        to: to || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
  });
  useRealtimeRefetch(() => void listQuery.refetch(), { table: 'orders' });

  const detailQuery = useQuery({
    queryKey: ['order', selectedId],
    queryFn: () => getOrder(selectedId!),
    enabled: !!selectedId,
  });

  useEffect(() => {
    const id = params.get('id');
    if (id) setSelectedId(id);
  }, [params]);

  const order = detailQuery.data ?? null;

  function openOrder(id: string) {
    setSelectedId(id);
    params.set('id', id);
    setParams(params, { replace: true });
  }

  function closeOrder() {
    setSelectedId(null);
    params.delete('id');
    setParams(params, { replace: true });
  }

  async function refresh() {
    await Promise.all([listQuery.refetch(), detailQuery.refetch()]);
    void qc.invalidateQueries({ queryKey: ['open-orders'] });
  }

  async function transition(next: OrderStatus) {
    if (!order) return;
    try {
      await setOrderStatus(order.id, next, `Status set to ${next}`);
      toast.success(`Order moved to ${statusLabel[next]}.`);
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const rows = listQuery.data?.orders ?? [];
  const total = listQuery.data?.count ?? 0;
  const remaining = order ? Math.max(0, Number(order.grand_total) - (order.payments ?? []).filter((p) => p.status === 'succeeded').reduce((s, p) => s + Number(p.amount), 0)) : 0;

  return (
    <div>
      <PageHeader
        title="Orders & invoices"
        subtitle="Search, inspect and control the order lifecycle."
        actions={
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv(
                `orders-${dateOnly(new Date())}.csv`,
                rows.map((o) => ({
                  order: o.order_number,
                  date: o.created_at,
                  type: orderTypeLabel[o.order_type],
                  status: o.status,
                  payment: o.payment_status,
                  total: o.grand_total,
                })),
              )
            }
            disabled={rows.length === 0}
          >
            <Download className="h-4 w-4" /> Export
          </Button>
        }
      />

      <Card className="mb-4">
        <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="relative xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Order #, customer, phone or table…"
              className="pl-9"
            />
          </div>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="all">All statuses</option>
            {['draft', 'new', 'preparing', 'ready', 'served', 'completed', 'cancelled'].map((s) => (
              <option key={s} value={s}>{statusLabel[s]}</option>
            ))}
          </Select>
          <Select value={paymentStatus} onChange={(e) => { setPaymentStatus(e.target.value); setPage(1); }}>
            <option value="all">All payments</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="refunded">Refunded</option>
          </Select>
          <Select value={orderType} onChange={(e) => { setOrderType(e.target.value); setPage(1); }}>
            <option value="all">All types</option>
            <option value="dine_in">Dine-in</option>
            <option value="takeaway">Takeaway</option>
            <option value="delivery">Delivery</option>
          </Select>
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            <span className="text-xs text-ink-400">to</span>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </div>
        </div>
      </Card>

      <Card>
        {listQuery.isLoading ? (
          <PageLoader />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-8 w-8" />}
            title="No orders found"
            description="Adjust filters or create an order in the POS."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Customer / table</th>
                    <th className="text-right">Total</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id} className="cursor-pointer" onClick={() => openOrder(o.id)}>
                      <td className="font-medium text-ink-900">#{o.order_number}</td>
                      <td className="whitespace-nowrap text-ink-500">{dateOnly(o.created_at)}</td>
                      <td>{orderTypeLabel[o.order_type]}</td>
                      <td className="text-ink-600">
                        {o.customer_name || '—'}
                        {o.table_no ? ` · T${o.table_no}` : ''}
                      </td>
                      <td className="text-right font-medium tabular-nums">{money(o.grand_total, currency)}</td>
                      <td><Badge tone={statusTone[o.status]}>{statusLabel[o.status]}</Badge></td>
                      <td><Badge tone={paymentTone[o.payment_status]}>{o.payment_status}</Badge></td>
                      <td className="text-right"><ChevronRight className="ml-auto h-4 w-4 text-ink-300" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
          </>
        )}
      </Card>

      {/* Detail modal */}
      <Modal
        open={!!selectedId}
        onClose={closeOrder}
        title={order ? `Order #${order.order_number}` : 'Order'}
        subtitle={order ? `${orderTypeLabel[order.order_type]} · ${dateTime(order.created_at)}` : undefined}
        size="xl"
        footer={
          order ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {order.status === 'draft' && has('pos.create_order') && (
                  <Button size="sm" onClick={() => transition('new')}><Send className="h-4 w-4" /> Send to kitchen</Button>
                )}
                {order.status === 'new' && has('kds.update') && (
                  <Button size="sm" onClick={() => transition('preparing')}><Utensils className="h-4 w-4" /> Start preparing</Button>
                )}
                {order.status === 'preparing' && has('kds.update') && (
                  <Button size="sm" onClick={() => transition('ready')}><CheckCircle2 className="h-4 w-4" /> Mark ready</Button>
                )}
                {order.status === 'ready' && has('orders.update_status') && (
                  <Button size="sm" variant="outline" onClick={() => transition('served')}>Mark served</Button>
                )}
                {['ready', 'served'].includes(order.status) && has('orders.update_status') && (
                  <Button size="sm" onClick={() => transition('completed')}><CheckCircle2 className="h-4 w-4" /> Complete</Button>
                )}
                {!['cancelled', 'completed'].includes(order.status) && has('orders.cancel') && (
                  <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)}><Ban className="h-4 w-4" /> Cancel</Button>
                )}
                {order.payment_status !== 'paid' && order.status !== 'cancelled' && has('pos.create_order') && (
                  <Button size="sm" variant="secondary" onClick={() => setPayOpen(true)}><CreditCard className="h-4 w-4" /> Take payment</Button>
                )}
                {order.payment_status === 'paid' && has('orders.refund') && (
                  <Button size="sm" variant="outline" onClick={() => setRefundOpen(true)}>Refund</Button>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => printReceipt(order, settings)}>
                <Printer className="h-4 w-4" /> Print invoice
              </Button>
            </div>
          ) : undefined
        }
      >
        {detailQuery.isLoading || !order ? (
          <PageLoader />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone[order.status]}>{statusLabel[order.status]}</Badge>
              <Badge tone={paymentTone[order.payment_status]}>{order.payment_status}</Badge>
              {order.needs_review && <Badge tone="bg-amber-50 text-amber-700 border-amber-200">Needs review</Badge>}
              {order.inventory_deducted_at && (
                <Badge tone="bg-blue-50 text-blue-700 border-blue-200">Stock deducted</Badge>
              )}
              {order.invoices?.[0] && (
                <Badge tone="bg-ink-100 text-ink-600 border-ink-200">Invoice {order.invoices[0].invoice_number}</Badge>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-ink-200 p-3 text-sm">
                <p className="text-xs text-ink-500">Customer</p>
                <p className="font-medium text-ink-800">{order.customer_name || 'Walk-in'}</p>
                {order.customer_phone && <p className="text-xs text-ink-500">{order.customer_phone}</p>}
                {order.delivery_address && <p className="mt-1 text-xs text-ink-500">{order.delivery_address}</p>}
              </div>
              <div className="rounded-lg border border-ink-200 p-3 text-sm">
                <p className="text-xs text-ink-500">Table / type</p>
                <p className="font-medium text-ink-800">{order.table_no ? `Table ${order.table_no}` : orderTypeLabel[order.order_type]}</p>
                <p className="text-xs text-ink-500">Created by {order.creator?.full_name ?? '—'}</p>
              </div>
              <div className="rounded-lg border border-ink-200 p-3 text-sm">
                <p className="text-xs text-ink-500">Payment</p>
                <p className="font-medium text-ink-800">{money(order.grand_total, currency)}</p>
                <p className="text-xs text-ink-500">{remaining > 0 ? `${money(remaining, currency)} remaining` : 'Settled'}</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-ink-200">
              <table className="table-base">
                <thead>
                  <tr><th>Item</th><th className="text-center">Qty</th><th className="text-right">Unit</th><th className="text-right">Total</th></tr>
                </thead>
                <tbody>
                  {(order.order_items ?? []).map((item) => (
                    <tr key={item.id}>
                      <td>
                        <p className="font-medium text-ink-800">{item.item_name}</p>
                        {item.notes && <p className="text-xs text-amber-600">{item.notes}</p>}
                      </td>
                      <td className="text-center">{item.quantity}</td>
                      <td className="text-right tabular-nums">{money(item.unit_price, currency)}</td>
                      <td className="text-right tabular-nums">{money(item.line_total, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-ink-50 p-3 text-sm">
                <div className="flex justify-between py-0.5"><span className="text-ink-500">Subtotal</span><span>{money(order.subtotal, currency)}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-ink-500">Discount</span><span>−{money(order.discount_total, currency)}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-ink-500">Tax</span><span>{money(order.tax_total, currency)}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-ink-500">Service</span><span>{money(order.service_charge_total, currency)}</span></div>
                <div className="mt-1 flex justify-between border-t border-ink-200 pt-1 font-semibold"><span>Total</span><span>{money(order.grand_total, currency)}</span></div>
              </div>

              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-500">Payments</p>
                {(order.payments ?? []).length === 0 ? (
                  <p className="text-sm text-ink-400">No payments recorded.</p>
                ) : (
                  <div className="space-y-1 text-sm">
                    {(order.payments ?? []).map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded-md border border-ink-200 px-2 py-1">
                        <span className="capitalize text-ink-700">{p.method}{p.external_ref ? ` · ${p.external_ref}` : ''}</span>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums">{money(p.amount, currency)}</span>
                          <Badge tone={p.status === 'refunded' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}>{p.status}</Badge>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-500">Status history</p>
              <div className="space-y-1.5 border-l border-ink-200 pl-4">
                {(order.order_status_history ?? []).map((h) => (
                  <div key={h.id} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand-500" />
                    <p className="text-ink-700">
                      {h.from_status ? `${statusLabel[h.from_status]} → ` : ''}
                      <span className="font-medium">{statusLabel[h.to_status]}</span>
                      <span className="ml-2 text-xs text-ink-400">{dateTime(h.created_at)}</span>
                    </p>
                    {h.reason && <p className="text-xs text-ink-500">{h.reason}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Payment modal */}
      {order && (
        <PaymentModal
          open={payOpen}
          onClose={() => setPayOpen(false)}
          order={order}
          remaining={remaining}
          onDone={async () => {
            setPayOpen(false);
            await refresh();
          }}
        />
      )}

      {/* Cancel modal */}
      {order && (
        <CancelModal
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          order={order}
          onDone={async () => {
            setCancelOpen(false);
            await refresh();
          }}
        />
      )}

      {/* Refund modal */}
      {order && (
        <RefundModal
          open={refundOpen}
          onClose={() => setRefundOpen(false)}
          order={order}
          onDone={async () => {
            setRefundOpen(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function PaymentModal({
  open,
  onClose,
  order,
  remaining,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  order: Order;
  remaining: number;
  onDone: () => Promise<void>;
}) {
  const { settings, paymentMethods, currency } = useSettings();
  const { online } = useSync();
  const [method, setMethod] = useState('cash');
  const [amount, setAmount] = useState(remaining);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAmount(remaining);
    setReference('');
  }, [remaining, open]);

  const selected = paymentMethods.find((m) => m.code === method);

  async function submit() {
    if (!selected) return toast.error('Choose a payment method.');
    if (selected.requires_reference && !reference.trim()) return toast.error('Reference is required.');
    if (!online && selected.requires_reference && settings?.offline_card_payments === false) {
      return toast.error('Offline card payments are disabled. Reconnect or choose cash.');
    }
    setBusy(true);
    try {
      const res = await recordPayment(order.id, selected, amount, reference || undefined);
      if (res.queued) toast.success('Payment queued for synchronization.');
      else toast.success('Payment recorded.');
      await onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Take payment"
      subtitle={`Remaining ${money(remaining, currency)}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Record payment</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Method" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {paymentMethods.map((m) => (
              <option key={m.id} value={m.code}>{m.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Amount" required>
          <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        {selected?.requires_reference && (
          <Field label="Reference" required>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Terminal / wallet ref" />
          </Field>
        )}
      </div>
    </Modal>
  );
}

function CancelModal({
  open,
  onClose,
  order,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  order: Order;
  onDone: () => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [waste, setWaste] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason.trim()) return toast.error('A reason is required.');
    setBusy(true);
    try {
      await setOrderStatus(order.id, 'cancelled', reason, waste);
      toast.success('Order cancelled.');
      await onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Cancel order #${order.order_number}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Keep order</Button>
          <Button variant="danger" onClick={submit} loading={busy}>Cancel order</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Reason" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer changed mind, wrong item…" />
        </Field>
        {order.inventory_deducted_at && (
          <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <input type="checkbox" checked={waste} onChange={(e) => setWaste(e.target.checked)} className="mt-0.5" />
            <span>
              Stock was already deducted. Tick to record the ingredients as <b>waste</b>; leave unticked to return them to stock.
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}

function RefundModal({
  open,
  onClose,
  order,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  order: Order;
  onDone: () => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason.trim()) return toast.error('A reason is required.');
    setBusy(true);
    try {
      await refundOrder(order.id, reason);
      toast.success('Refund recorded. Stock was not returned automatically.');
      await onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Refund order #${order.order_number}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant="danger" onClick={submit} loading={busy}>Confirm refund</Button>
        </>
      }
    >
      <Field label="Reason" required>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <p className="mt-2 text-xs text-ink-500">
        Payments will be marked refunded. Ingredient stock is not automatically returned — use inventory adjustments if needed.
      </p>
    </Modal>
  );
}
