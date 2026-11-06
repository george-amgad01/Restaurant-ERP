import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bike,
  CheckCircle2,
  CreditCard,
  Minus,
  Package,
  Plus,
  Search,
  Send,
  ShoppingBag,
  StickyNote,
  Trash2,
  Utensils,
  WifiOff,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSettings } from '@/context/SettingsContext';
import { useSync } from '@/context/SyncContext';
import { listPosCatalog } from '@/services/menu.service';
import { payAndSendToKitchen, sendOrderToKitchen } from '@/services/orders.service';
import { useRealtimeRefetch } from '@/realtime/useRealtimeRefetch';
import { errorMessage } from '@/lib/supabase';
import { cn, money, orderTypeLabel } from '@/lib/utils';
import type { CreateOrderInput, MenuItem, OrderType } from '@/types';
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
  Select,
  Textarea,
} from '@/components/ui';

interface CartLine {
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
}

const typeIcon: Record<string, typeof Utensils> = {
  dine_in: Utensils,
  takeaway: ShoppingBag,
  delivery: Bike,
};

export default function PosPage() {
  const { settings, paymentMethods, orderTypes, currency } = useSettings();
  const { online } = useSync();

  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [tableNo, setTableNo] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState(0);
  const defaultDiscountApplied = useRef(false);
  const [noteEditor, setNoteEditor] = useState<string | null>(null);

  // Settings arrive after sign-in, so apply the configured default once they load.
  useEffect(() => {
    if (defaultDiscountApplied.current || !settings) return;
    defaultDiscountApplied.current = true;
    setDiscount(Number(settings.default_discount_percent ?? 0));
  }, [settings]);

  const [payOpen, setPayOpen] = useState(false);
  const [methodCode, setMethodCode] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState<'kitchen' | 'pay' | null>(null);
  const [success, setSuccess] = useState<{ number?: number; total?: number; queued: boolean } | null>(null);

  const catalogQuery = useQuery({
    queryKey: ['pos-catalog'],
    queryFn: listPosCatalog,
    staleTime: 60_000,
  });
  useRealtimeRefetch(() => void catalogQuery.refetch(), { table: 'menu_items' });

  const items = catalogQuery.data?.items ?? [];
  const categories = catalogQuery.data?.categories ?? [];
  const ots = orderTypes.find((o) => o.order_type === orderType);
  const payBeforeKitchen = Boolean(ots?.pay_before_kitchen);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items
      .filter((i) => i.is_available)
      .filter((i) => activeCategory === 'all' || i.category_id === activeCategory)
      .filter(
        (i) =>
          !term ||
          i.name.toLowerCase().includes(term) ||
          (i.name_ar ?? '').toLowerCase().includes(term) ||
          (i.sku ?? '').toLowerCase().includes(term),
      );
  }, [items, activeCategory, search]);

  const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const discountValue = Math.min(100, Math.max(0, discount)) * subtotal / 100;
  const taxable = subtotal - discountValue;
  const tax = (taxable * (settings?.tax_percent ?? 0)) / 100;
  const service = (taxable * (settings?.service_charge_percent ?? 0)) / 100;
  const grand = taxable + tax + service;

  function addItem(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((l) => l.menu_item_id === item.id);
      if (existing) {
        return prev.map((l) => (l.menu_item_id === item.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { menu_item_id: item.id, name: item.name, price: Number(item.price), quantity: 1, notes: '' }];
    });
  }

  function changeQty(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.menu_item_id === id ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  function removeLine(id: string) {
    setCart((prev) => prev.filter((l) => l.menu_item_id !== id));
  }

  function clearCart() {
    setCart([]);
    setDiscount(Number(settings?.default_discount_percent ?? 0));
    setTableNo('');
    setCustomerName('');
    setCustomerPhone('');
    setAddress('');
    setNotes('');
    setNoteEditor(null);
  }

  function buildInput(): CreateOrderInput {
    return {
      order_type: orderType,
      table_no: tableNo || undefined,
      customer_name: customerName || undefined,
      customer_phone: customerPhone || undefined,
      delivery_address: address || undefined,
      notes: notes || undefined,
      discount: discount > 0 ? { type: 'percent', value: discount, reason: 'POS discount' } : undefined,
      items: cart.map((l) => ({
        menu_item_id: l.menu_item_id,
        quantity: l.quantity,
        notes: l.notes || undefined,
      })),
    };
  }

  function validate(requirePayment = false) {
    if (cart.length === 0) {
      toast.error('Add at least one item to the order.');
      return false;
    }
    if (ots?.requires_table && !tableNo.trim()) {
      toast.error('Table number is required for dine-in.');
      return false;
    }
    if (ots?.requires_customer && !customerName.trim()) {
      toast.error('Customer name is required.');
      return false;
    }
    if (ots?.requires_phone && !customerPhone.trim()) {
      toast.error('Customer phone is required.');
      return false;
    }
    if (ots?.requires_address && !address.trim()) {
      toast.error('Delivery address is required.');
      return false;
    }
    if (requirePayment && !methodCode) {
      toast.error('Choose a payment method.');
      return false;
    }
    return true;
  }

  async function handleSendToKitchen() {
    if (!validate()) return;
    setBusy('kitchen');
    try {
      const res = await sendOrderToKitchen(buildInput());
      if (res.queued) {
        toast.success('Offline — order queued and will be sent to the kitchen when connectivity returns.');
        setSuccess({ queued: true });
      } else {
        toast.success(`Order #${res.orderNumber} sent to the kitchen.`);
        setSuccess({ number: res.orderNumber, total: res.grandTotal, queued: false });
      }
      clearCart();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handlePay() {
    if (!validate(true)) return;
    const method = paymentMethods.find((m) => m.code === methodCode);
    if (!method) return;
    if (method.requires_reference && !reference.trim()) {
      toast.error('Enter the terminal / wallet reference.');
      return;
    }
    if (!online && method.requires_reference && settings?.offline_card_payments === false) {
      toast.error('Offline card payments are disabled. Reconnect or choose cash.');
      return;
    }
    setBusy('pay');
    try {
      const res = await payAndSendToKitchen(buildInput(), method, reference || undefined);
      if (res.queued) {
        toast.success('Offline — sale queued. It will sync automatically.');
        setSuccess({ queued: true });
      } else {
        toast.success(`Order #${res.orderNumber} paid and sent to the kitchen.`);
        setSuccess({ number: res.orderNumber, total: res.grandTotal, queued: false });
      }
      setPayOpen(false);
      setMethodCode('');
      setReference('');
      clearCart();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (catalogQuery.isLoading) return <PageLoader label="Loading menu…" />;

  return (
    <div>
      <PageHeader
        title="Point of sale"
        subtitle={online ? 'Prices and totals are validated by the database.' : 'Offline mode — sales are queued locally.'}
        actions={
          !online ? (
            <Badge tone="bg-amber-50 text-amber-700 border-amber-200">
              <WifiOff className="h-3 w-3" /> Offline
            </Badge>
          ) : undefined
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_390px]">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search meals, Arabic name or SKU…"
                className="bg-white pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setActiveCategory('all')}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                  activeCategory === 'all'
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300',
                )}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                    activeCategory === c.id
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300',
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Utensils className="h-8 w-8" />}
                title="No meals match"
                description="Try another category or enable meals in Menu & Recipes."
              />
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  onClick={() => addItem(item)}
                  className="group overflow-hidden rounded-xl border border-ink-200 bg-white text-left shadow-card transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-pop"
                >
                  <div className="relative h-24 overflow-hidden bg-gradient-to-br from-brand-50 to-ink-100">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-brand-300">
                        <Utensils className="h-8 w-8" />
                      </div>
                    )}
                    {!item.is_available && (
                      <div className="absolute inset-0 grid place-items-center bg-ink-900/60 text-xs font-semibold text-white">
                        Unavailable
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-1 text-sm font-medium text-ink-800">{item.name}</p>
                    <p className="line-clamp-1 text-[11px] text-ink-400">{item.category?.name ?? 'Uncategorised'}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-brand-700">{money(item.price, currency)}</span>
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-50 text-brand-700 transition group-hover:bg-brand-600 group-hover:text-white">
                        <Plus className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card className="overflow-hidden">
            <div className="border-b border-ink-100 p-3">
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-ink-100 p-1">
                {(orderTypes.filter((o) => o.is_active).length ? orderTypes.filter((o) => o.is_active) : []).map((o) => {
                  const Icon = typeIcon[o.order_type] ?? Utensils;
                  return (
                    <button
                      key={o.order_type}
                      onClick={() => setOrderType(o.order_type)}
                      className={cn(
                        'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition',
                        orderType === o.order_type ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {o.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {ots?.requires_table !== false && (
                  <Field label="Table" className="col-span-1">
                    <Input value={tableNo} onChange={(e) => setTableNo(e.target.value)} placeholder={ots?.requires_table ? 'Required' : 'Optional'} />
                  </Field>
                )}
                <Field label="Customer" className={ots?.requires_table === false ? 'col-span-1' : 'col-span-1'}>
                  <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={ots?.requires_customer ? 'Required' : 'Optional'} />
                </Field>
                {(orderType === 'delivery' || orderType === 'takeaway') && (
                  <Field label="Phone" className="col-span-1">
                    <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder={ots?.requires_phone ? 'Required' : 'Optional'} />
                  </Field>
                )}
                {orderType === 'delivery' && (
                  <Field label="Address" className="col-span-2">
                    <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Delivery address" />
                  </Field>
                )}
              </div>
            </div>

            <div className="max-h-[38vh] min-h-[120px] overflow-y-auto">
              {cart.length === 0 ? (
                <EmptyState
                  icon={<ShoppingBag className="h-7 w-7" />}
                  title="Cart is empty"
                  description="Tap a meal to add it to the order."
                />
              ) : (
                <div className="divide-y divide-ink-100">
                  {cart.map((line) => (
                    <div key={line.menu_item_id} className="px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink-800">{line.name}</p>
                          <p className="text-xs text-ink-500">{money(line.price, currency)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => changeQty(line.menu_item_id, -1)}
                            className="grid h-7 w-7 place-items-center rounded-md border border-ink-200 text-ink-600 hover:bg-ink-50"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm font-semibold tabular-nums">{line.quantity}</span>
                          <button
                            onClick={() => changeQty(line.menu_item_id, 1)}
                            className="grid h-7 w-7 place-items-center rounded-md border border-ink-200 text-ink-600 hover:bg-ink-50"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setNoteEditor(noteEditor === line.menu_item_id ? null : line.menu_item_id)}
                            className={cn(
                              'ml-1 grid h-7 w-7 place-items-center rounded-md border',
                              line.notes ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-ink-200 text-ink-500 hover:bg-ink-50',
                            )}
                            title="Item note"
                          >
                            <StickyNote className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => removeLine(line.menu_item_id)}
                            className="grid h-7 w-7 place-items-center rounded-md text-rose-500 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {noteEditor === line.menu_item_id && (
                        <div className="mt-2 flex gap-2">
                          <Input
                            autoFocus
                            value={line.notes}
                            onChange={(e) =>
                              setCart((prev) =>
                                prev.map((l) =>
                                  l.menu_item_id === line.menu_item_id ? { ...l, notes: e.target.value } : l,
                                ),
                              )
                            }
                            placeholder="No onions, extra spicy…"
                            className="h-8 text-xs"
                          />
                          <Button size="sm" variant="outline" onClick={() => setNoteEditor(null)}>
                            Done
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-ink-100 p-3">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-ink-500">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{money(subtotal, currency)}</span>
                </div>
                <div className="flex items-center justify-between text-ink-500">
                  <span className="flex items-center gap-2">
                    Discount
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={discount || ''}
                      onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                      className="h-7 w-16 px-2 py-0 text-right text-xs"
                      placeholder="0"
                    />
                    <span className="text-xs">%</span>
                  </span>
                  <span className="tabular-nums">−{money(discountValue, currency)}</span>
                </div>
                <div className="flex justify-between text-ink-500">
                  <span>Tax ({settings?.tax_percent ?? 0}%)</span>
                  <span className="tabular-nums">{money(tax, currency)}</span>
                </div>
                <div className="flex justify-between text-ink-500">
                  <span>Service ({settings?.service_charge_percent ?? 0}%)</span>
                  <span className="tabular-nums">{money(service, currency)}</span>
                </div>
                <div className="flex justify-between border-t border-dashed border-ink-200 pt-2 text-base font-semibold text-ink-900">
                  <span>Total</span>
                  <span className="tabular-nums">{money(grand, currency)}</span>
                </div>
              </div>

              <Field label="Order notes" className="mt-3">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Allergies, delivery instructions…"
                  className="min-h-[52px] text-xs"
                />
              </Field>

              <div className="mt-3 grid gap-2">
                {payBeforeKitchen ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (validate(true)) setPayOpen(true);
                    }}
                    disabled={busy !== null || cart.length === 0}
                  >
                    <CreditCard className="h-4 w-4" /> Pay & send to kitchen
                  </Button>
                ) : (
                  <Button onClick={handleSendToKitchen} loading={busy === 'kitchen'} disabled={busy !== null || cart.length === 0}>
                    <Send className="h-4 w-4" /> Send to kitchen
                  </Button>
                )}
              </div>
              <p className="mt-2 text-center text-[11px] text-ink-400">
                {payBeforeKitchen
                  ? 'Payment is collected before preparation for this order type.'
                  : orderType === 'dine_in'
                    ? 'Dine-in is paid from the Orders screen after serving.'
                    : 'Pay from the Orders screen when this order is ready.'}
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Take payment"
        subtitle={`Amount due ${money(grand, currency)}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={handlePay} loading={busy === 'pay'}>
              <CheckCircle2 className="h-4 w-4" /> Confirm payment
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Payment method" required>
            <Select value={methodCode} onChange={(e) => setMethodCode(e.target.value)}>
              <option value="">Choose…</option>
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.code}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>

          {paymentMethods.find((m) => m.code === methodCode)?.requires_reference && (
            <Field label="Terminal / wallet reference" required hint="Offline card payments are recorded as references for later review.">
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. TXN-88231" />
            </Field>
          )}

          <div className="rounded-lg bg-ink-50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-500">Charging</span>
              <span className="font-semibold text-ink-900">{money(grand, currency)}</span>
            </div>
            {orderType !== 'dine_in' && ots?.pay_before_kitchen && (
              <p className="mt-1 text-xs text-ink-500">This order type is configured to be paid before the kitchen starts.</p>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={!!success}
        onClose={() => setSuccess(null)}
        title={success?.queued ? 'Saved offline' : 'Sale completed'}
        size="sm"
        footer={<Button onClick={() => setSuccess(null)}>New order</Button>}
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          {success?.queued ? (
            <p className="text-sm text-ink-600">
              The order is stored locally and will synchronize automatically. You can track it in the Sync screen.
            </p>
          ) : (
            <>
              <p className="text-lg font-semibold text-ink-900">Order #{success?.number}</p>
              <p className="text-sm text-ink-500">Total {money(success?.total ?? 0, currency)}</p>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
