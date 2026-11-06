import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Boxes,
  ClipboardCheck,
  Download,
  PackagePlus,
  Plus,
  RefreshCw,
  Scale,
  Search,
  Trash2,
  Truck,
  Warehouse,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { listIngredients } from '@/services/menu.service';
import {
  checkConsistency,
  listLowStock,
  listStock,
  listSuppliers,
  listTransactions,
  recordAdjustment,
  recordPurchase,
  recordWaste,
  saveSupplier,
  submitStocktake,
} from '@/services/inventory.service';
import { errorMessage } from '@/lib/supabase';
import { cn, dateTime, downloadCsv, money, num, todayISO } from '@/lib/utils';
import type { Supplier } from '@/types';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Select,
  StatCard,
  Tabs,
  Textarea,
} from '@/components/ui';

type IngredientRow = Awaited<ReturnType<typeof listIngredients>>[number];

const TX_LABEL: Record<string, string> = {
  purchase: 'Purchase',
  consumption: 'Consumption',
  waste: 'Waste',
  adjustment: 'Adjustment',
  stocktake: 'Stocktake',
  reversal: 'Reversal',
};

const TX_TONE: Record<string, string> = {
  purchase: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  consumption: 'bg-blue-50 text-blue-700 border-blue-200',
  waste: 'bg-rose-50 text-rose-700 border-rose-200',
  adjustment: 'bg-amber-50 text-amber-700 border-amber-200',
  stocktake: 'bg-violet-50 text-violet-700 border-violet-200',
  reversal: 'bg-ink-100 text-ink-600 border-ink-200',
};

export default function InventoryPage() {
  const { currency, settings } = useSettings();
  const { has } = useAuth();
  const qc = useQueryClient();
  const canAdjust = has('inventory.adjust');

  const [tab, setTab] = useState('stock');
  const [search, setSearch] = useState('');
  const [txType, setTxType] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const stockQuery = useQuery({ queryKey: ['inventory-stock'], queryFn: listStock });
  const lowQuery = useQuery({ queryKey: ['inventory-low'], queryFn: listLowStock });
  const ingredientsQuery = useQuery({ queryKey: ['ingredients'], queryFn: listIngredients });
  const suppliersQuery = useQuery({ queryKey: ['suppliers'], queryFn: listSuppliers });
  const txQuery = useQuery({
    queryKey: ['inventory-transactions', txType, from, to],
    queryFn: () => listTransactions({ type: txType, from: from || undefined, to: to || undefined, limit: 200 }),
  });
  const consistencyQuery = useQuery({
    queryKey: ['inventory-consistency'],
    queryFn: checkConsistency,
    enabled: tab === 'consistency',
  });

  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [wasteOpen, setWasteOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [stocktakeOpen, setStocktakeOpen] = useState(false);
  const [supplierModal, setSupplierModal] = useState<Partial<Supplier> | null>(null);

  const stock = stockQuery.data ?? [];
  const ingredients = ingredientsQuery.data ?? [];
  const suppliers = suppliersQuery.data ?? [];

  const filteredStock = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return stock;
    return stock.filter((s) => s.name.toLowerCase().includes(term));
  }, [stock, search]);

  const stockValue = useMemo(() => stock.reduce((a, s) => a + Number(s.stock_value ?? 0), 0), [stock]);

  async function refreshAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['inventory-stock'] }),
      qc.invalidateQueries({ queryKey: ['inventory-low'] }),
      qc.invalidateQueries({ queryKey: ['inventory-transactions'] }),
      qc.invalidateQueries({ queryKey: ['inventory-consistency'] }),
      qc.invalidateQueries({ queryKey: ['ingredients'] }),
      qc.invalidateQueries({ queryKey: ['suppliers'] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
  }

  if (stockQuery.isLoading) return <PageLoader label="Loading stock ledger…" />;

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Ledger-driven stock, purchases, waste and stocktakes."
        actions={
          canAdjust ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStocktakeOpen(true)}>
                <ClipboardCheck className="h-4 w-4" /> Stocktake
              </Button>
              <Button onClick={() => setPurchaseOpen(true)}>
                <PackagePlus className="h-4 w-4" /> Record purchase
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Stock value" value={money(stockValue, currency)} icon={<Warehouse className="h-5 w-5" />} />
        <StatCard
          label="Tracked ingredients"
          value={stock.length}
          icon={<Boxes className="h-5 w-5" />}
          tone="text-blue-600 bg-blue-50"
        />
        <StatCard
          label="Low stock"
          value={lowQuery.data?.length ?? 0}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="text-amber-600 bg-amber-50"
        />
        <StatCard
          label="Negative stock policy"
          value={settings?.allow_negative_stock ? 'Allowed + alert' : 'Blocked'}
          icon={<Scale className="h-5 w-5" />}
          tone="text-violet-600 bg-violet-50"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'stock', label: 'Stock', count: stock.length },
            { value: 'low', label: 'Low stock', count: lowQuery.data?.length ?? 0 },
            { value: 'movements', label: 'Movements' },
            { value: 'suppliers', label: 'Suppliers', count: suppliers.length },
            { value: 'consistency', label: 'Reconciliation' },
          ]}
        />
        {tab === 'stock' && (
          <div className="flex items-center gap-2">
            <div className="relative min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ingredients…" className="pl-9" />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  `stock-${todayISO()}.csv`,
                  filteredStock.map((s) => ({
                    ingredient: s.name,
                    unit: s.unit,
                    quantity: s.quantity,
                    threshold: s.low_stock_threshold,
                    cost_per_unit: s.cost_per_unit,
                    stock_value: s.stock_value,
                  })),
                )
              }
            >
              <Download className="h-4 w-4" /> CSV
            </Button>
          </div>
        )}
      </div>

      <div className="mt-3">
        {tab === 'stock' && (
          <Card>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th className="text-right">On hand</th>
                    <th className="text-right">Threshold</th>
                    <th className="text-right">Cost / unit</th>
                    <th className="text-right">Value</th>
                    <th>Status</th>
                    {canAdjust && <th />}
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.length === 0 ? (
                    <tr>
                      <td colSpan={canAdjust ? 7 : 6}>
                        <EmptyState title="No ingredients" description="Add ingredients from the Menu & recipes module." />
                      </td>
                    </tr>
                  ) : (
                    filteredStock.map((s) => (
                      <tr key={s.ingredient_id}>
                        <td className="font-medium text-ink-800">{s.name}</td>
                        <td className={cn('text-right tabular-nums', s.is_low && 'font-semibold text-amber-700')}>
                          {num(s.quantity, 1)} {s.unit}
                        </td>
                        <td className="text-right tabular-nums text-ink-500">{num(s.low_stock_threshold, 1)}</td>
                        <td className="text-right tabular-nums">{money(s.cost_per_unit, currency)}</td>
                        <td className="text-right tabular-nums">{money(s.stock_value, currency)}</td>
                        <td>
                          {s.quantity < 0 ? (
                            <Badge tone="bg-rose-50 text-rose-700 border-rose-200">Negative</Badge>
                          ) : s.is_low ? (
                            <Badge tone="bg-amber-50 text-amber-700 border-amber-200">Low</Badge>
                          ) : (
                            <Badge tone="bg-emerald-50 text-emerald-700 border-emerald-200">Healthy</Badge>
                          )}
                        </td>
                        {canAdjust && (
                          <td>
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" title="Waste" onClick={() => setWasteOpen(true)}>
                                <Trash2 className="h-4 w-4 text-rose-500" />
                              </Button>
                              <Button size="sm" variant="ghost" title="Adjust" onClick={() => setAdjustOpen(true)}>
                                <Scale className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === 'low' && (
          <Card>
            <CardHeader title="Reorder list" subtitle="Ingredients at or below their threshold." />
            <div className="divide-y divide-ink-100">
              {(lowQuery.data ?? []).length === 0 ? (
                <EmptyState icon={<Boxes className="h-8 w-8" />} title="Everything is above threshold" />
              ) : (
                (lowQuery.data ?? []).map((s) => (
                  <div key={s.ingredient_id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-ink-800">{s.name}</p>
                      <p className="text-xs text-ink-500">
                        Threshold {num(s.low_stock_threshold, 1)} {s.unit} · value {money(s.stock_value, currency)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-amber-700">
                      {num(s.quantity, 1)} {s.unit}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>
        )}

        {tab === 'movements' && (
          <Card>
            <CardHeader
              title="Stock movements"
              subtitle="Every balance change is a ledger entry."
              actions={
                <Button variant="ghost" size="sm" onClick={() => void txQuery.refetch()}>
                  <RefreshCw className={cn('h-4 w-4', txQuery.isFetching && 'animate-spin')} />
                </Button>
              }
            />
            <div className="flex flex-wrap items-end gap-3 border-b border-ink-100 px-4 py-3">
              <Field label="Type">
                <Select value={txType} onChange={(e) => setTxType(e.target.value)}>
                  <option value="all">All types</option>
                  {Object.entries(TX_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
              {(from || to || txType !== 'all') && (
                <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo(''); setTxType('all'); }}>
                  Clear
                </Button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Ingredient</th>
                    <th>Type</th>
                    <th className="text-right">Quantity</th>
                    <th className="text-right">Unit cost</th>
                    <th>Reference / reason</th>
                  </tr>
                </thead>
                <tbody>
                  {txQuery.isLoading ? (
                    <tr><td colSpan={6} className="py-10 text-center text-sm text-ink-400">Loading…</td></tr>
                  ) : (txQuery.data ?? []).length === 0 ? (
                    <tr><td colSpan={6}><EmptyState title="No movements in this range" /></td></tr>
                  ) : (
                    (txQuery.data ?? []).map((t) => (
                      <tr key={t.id}>
                        <td className="whitespace-nowrap text-xs text-ink-500">{dateTime(t.created_at)}</td>
                        <td className="font-medium text-ink-800">{t.ingredient?.name ?? '—'}</td>
                        <td><Badge tone={TX_TONE[t.type]}>{TX_LABEL[t.type] ?? t.type}</Badge></td>
                        <td className={cn('text-right tabular-nums font-medium', Number(t.quantity) < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                          {Number(t.quantity) > 0 ? '+' : ''}{num(t.quantity, 2)} {t.ingredient?.unit ?? ''}
                        </td>
                        <td className="text-right tabular-nums text-ink-500">
                          {t.unit_cost == null ? '—' : money(t.unit_cost, currency)}
                        </td>
                        <td className="max-w-[280px] truncate text-xs text-ink-500">
                          {[t.reference, t.reason].filter(Boolean).join(' · ') || '—'}
                          {t.supplier?.name ? ` · ${t.supplier.name}` : ''}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === 'suppliers' && (
          <Card>
            <CardHeader
              title="Suppliers"
              actions={canAdjust ? <Button size="sm" onClick={() => setSupplierModal({ name: '', is_active: true })}><Plus className="h-4 w-4" /> Add</Button> : undefined}
            />
            <div className="divide-y divide-ink-100">
              {suppliers.length === 0 ? (
                <EmptyState icon={<Truck className="h-8 w-8" />} title="No suppliers yet" />
              ) : (
                suppliers.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-ink-800">{s.name}</p>
                      <p className="text-xs text-ink-500">
                        {[s.contact_name, s.phone, s.email].filter(Boolean).join(' · ') || 'No contact details'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={s.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-ink-100 text-ink-500 border-ink-200'}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      {canAdjust && (
                        <Button size="sm" variant="outline" onClick={() => setSupplierModal(s)}>Edit</Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        )}

        {tab === 'consistency' && (
          <Card>
            <CardHeader
              title="Ledger reconciliation"
              subtitle="Balance must equal the sum of all transactions for every ingredient."
              actions={
                <Button variant="outline" size="sm" onClick={() => void consistencyQuery.refetch()} loading={consistencyQuery.isFetching}>
                  <RefreshCw className="h-4 w-4" /> Check
                </Button>
              }
            />
            {consistencyQuery.isLoading ? (
              <PageLoader label="Reconciling…" />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Ingredient</th>
                      <th className="text-right">Balance</th>
                      <th className="text-right">Ledger total</th>
                      <th className="text-right">Difference</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(consistencyQuery.data ?? []).map((row) => (
                      <tr key={row.ingredient_id}>
                        <td className="font-medium text-ink-800">{row.name}</td>
                        <td className="text-right tabular-nums">{num(row.balance, 3)}</td>
                        <td className="text-right tabular-nums">{num(row.ledger_total, 3)}</td>
                        <td className={cn('text-right tabular-nums', Math.abs(Number(row.difference)) > 0.0001 && 'font-semibold text-rose-600')}>
                          {num(row.difference, 3)}
                        </td>
                        <td>
                          {Math.abs(Number(row.difference)) <= 0.0001 ? (
                            <Badge tone="bg-emerald-50 text-emerald-700 border-emerald-200">Consistent</Badge>
                          ) : (
                            <Badge tone="bg-rose-50 text-rose-700 border-rose-200">Mismatch</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="border-t border-ink-100 px-4 py-3 text-xs text-ink-500">
              Mismatches should be impossible — the trigger is the only writer. If one appears, inspect triggers before adjusting stock.
            </div>
          </Card>
        )}
      </div>

      {purchaseOpen && (
        <PurchaseModal
          ingredients={ingredients}
          suppliers={suppliers}
          onClose={() => setPurchaseOpen(false)}
          onSaved={async () => { setPurchaseOpen(false); await refreshAll(); }}
        />
      )}
      {wasteOpen && (
        <WasteModal
          ingredients={ingredients}
          onClose={() => setWasteOpen(false)}
          onSaved={async () => { setWasteOpen(false); await refreshAll(); }}
        />
      )}
      {adjustOpen && (
        <AdjustModal
          ingredients={ingredients}
          onClose={() => setAdjustOpen(false)}
          onSaved={async () => { setAdjustOpen(false); await refreshAll(); }}
        />
      )}
      {stocktakeOpen && (
        <StocktakeModal
          stock={stock}
          onClose={() => setStocktakeOpen(false)}
          onSaved={async () => { setStocktakeOpen(false); await refreshAll(); }}
        />
      )}
      {supplierModal && (
        <SupplierModal
          value={supplierModal}
          onClose={() => setSupplierModal(null)}
          onSaved={async () => { setSupplierModal(null); await refreshAll(); }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Purchase                                                                   */
/* -------------------------------------------------------------------------- */
function PurchaseModal({
  ingredients,
  suppliers,
  onClose,
  onSaved,
}: {
  ingredients: IngredientRow[];
  suppliers: Supplier[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [supplierId, setSupplierId] = useState('');
  const [reference, setReference] = useState('');
  const [rows, setRows] = useState<{ ingredient_id: string; quantity: number; unit_cost: number }[]>([
    { ingredient_id: '', quantity: 0, unit_cost: 0 },
  ]);
  const [busy, setBusy] = useState(false);

  const total = rows.reduce((a, r) => a + Number(r.quantity) * Number(r.unit_cost), 0);

  async function submit() {
    const clean = rows.filter((r) => r.ingredient_id && Number(r.quantity) > 0 && Number(r.unit_cost) >= 0);
    if (!clean.length) return toast.error('Add at least one line with a quantity.');
    setBusy(true);
    try {
      await recordPurchase(supplierId || null, clean.map((r) => ({
        ingredient_id: r.ingredient_id,
        quantity: Number(r.quantity),
        unit_cost: Number(r.unit_cost),
      })), reference || undefined);
      toast.success('Purchase recorded and weighted costs updated.');
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
      title="Record purchase"
      subtitle="Increases stock and updates the weighted-average unit cost."
      size="lg"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Record purchase</Button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Supplier">
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">No supplier</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Reference / invoice no.">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. INV-2291" />
        </Field>
      </div>

      <div className="mt-4 space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="flex items-end gap-2">
            <Field label={index === 0 ? 'Ingredient' : undefined} className="flex-1">
              <Select
                value={row.ingredient_id}
                onChange={(e) => setRows((prev) => prev.map((r, i) => i === index ? { ...r, ingredient_id: e.target.value } : r))}
              >
                <option value="">Choose…</option>
                {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
              </Select>
            </Field>
            <Field label={index === 0 ? 'Quantity' : undefined} className="w-28">
              <Input type="number" min={0} step="0.001" value={row.quantity}
                onChange={(e) => setRows((prev) => prev.map((r, i) => i === index ? { ...r, quantity: Number(e.target.value) } : r))} />
            </Field>
            <Field label={index === 0 ? 'Unit cost' : undefined} className="w-28">
              <Input type="number" min={0} step="0.0001" value={row.unit_cost}
                onChange={(e) => setRows((prev) => prev.map((r, i) => i === index ? { ...r, unit_cost: Number(e.target.value) } : r))} />
            </Field>
            <Button variant="ghost" size="sm" className="text-rose-500" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, { ingredient_id: '', quantity: 0, unit_cost: 0 }])}>
          <Plus className="h-4 w-4" /> Add line
        </Button>
        <p className="text-sm text-ink-600">Total <span className="font-semibold text-ink-900">{money(total)}</span></p>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Waste / adjustment                                                         */
/* -------------------------------------------------------------------------- */
function MovementModal({
  mode,
  ingredients,
  onClose,
  onSaved,
}: {
  mode: 'waste' | 'adjustment';
  ingredients: IngredientRow[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [ingredientId, setIngredientId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!ingredientId) return toast.error('Choose an ingredient.');
    if (!quantity) return toast.error('Quantity cannot be zero.');
    if (!reason.trim()) return toast.error('A reason is required.');
    setBusy(true);
    try {
      if (mode === 'waste') await recordWaste(ingredientId, quantity, reason.trim());
      else await recordAdjustment(ingredientId, quantity, reason.trim());
      toast.success(mode === 'waste' ? 'Waste recorded.' : 'Adjustment recorded.');
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
      title={mode === 'waste' ? 'Record waste' : 'Adjust stock'}
      subtitle={mode === 'waste' ? 'Removes stock from inventory.' : 'Use a positive number to add, negative to remove.'}
      size="sm"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>{mode === 'waste' ? 'Record waste' : 'Apply adjustment'}</Button></>}
    >
      <div className="space-y-3">
        <Field label="Ingredient" required>
          <Select value={ingredientId} onChange={(e) => setIngredientId(e.target.value)}>
            <option value="">Choose…</option>
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>{i.name} — {num(i.quantity, 2)} {i.unit} on hand</option>
            ))}
          </Select>
        </Field>
        <Field label={mode === 'waste' ? 'Quantity wasted' : 'Quantity change'} required>
          <Input type="number" step="0.001" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        </Field>
        <Field label="Reason" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain what happened…" />
        </Field>
      </div>
    </Modal>
  );
}

function WasteModal(props: { ingredients: IngredientRow[]; onClose: () => void; onSaved: () => Promise<void> }) {
  return <MovementModal mode="waste" {...props} />;
}

function AdjustModal(props: { ingredients: IngredientRow[]; onClose: () => void; onSaved: () => Promise<void> }) {
  return <MovementModal mode="adjustment" {...props} />;
}

/* -------------------------------------------------------------------------- */
/* Stocktake                                                                  */
/* -------------------------------------------------------------------------- */
function StocktakeModal({
  stock,
  onClose,
  onSaved,
}: {
  stock: Awaited<ReturnType<typeof listStock>>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [reason, setReason] = useState('Periodic stocktake');
  const [counted, setCounted] = useState<Record<string, number>>(
    Object.fromEntries(stock.map((s) => [s.ingredient_id, Number(s.quantity)])),
  );
  const [busy, setBusy] = useState(false);

  const differences = stock
    .map((s) => ({ ...s, counted: counted[s.ingredient_id] ?? 0 }))
    .filter((s) => Math.abs(Number(s.counted) - Number(s.quantity)) > 0.0001);

  async function submit() {
    if (!differences.length) return toast.info('No differences to post.');
    setBusy(true);
    try {
      await submitStocktake(
        differences.map((d) => ({ ingredient_id: d.ingredient_id, counted_quantity: Number(d.counted) })),
        reason.trim() || 'Stocktake',
      );
      toast.success(`Stocktake posted for ${differences.length} ingredient(s).`);
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
      title="Stocktake"
      subtitle="Enter physical counts. Only differences are posted to the ledger."
      size="xl"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Post {differences.length} difference(s)</Button></>}
    >
      <Field label="Reason" className="mb-3">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-ink-200">
        <table className="table-base">
          <thead className="sticky top-0 bg-ink-50">
            <tr>
              <th>Ingredient</th>
              <th className="text-right">System</th>
              <th className="text-right">Counted</th>
              <th className="text-right">Difference</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((s) => {
              const value = counted[s.ingredient_id] ?? 0;
              const diff = Number(value) - Number(s.quantity);
              return (
                <tr key={s.ingredient_id}>
                  <td className="font-medium text-ink-800">{s.name} <span className="text-xs text-ink-400">({s.unit})</span></td>
                  <td className="text-right tabular-nums text-ink-500">{num(s.quantity, 2)}</td>
                  <td className="text-right">
                    <Input
                      type="number"
                      step="0.001"
                      value={value}
                      onChange={(e) => setCounted((prev) => ({ ...prev, [s.ingredient_id]: Number(e.target.value) }))}
                      className="h-8 w-24 text-right"
                    />
                  </td>
                  <td className={cn('text-right tabular-nums', Math.abs(diff) > 0.0001 && 'font-semibold text-amber-700')}>
                    {diff > 0 ? '+' : ''}{num(diff, 2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Supplier                                                                   */
/* -------------------------------------------------------------------------- */
function SupplierModal({
  value,
  onClose,
  onSaved,
}: {
  value: Partial<Supplier>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<Supplier>>(value);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.name?.trim()) return toast.error('Supplier name is required.');
    setBusy(true);
    try {
      await saveSupplier({
        id: form.id,
        name: form.name.trim(),
        contact_name: form.contact_name || null,
        phone: form.phone || null,
        email: form.email || null,
        notes: form.notes || null,
        is_active: form.is_active ?? true,
      });
      toast.success('Supplier saved.');
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
      title={form.id ? 'Edit supplier' : 'Add supplier'}
      size="sm"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Save</Button></>}
    >
      <div className="space-y-3">
        <Field label="Name" required><Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Contact person"><Input value={form.contact_name ?? ''} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></Field>
        <Field label="Phone"><Input value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Notes"><Textarea value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active
        </label>
      </div>
    </Modal>
  );
}
