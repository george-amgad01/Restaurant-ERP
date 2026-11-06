-- =============================================================================
-- 003_settings.sql
-- Branch, restaurant settings, payment methods, order type rules, categories.
-- =============================================================================

create table if not exists public.branches (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  address    text,
  phone      text,
  timezone   text not null default 'Africa/Cairo',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function app.default_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.branches where is_active order by created_at limit 1;
$$;

create table if not exists public.restaurant_settings (
  id                    int primary key default 1 check (id = 1),
  branch_id             uuid references public.branches(id),
  restaurant_name       text not null default 'My Restaurant',
  legal_name            text,
  tax_registration      text,
  phone                 text,
  address               text,
  currency              text not null default 'EGP',
  timezone              text not null default 'Africa/Cairo',
  tax_percent           numeric(5,2) not null default 14 check (tax_percent >= 0),
  service_charge_percent numeric(5,2) not null default 12 check (service_charge_percent >= 0),
  default_discount_percent numeric(5,2) not null default 0,
  max_cashier_discount_percent numeric(5,2) not null default 10,
  inventory_deduct_on   text not null default 'preparing'
                        check (inventory_deduct_on in ('new', 'preparing')),
  allow_negative_stock  boolean not null default true,
  offline_card_payments boolean not null default true,
  require_manager_for_waste boolean not null default false,
  invoice_prefix        text not null default 'INV',
  receipt_footer        text default 'Thank you for your visit!',
  ai_report_time        time not null default '23:30',
  low_stock_alert       boolean not null default true,
  updated_at            timestamptz not null default now()
);

create table if not exists public.payment_methods (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  name               text not null,
  requires_reference boolean not null default false,
  is_active          boolean not null default true,
  sort_order         int not null default 0,
  created_at         timestamptz not null default now()
);

create table if not exists public.order_type_settings (
  order_type           text primary key
                       check (order_type in ('dine_in', 'takeaway', 'delivery')),
  label                text not null,
  requires_table       boolean not null default false,
  requires_customer    boolean not null default false,
  requires_phone       boolean not null default false,
  requires_address     boolean not null default false,
  pay_before_kitchen   boolean not null default false,
  is_active            boolean not null default true
);

create table if not exists public.expense_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

drop trigger if exists settings_touch on public.restaurant_settings;
create trigger settings_touch before update on public.restaurant_settings
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Default operational settings. Kept in the migration so a fresh project is
-- usable immediately after `supabase db push`; seed.sql can safely re-run them.
-- ---------------------------------------------------------------------------
insert into public.branches (code, name, address, phone, timezone)
values ('main', 'Main Branch', 'Cairo, Egypt', '+20 100 000 0000', 'Africa/Cairo')
on conflict (code) do nothing;

insert into public.restaurant_settings (
  id, branch_id, restaurant_name, legal_name, currency, timezone,
  tax_percent, service_charge_percent, inventory_deduct_on,
  allow_negative_stock, offline_card_payments, invoice_prefix, receipt_footer
)
select 1, b.id, 'My Restaurant', 'My Restaurant LLC', 'EGP', 'Africa/Cairo',
       14, 12, 'preparing', true, true, 'INV', 'Thank you for your visit!'
from public.branches b where b.code = 'main'
on conflict (id) do nothing;

insert into public.payment_methods (code, name, requires_reference, sort_order) values
  ('cash',   'Cash',            false, 1),
  ('card',   'Card (terminal)', true,  2),
  ('wallet', 'Mobile wallet',   true,  3)
on conflict (code) do nothing;

insert into public.order_type_settings
  (order_type, label, requires_table, requires_customer, requires_phone, requires_address, pay_before_kitchen)
values
  ('dine_in',  'Dine-in',  true,  false, false, false, false),
  ('takeaway', 'Takeaway', false, false, false, false, true),
  ('delivery', 'Delivery', false, true,  true,  true,  true)
on conflict (order_type) do nothing;

insert into public.expense_categories (name) values
  ('Rent'), ('Salaries'), ('Utilities'), ('Maintenance'),
  ('Supplies'), ('Marketing'), ('Other')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- RLS: everyone authenticated can read settings (needed to render prices/tax),
-- only settings.manage can change them.
-- ---------------------------------------------------------------------------
alter table public.branches             enable row level security;
alter table public.restaurant_settings  enable row level security;
alter table public.payment_methods      enable row level security;
alter table public.order_type_settings  enable row level security;
alter table public.expense_categories   enable row level security;

create policy branches_read on public.branches for select to authenticated using (true);
create policy settings_read on public.restaurant_settings for select to authenticated using (true);
create policy payment_methods_read on public.payment_methods for select to authenticated using (true);
create policy order_types_read on public.order_type_settings for select to authenticated using (true);
create policy expense_categories_read on public.expense_categories for select to authenticated using (true);

create policy branches_write on public.branches for all to authenticated
  using (app.has_permission('settings.manage')) with check (app.has_permission('settings.manage'));
create policy settings_write on public.restaurant_settings for all to authenticated
  using (app.has_permission('settings.manage')) with check (app.has_permission('settings.manage'));
create policy payment_methods_write on public.payment_methods for all to authenticated
  using (app.has_permission('settings.manage')) with check (app.has_permission('settings.manage'));
create policy order_types_write on public.order_type_settings for all to authenticated
  using (app.has_permission('settings.manage')) with check (app.has_permission('settings.manage'));
create policy expense_categories_write on public.expense_categories for all to authenticated
  using (app.has_permission('settings.manage')) with check (app.has_permission('settings.manage'));
