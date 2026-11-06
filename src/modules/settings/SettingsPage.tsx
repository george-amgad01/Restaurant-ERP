import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgePercent,
  Building2,
  CreditCard,
  ListOrdered,
  Plus,
  Receipt,
  Save,
  Settings2,
  Tags,
  UserCog,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import {
  deletePaymentMethod,
  listExpenseCategoriesAll,
  listOrderTypes,
  listPaymentMethods,
  saveExpenseCategory,
  savePaymentMethod,
  updateOrderType,
} from '@/services/settings.service';
import { updateMyProfile } from '@/services/employees.service';
import { errorMessage } from '@/lib/supabase';
import { cn, dateOnly } from '@/lib/utils';
import type { ExpenseCategory, OrderTypeSetting, PaymentMethod, RestaurantSettings } from '@/types';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Select,
  Tabs,
  Textarea,
} from '@/components/ui';

const TABS = [
  { value: 'general', label: 'General' },
  { value: 'financial', label: 'Financial' },
  { value: 'operations', label: 'Operations' },
  { value: 'payments', label: 'Payment methods' },
  { value: 'order-types', label: 'Order types' },
  { value: 'expense-categories', label: 'Expense categories' },
  { value: 'profile', label: 'My profile' },
];

export default function SettingsPage() {
  const { settings, loading } = useSettings();
  const [tab, setTab] = useState('general');

  if (loading && !settings) return <PageLoader label="Loading settings…" />;
  if (!settings) {
    return (
      <Card className="p-6 text-sm text-ink-600">
        Settings row is missing. Run the Supabase seed script to create the singleton settings row.
      </Card>
    );
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Business configuration used by POS, receipts, inventory and reporting." />
      <div className="mb-4 overflow-x-auto">
        <Tabs value={tab} onChange={setTab} tabs={TABS} />
      </div>

      {tab === 'general' && <GeneralTab settings={settings} />}
      {tab === 'financial' && <FinancialTab settings={settings} />}
      {tab === 'operations' && <OperationsTab settings={settings} />}
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'order-types' && <OrderTypesTab />}
      {tab === 'expense-categories' && <ExpenseCategoriesTab />}
      {tab === 'profile' && <ProfileTab />}
    </div>
  );
}

function useSaveSettings() {
  const { updateSettings } = useSettings();
  const [busy, setBusy] = useState(false);

  async function save(patch: Partial<RestaurantSettings>, label = 'Settings saved.') {
    setBusy(true);
    try {
      await updateSettings(patch);
      toast.success(label);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return { save, busy };
}

/* -------------------------------------------------------------------------- */
/* General                                                                    */
/* -------------------------------------------------------------------------- */
function GeneralTab({ settings }: { settings: RestaurantSettings }) {
  const { save, busy } = useSaveSettings();
  const [form, setForm] = useState({
    restaurant_name: settings.restaurant_name,
    legal_name: settings.legal_name ?? '',
    tax_registration: settings.tax_registration ?? '',
    phone: settings.phone ?? '',
    address: settings.address ?? '',
    timezone: settings.timezone,
  });

  return (
    <Card>
      <CardHeader title="Restaurant identity" subtitle="Shown on receipts, the sidebar and reports." actions={<Building2 className="h-4 w-4 text-ink-400" />} />
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <Field label="Restaurant name" required>
          <Input value={form.restaurant_name} onChange={(e) => setForm({ ...form, restaurant_name: e.target.value })} />
        </Field>
        <Field label="Legal / trading name">
          <Input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} />
        </Field>
        <Field label="Tax registration number">
          <Input value={form.tax_registration} onChange={(e) => setForm({ ...form, tax_registration: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <Field label="Timezone" hint="Used to group daily sales and schedule the AI report.">
          <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="Africa/Cairo" />
        </Field>
      </div>
      <SaveBar busy={busy} onClick={() => void save({
        restaurant_name: form.restaurant_name.trim() || 'My Restaurant',
        legal_name: form.legal_name || null,
        tax_registration: form.tax_registration || null,
        phone: form.phone || null,
        address: form.address || null,
        timezone: form.timezone.trim() || 'Africa/Cairo',
      })} />
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Financial                                                                  */
/* -------------------------------------------------------------------------- */
function FinancialTab({ settings }: { settings: RestaurantSettings }) {
  const { save, busy } = useSaveSettings();
  const [form, setForm] = useState({
    currency: settings.currency,
    invoice_prefix: settings.invoice_prefix,
    tax_percent: Number(settings.tax_percent),
    service_charge_percent: Number(settings.service_charge_percent),
    default_discount_percent: Number(settings.default_discount_percent),
    max_cashier_discount_percent: Number(settings.max_cashier_discount_percent),
  });

  return (
    <Card>
      <CardHeader title="Pricing, tax & discounts" subtitle="Applied by the database when orders and invoices are created." actions={<BadgePercent className="h-4 w-4 text-ink-400" />} />
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Currency code" required hint="ISO 4217, e.g. EGP, SAR, AED, USD.">
          <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} />
        </Field>
        <Field label="Invoice prefix" required hint="Invoice number = prefix + zero-padded order number.">
          <Input value={form.invoice_prefix} onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Tax %">
          <Input type="number" min={0} step="0.01" value={form.tax_percent} onChange={(e) => setForm({ ...form, tax_percent: Number(e.target.value) })} />
        </Field>
        <Field label="Service charge %">
          <Input type="number" min={0} step="0.01" value={form.service_charge_percent} onChange={(e) => setForm({ ...form, service_charge_percent: Number(e.target.value) })} />
        </Field>
        <Field label="Default discount %" hint="Pre-filled at POS.">
          <Input type="number" min={0} step="0.01" value={form.default_discount_percent} onChange={(e) => setForm({ ...form, default_discount_percent: Number(e.target.value) })} />
        </Field>
        <Field label="Max cashier discount %" hint="Larger discounts require a manager role.">
          <Input type="number" min={0} step="0.01" value={form.max_cashier_discount_percent} onChange={(e) => setForm({ ...form, max_cashier_discount_percent: Number(e.target.value) })} />
        </Field>
      </div>
      <SaveBar busy={busy} onClick={() => void save({
        currency: form.currency.trim() || 'EGP',
        invoice_prefix: form.invoice_prefix.trim() || 'INV',
        tax_percent: form.tax_percent,
        service_charge_percent: form.service_charge_percent,
        default_discount_percent: form.default_discount_percent,
        max_cashier_discount_percent: form.max_cashier_discount_percent,
      })} />
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Operations                                                                 */
/* -------------------------------------------------------------------------- */
function OperationsTab({ settings }: { settings: RestaurantSettings }) {
  const { save, busy } = useSaveSettings();
  const [form, setForm] = useState({
    inventory_deduct_on: settings.inventory_deduct_on,
    allow_negative_stock: settings.allow_negative_stock,
    offline_card_payments: settings.offline_card_payments,
    require_manager_for_waste: settings.require_manager_for_waste,
    low_stock_alert: settings.low_stock_alert,
    ai_report_time: (settings.ai_report_time ?? '23:30').slice(0, 5),
    receipt_footer: settings.receipt_footer ?? '',
  });

  return (
    <Card>
      <CardHeader title="Inventory, offline & receipt rules" subtitle="Default decisions can be changed here." actions={<Settings2 className="h-4 w-4 text-ink-400" />} />
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label="Deduct inventory on" hint="When the stock ledger consumes recipe ingredients.">
          <Select
            value={form.inventory_deduct_on}
            onChange={(e) => setForm({ ...form, inventory_deduct_on: e.target.value as RestaurantSettings['inventory_deduct_on'] })}
          >
            <option value="new">Order accepted (new)</option>
            <option value="preparing">Kitchen starts (preparing)</option>
          </Select>
        </Field>
        <Field label="AI daily report time" hint="Interpreted in the restaurant timezone.">
          <Input type="time" value={form.ai_report_time} onChange={(e) => setForm({ ...form, ai_report_time: e.target.value })} />
        </Field>
        <Field label="Receipt footer" className="sm:col-span-2">
          <Textarea value={form.receipt_footer} onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })} />
        </Field>
        <div className="space-y-3 sm:col-span-2">
          <Toggle
            label="Allow negative stock"
            description="If disabled, any stock movement that would go below zero is rejected."
            checked={form.allow_negative_stock}
            onChange={(v) => setForm({ ...form, allow_negative_stock: v })}
          />
          <Toggle
            label="Allow offline card payments"
            description="Card payments captured while offline must include a terminal reference for reconciliation."
            checked={form.offline_card_payments}
            onChange={(v) => setForm({ ...form, offline_card_payments: v })}
          />
          <Toggle
            label="Require manager for waste"
            description="Adds an extra approval expectation for waste entries."
            checked={form.require_manager_for_waste}
            onChange={(v) => setForm({ ...form, require_manager_for_waste: v })}
          />
          <Toggle
            label="Low stock alerts"
            description="Show low-stock warnings on the dashboard and inventory screens."
            checked={form.low_stock_alert}
            onChange={(v) => setForm({ ...form, low_stock_alert: v })}
          />
        </div>
      </div>
      <SaveBar busy={busy} onClick={() => void save({
        inventory_deduct_on: form.inventory_deduct_on,
        allow_negative_stock: form.allow_negative_stock,
        offline_card_payments: form.offline_card_payments,
        require_manager_for_waste: form.require_manager_for_waste,
        low_stock_alert: form.low_stock_alert,
        ai_report_time: form.ai_report_time,
        receipt_footer: form.receipt_footer || null,
      })} />
    </Card>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-200 p-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={(e) => { e.preventDefault(); onChange(!checked); }}
        className={cn('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition', checked ? 'bg-brand-600' : 'bg-ink-300')}
      >
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
      <span>
        <span className="block text-sm font-medium text-ink-800">{label}</span>
        <span className="block text-xs text-ink-500">{description}</span>
      </span>
    </label>
  );
}

function SaveBar({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <div className="flex justify-end border-t border-ink-100 px-4 py-3">
      <Button loading={busy} onClick={onClick}><Save className="h-4 w-4" /> Save changes</Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Payment methods                                                            */
/* -------------------------------------------------------------------------- */
function PaymentsTab() {
  const { refresh } = useSettings();
  const qc = useQueryClient();
  const [modal, setModal] = useState<Partial<PaymentMethod> | null>(null);
  const methodsQuery = useQuery({ queryKey: ['payment-methods-all'], queryFn: () => listPaymentMethods(true) });

  async function reload() {
    await Promise.all([methodsQuery.refetch(), refresh(), qc.invalidateQueries({ queryKey: ['payment-methods'] })]);
  }

  async function remove(method: PaymentMethod) {
    if (!window.confirm(`Delete payment method “${method.name}”? Existing payments keep their method code.`)) return;
    try {
      await deletePaymentMethod(method.id);
      toast.success('Payment method deleted.');
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader
        title="Payment methods"
        subtitle="Visible at POS when active. Codes are stored on payments and invoices."
        actions={<Button size="sm" onClick={() => setModal({ code: '', name: '', requires_reference: false, is_active: true, sort_order: (methodsQuery.data?.length ?? 0) + 1 })}><Plus className="h-4 w-4" /> Add</Button>}
      />
      <div className="divide-y divide-ink-100">
        {(methodsQuery.data ?? []).map((method) => (
          <div key={method.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink-800">{method.name}</p>
              <p className="font-mono text-xs text-ink-400">{method.code} · sort {method.sort_order}</p>
            </div>
            <div className="flex items-center gap-2">
              {method.requires_reference && <Badge tone="bg-amber-50 text-amber-700 border-amber-200">Reference required</Badge>}
              <Badge tone={method.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-ink-100 text-ink-500 border-ink-200'}>
                {method.is_active ? 'Active' : 'Hidden'}
              </Badge>
              <Button size="sm" variant="outline" onClick={() => setModal(method)}>Edit</Button>
              <Button size="sm" variant="ghost" className="text-rose-500" onClick={() => void remove(method)}>Delete</Button>
            </div>
          </div>
        ))}
        {methodsQuery.isLoading && <PageLoader label="Loading payment methods…" />}
      </div>
      {modal && (
        <PaymentMethodModal
          value={modal}
          onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await reload(); }}
        />
      )}
    </Card>
  );
}

function PaymentMethodModal({
  value,
  onClose,
  onSaved,
}: {
  value: Partial<PaymentMethod>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<PaymentMethod>>(value);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.code?.trim() || !form.name?.trim()) return toast.error('Code and name are required.');
    setBusy(true);
    try {
      await savePaymentMethod({
        id: form.id,
        code: form.code.trim().toLowerCase().replace(/\s+/g, '_'),
        name: form.name.trim(),
        requires_reference: form.requires_reference ?? false,
        is_active: form.is_active ?? true,
        sort_order: Number(form.sort_order ?? 0),
      });
      toast.success('Payment method saved.');
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
      title={form.id ? 'Edit payment method' : 'Add payment method'}
      size="sm"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Save</Button></>}
    >
      <div className="space-y-3">
        <Field label="Name" required><Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Instapay" /></Field>
        <Field label="Code" required hint="Lowercase identifier, e.g. instapay.">
          <Input value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={Boolean(form.id)} />
        </Field>
        <Field label="Sort order"><Input type="number" value={form.sort_order ?? 0} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.requires_reference ?? false} onChange={(e) => setForm({ ...form, requires_reference: e.target.checked })} />
          Requires an external reference / approval number
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          Active at POS
        </label>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Order types                                                                */
/* -------------------------------------------------------------------------- */
function OrderTypesTab() {
  const { refresh } = useSettings();
  const query = useQuery({ queryKey: ['order-types-all'], queryFn: listOrderTypes });

  async function update(type: OrderTypeSetting, patch: Partial<OrderTypeSetting>) {
    try {
      await updateOrderType(type.order_type, patch);
      toast.success('Order type updated.');
      await Promise.all([query.refetch(), refresh()]);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader title="Order types" subtitle="Requirements and payment timing per channel." actions={<ListOrdered className="h-4 w-4 text-ink-400" />} />
      <div className="divide-y divide-ink-100">
        {(query.data ?? []).map((type) => (
          <div key={type.order_type} className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink-800">{type.label}</p>
                <p className="font-mono text-xs text-ink-400">{type.order_type}</p>
              </div>
              <Badge tone={type.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-ink-100 text-ink-500 border-ink-200'}>
                {type.is_active ? 'Active' : 'Hidden'}
              </Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <Check label="Requires table" checked={type.requires_table} onChange={(v) => void update(type, { requires_table: v })} />
              <Check label="Requires customer name" checked={type.requires_customer} onChange={(v) => void update(type, { requires_customer: v })} />
              <Check label="Requires phone" checked={type.requires_phone} onChange={(v) => void update(type, { requires_phone: v })} />
              <Check label="Requires address" checked={type.requires_address} onChange={(v) => void update(type, { requires_address: v })} />
              <Check label="Pay before kitchen" checked={type.pay_before_kitchen} onChange={(v) => void update(type, { pay_before_kitchen: v })} />
              <Check label="Active" checked={type.is_active} onChange={(v) => void update(type, { is_active: v })} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Expense categories                                                         */
/* -------------------------------------------------------------------------- */
function ExpenseCategoriesTab() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['expense-categories-all'], queryFn: listExpenseCategoriesAll });
  const [modal, setModal] = useState<Partial<ExpenseCategory> | null>(null);

  async function reload() {
    await Promise.all([
      query.refetch(),
      qc.invalidateQueries({ queryKey: ['expense-categories'] }),
    ]);
  }

  return (
    <Card>
      <CardHeader
        title="Expense categories"
        subtitle="Used for reporting and filtering."
        actions={<Button size="sm" onClick={() => setModal({ name: '', is_active: true })}><Plus className="h-4 w-4" /> Add</Button>}
      />
      <div className="divide-y divide-ink-100">
        {(query.data ?? []).map((category) => (
          <div key={category.id} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <Tags className="h-4 w-4 text-ink-400" />
              <p className="text-sm font-medium text-ink-800">{category.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={category.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-ink-100 text-ink-500 border-ink-200'}>
                {category.is_active ? 'Active' : 'Hidden'}
              </Badge>
              <Button size="sm" variant="outline" onClick={() => setModal(category)}>Edit</Button>
            </div>
          </div>
        ))}
        {query.isLoading && <PageLoader label="Loading categories…" />}
      </div>
      {modal && (
        <ExpenseCategoryModal
          value={modal}
          onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await reload(); }}
        />
      )}
    </Card>
  );
}

function ExpenseCategoryModal({
  value,
  onClose,
  onSaved,
}: {
  value: Partial<ExpenseCategory>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(value.name ?? '');
  const [active, setActive] = useState(value.is_active ?? true);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return toast.error('Name is required.');
    setBusy(true);
    try {
      await saveExpenseCategory({ id: value.id, name: name.trim(), is_active: active });
      toast.success('Expense category saved.');
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
      title={value.id ? 'Edit category' : 'Add category'}
      size="sm"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Save</Button></>}
    >
      <div className="space-y-3">
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
        </label>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* My profile                                                                 */
/* -------------------------------------------------------------------------- */
function ProfileTab() {
  const { profile, user, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!fullName.trim()) return toast.error('Name is required.');
    setBusy(true);
    try {
      await updateMyProfile({ full_name: fullName.trim(), phone: phone || undefined });
      await refreshProfile();
      toast.success('Profile updated.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="My profile" subtitle="Displayed to teammates and stored on audit entries." actions={<UserCog className="h-4 w-4 text-ink-400" />} />
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <Field label="Full name" required><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
        <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Email" hint="Managed by Supabase Auth; contact an owner to change it.">
          <Input value={user?.email ?? ''} disabled />
        </Field>
        <Field label="Role"><Input value={profile?.role?.name ?? 'No role'} disabled /></Field>
        <Field label="Account created"><Input value={profile ? dateOnly(profile.created_at) : '—'} disabled /></Field>
      </div>
      <SaveBar busy={busy} onClick={() => void submit()} />
    </Card>
  );
}
