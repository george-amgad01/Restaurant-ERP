-- =============================================================================
-- 005_orders_payments.sql
-- Order lifecycle, payments, invoices. All writes are transactional RPCs.
-- =============================================================================

create table if not exists public.orders (
  id                    uuid primary key default gen_random_uuid(),
  branch_id             uuid not null default app.default_branch_id() references public.branches(id),
  order_number          bigint generated always as identity,
  client_operation_id   uuid not null unique,
  local_ref             text,
  order_type            text not null check (order_type in ('dine_in', 'takeaway', 'delivery')),
  status                text not null default 'draft'
                        check (status in ('draft', 'new', 'preparing', 'ready', 'served', 'completed', 'cancelled')),
  payment_status        text not null default 'unpaid'
                        check (payment_status in ('unpaid', 'partial', 'paid', 'refunded', 'partially_refunded')),
  table_no              text,
  customer_name         text,
  customer_phone        text,
  delivery_address      text,
  notes                 text,
  subtotal              numeric(12,2) not null default 0,
  discount_total        numeric(12,2) not null default 0,
  tax_total             numeric(12,2) not null default 0,
  service_charge_total  numeric(12,2) not null default 0,
  grand_total           numeric(12,2) not null default 0,
  inventory_deducted_at timestamptz,
  needs_review          boolean not null default false,
  review_reason         text,
  created_by            uuid not null references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  sync_status           text not null default 'synced'
                        check (sync_status in ('synced', 'pending', 'failed'))
);

create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_open_idx on public.orders (status)
  where status in ('draft', 'new', 'preparing', 'ready', 'served');
create index if not exists orders_created_by_idx on public.orders (created_by, created_at desc);
create index if not exists orders_number_idx on public.orders (order_number);

create table if not exists public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id),
  item_name    text not null,
  quantity     int not null check (quantity > 0),
  unit_price   numeric(12,2) not null,
  unit_cost    numeric(12,2) not null default 0,
  line_total   numeric(12,2) not null,
  notes        text
);

create index if not exists order_items_order_idx on public.order_items (order_id);

create table if not exists public.order_status_history (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status   text not null,
  changed_by  uuid references public.profiles(id),
  reason      text,
  created_at  timestamptz not null default now()
);

create index if not exists order_history_order_idx on public.order_status_history (order_id, created_at);

create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id),
  client_operation_id uuid not null unique,
  method              text not null,
  amount              numeric(12,2) not null check (amount > 0),
  status              text not null default 'succeeded'
                      check (status in ('succeeded', 'failed', 'refunded')),
  external_ref        text,
  received_by         uuid not null references public.profiles(id),
  created_at          timestamptz not null default now()
);

create index if not exists payments_order_idx on public.payments (order_id);

create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null unique references public.orders(id),
  invoice_number text not null unique,
  subtotal       numeric(12,2) not null,
  discount_total numeric(12,2) not null,
  tax_total      numeric(12,2) not null,
  service_charge_total numeric(12,2) not null,
  grand_total    numeric(12,2) not null,
  snapshot       jsonb not null default '{}'::jsonb,
  issued_by      uuid references public.profiles(id),
  issued_at      timestamptz not null default now()
);

create table if not exists public.order_status_transitions (
  from_status         text not null,
  to_status           text not null,
  required_permission text not null,
  primary key (from_status, to_status)
);

insert into public.order_status_transitions (from_status, to_status, required_permission) values
  ('draft', 'new', 'pos.create_order'),
  ('draft', 'cancelled', 'pos.create_order'),
  ('draft', 'completed', 'orders.update_status'),
  ('new', 'preparing', 'kds.update'),
  ('new', 'cancelled', 'orders.cancel'),
  ('preparing', 'ready', 'kds.update'),
  ('preparing', 'cancelled', 'orders.cancel'),
  ('ready', 'served', 'orders.update_status'),
  ('ready', 'completed', 'orders.update_status'),
  ('ready', 'cancelled', 'orders.cancel'),
  ('served', 'completed', 'orders.update_status'),
  ('served', 'cancelled', 'orders.cancel')
on conflict (from_status, to_status) do nothing;

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Visibility helper shared by several RLS policies.
-- ---------------------------------------------------------------------------
create or replace function app.can_view_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and (
        app.has_permission('orders.view')
        or o.created_by = auth.uid()
        or (app.has_permission('kds.view') and o.status in ('new', 'preparing', 'ready'))
        or app.has_permission('dashboard.view')
      )
  );
$$;

-- ===========================================================================
-- create_order: the only way an order enters the system (online or replayed
-- from the offline outbox). Prices always come from the database.
-- ===========================================================================
create or replace function public.create_order(
  p_operation_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_existing       jsonb;
  v_order_id       uuid;
  v_order_number   bigint;
  v_settings       public.restaurant_settings;
  v_ots            public.order_type_settings;
  v_item           jsonb;
  v_menu           public.menu_items;
  v_cost           numeric(12,2);
  v_subtotal       numeric(12,2) := 0;
  v_discount       numeric(12,2) := 0;
  v_tax            numeric(12,2) := 0;
  v_service        numeric(12,2) := 0;
  v_grand          numeric(12,2) := 0;
  v_order_type     text := coalesce(p_payload->>'order_type', 'dine_in');
  v_discount_type  text := p_payload#>>'{discount,type}';
  v_discount_value numeric := coalesce((p_payload#>>'{discount,value}')::numeric, 0);
  v_discount_reason text := p_payload#>>'{discount,reason}';
  v_result         jsonb;
  v_count          int := 0;
  v_qty            numeric;
begin
  if not app.has_permission('pos.create_order') then
    raise exception 'FORBIDDEN';
  end if;
  if p_operation_id is null then
    raise exception 'OPERATION_ID_REQUIRED';
  end if;

  -- Serialize identical retries (two tabs / retry while the first is inflight).
  perform pg_advisory_xact_lock(hashtext(p_operation_id::text));

  select result into v_existing
  from public.sync_operations
  where operation_id = p_operation_id and status = 'succeeded';
  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.sync_operations (operation_id, kind, status, payload, created_by)
  values (p_operation_id, 'create_order', 'processing', p_payload, auth.uid())
  on conflict (operation_id) do update
    set status = 'processing',
        attempts = public.sync_operations.attempts + 1,
        updated_at = now();

  if jsonb_typeof(coalesce(p_payload->'items', 'null'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_payload->'items', '[]'::jsonb)) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;

  select * into v_settings from public.restaurant_settings where id = 1;
  if not found then raise exception 'SETTINGS_MISSING'; end if;

  select * into v_ots from public.order_type_settings where order_type = v_order_type;
  if v_ots.order_type is null or not v_ots.is_active then
    raise exception 'INVALID_ORDER_TYPE';
  end if;
  if v_ots.requires_table and nullif(btrim(coalesce(p_payload->>'table_no', '')), '') is null then
    raise exception 'TABLE_REQUIRED';
  end if;
  if v_ots.requires_customer and nullif(btrim(coalesce(p_payload->>'customer_name', '')), '') is null then
    raise exception 'CUSTOMER_NAME_REQUIRED';
  end if;
  if v_ots.requires_phone and nullif(btrim(coalesce(p_payload->>'customer_phone', '')), '') is null then
    raise exception 'CUSTOMER_PHONE_REQUIRED';
  end if;
  if v_ots.requires_address and nullif(btrim(coalesce(p_payload->>'delivery_address', '')), '') is null then
    raise exception 'DELIVERY_ADDRESS_REQUIRED';
  end if;

  -- Validate every line before writing anything.
  for v_item in select * from jsonb_array_elements(p_payload->'items')
  loop
    select * into v_menu
    from public.menu_items
    where id = (v_item->>'menu_item_id')::uuid and is_active = true;
    if not found then raise exception 'MENU_ITEM_NOT_FOUND %', coalesce(v_item->>'menu_item_id', '?'); end if;
    if not v_menu.is_available then raise exception 'MENU_ITEM_UNAVAILABLE %', v_menu.name; end if;
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);
    if v_qty <= 0 or v_qty <> trunc(v_qty) then raise exception 'INVALID_QUANTITY'; end if;
    v_subtotal := v_subtotal + (v_menu.price * v_qty);
    v_count := v_count + 1;
  end loop;

  v_subtotal := round(v_subtotal, 2);

  if v_discount_value < 0 then raise exception 'INVALID_DISCOUNT'; end if;
  if v_discount_type = 'percent' then
    if v_discount_value > 100 then raise exception 'INVALID_DISCOUNT'; end if;
    if v_discount_value > v_settings.max_cashier_discount_percent
       and not app.has_permission('orders.cancel') then
      raise exception 'DISCOUNT_LIMIT_EXCEEDED';
    end if;
    v_discount := round(v_subtotal * v_discount_value / 100, 2);
  elsif v_discount_type = 'amount' then
    if v_discount_value > v_subtotal then raise exception 'INVALID_DISCOUNT'; end if;
    if v_subtotal > 0
       and (v_discount_value / v_subtotal * 100) > v_settings.max_cashier_discount_percent
       and not app.has_permission('orders.cancel') then
      raise exception 'DISCOUNT_LIMIT_EXCEEDED';
    end if;
    v_discount := round(v_discount_value, 2);
  else
    v_discount := 0;
  end if;

  v_tax     := round((v_subtotal - v_discount) * v_settings.tax_percent / 100, 2);
  v_service := round((v_subtotal - v_discount) * v_settings.service_charge_percent / 100, 2);
  v_grand   := round(v_subtotal - v_discount + v_tax + v_service, 2);

  insert into public.orders (
    client_operation_id, local_ref, order_type, status, table_no,
    customer_name, customer_phone, delivery_address, notes,
    subtotal, discount_total, tax_total, service_charge_total, grand_total,
    created_by
  ) values (
    p_operation_id,
    nullif(p_payload->>'local_ref', ''),
    v_order_type,
    'draft',
    nullif(btrim(coalesce(p_payload->>'table_no', '')), ''),
    nullif(btrim(coalesce(p_payload->>'customer_name', '')), ''),
    nullif(btrim(coalesce(p_payload->>'customer_phone', '')), ''),
    nullif(btrim(coalesce(p_payload->>'delivery_address', '')), ''),
    nullif(p_payload->>'notes', ''),
    v_subtotal, v_discount, v_tax, v_service, v_grand,
    auth.uid()
  )
  returning id, order_number into v_order_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_payload->'items')
  loop
    select * into v_menu from public.menu_items where id = (v_item->>'menu_item_id')::uuid;
    select production_cost into v_cost from public.menu_item_costs where menu_item_id = v_menu.id;

    insert into public.order_items (
      order_id, menu_item_id, item_name, quantity, unit_price, unit_cost, line_total, notes
    ) values (
      v_order_id,
      v_menu.id,
      v_menu.name,
      (v_item->>'quantity')::int,
      v_menu.price,
      coalesce(v_cost, 0),
      round(v_menu.price * (v_item->>'quantity')::numeric, 2),
      nullif(v_item->>'notes', '')
    );
  end loop;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  values (v_order_id, null, 'draft', auth.uid(), 'Order created');

  v_result := jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'discount_total', v_discount,
    'tax_total', v_tax,
    'service_charge_total', v_service,
    'grand_total', v_grand,
    'item_count', v_count
  );

  update public.sync_operations
     set status = 'succeeded', result = v_result, updated_at = now()
   where operation_id = p_operation_id;

  perform app.log_activity('order.created', 'orders', v_order_id::text,
    jsonb_build_object('order_number', v_order_number, 'total', v_grand));

  return v_result;
end;
$$;

-- ===========================================================================
-- pay_order: idempotent payment recording; invoice generated when fully paid.
-- ===========================================================================
create or replace function public.pay_order(
  p_operation_id uuid,
  p_order_id uuid,
  p_method text,
  p_amount numeric,
  p_external_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_existing   jsonb;
  v_order      public.orders;
  v_paid       numeric(12,2);
  v_settings   public.restaurant_settings;
  v_method     public.payment_methods;
  v_invoice_no text;
  v_result     jsonb;
  v_payment_id uuid;
begin
  if not app.has_permission('pos.create_order') then raise exception 'FORBIDDEN'; end if;
  if p_operation_id is null then raise exception 'OPERATION_ID_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtext(p_operation_id::text));

  select result into v_existing from public.sync_operations
  where operation_id = p_operation_id and status = 'succeeded';
  if v_existing is not null then return v_existing; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status = 'cancelled' then raise exception 'ORDER_CANCELLED'; end if;
  if v_order.payment_status = 'paid' then raise exception 'ALREADY_PAID'; end if;

  select * into v_method from public.payment_methods where code = p_method and is_active = true;
  if v_method.id is null then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if v_method.requires_reference and nullif(btrim(coalesce(p_external_ref, '')), '') is null then
    raise exception 'REFERENCE_REQUIRED';
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where order_id = p_order_id and status = 'succeeded';

  if v_paid + p_amount > v_order.grand_total + 0.005 then
    raise exception 'OVERPAYMENT';
  end if;

  insert into public.sync_operations (operation_id, kind, status, created_by)
  values (p_operation_id, 'pay_order', 'processing', auth.uid())
  on conflict (operation_id) do update
    set status = 'processing', attempts = public.sync_operations.attempts + 1, updated_at = now();

  insert into public.payments (order_id, client_operation_id, method, amount, status, external_ref, received_by)
  values (p_order_id, p_operation_id, p_method, p_amount, 'succeeded', nullif(p_external_ref, ''), auth.uid())
  returning id into v_payment_id;

  v_paid := round(v_paid + p_amount, 2);

  if v_paid >= v_order.grand_total - 0.005 then
    update public.orders set payment_status = 'paid' where id = p_order_id;

    select * into v_settings from public.restaurant_settings where id = 1;
    v_invoice_no := v_settings.invoice_prefix || lpad(v_order.order_number::text, 6, '0');

    insert into public.invoices (
      order_id, invoice_number, subtotal, discount_total, tax_total,
      service_charge_total, grand_total, snapshot, issued_by
    )
    select
      o.id, v_invoice_no, o.subtotal, o.discount_total, o.tax_total,
      o.service_charge_total, o.grand_total,
      jsonb_build_object(
        'order_number', o.order_number,
        'order_type', o.order_type,
        'customer_name', o.customer_name,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', oi.item_name, 'qty', oi.quantity,
            'unit_price', oi.unit_price, 'line_total', oi.line_total))
          from public.order_items oi where oi.order_id = o.id
        ), '[]'::jsonb),
        'tax_percent', v_settings.tax_percent,
        'service_charge_percent', v_settings.service_charge_percent,
        'currency', v_settings.currency
      ),
      auth.uid()
    from public.orders o
    where o.id = p_order_id
    on conflict (order_id) do nothing;
  else
    update public.orders set payment_status = 'partial' where id = p_order_id;
  end if;

  v_result := jsonb_build_object(
    'payment_id', v_payment_id,
    'order_id', p_order_id,
    'paid_total', v_paid,
    'payment_status', case when v_paid >= v_order.grand_total - 0.005 then 'paid' else 'partial' end,
    'invoice_number', case when v_paid >= v_order.grand_total - 0.005 then v_invoice_no else null end
  );

  update public.sync_operations
     set status = 'succeeded', result = v_result, updated_at = now()
   where operation_id = p_operation_id;

  perform app.log_activity('payment.recorded', 'orders', p_order_id::text,
    jsonb_build_object('method', p_method, 'amount', p_amount, 'paid_total', v_paid));

  return v_result;
end;
$$;

-- ===========================================================================
-- set_order_status: single entry point for lifecycle transitions.
-- ===========================================================================
create or replace function public.set_order_status(
  p_order_id uuid,
  p_new_status text,
  p_reason text default null,
  p_waste boolean default false
)
returns public.orders
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_order      public.orders;
  v_old_status text;
  v_perm       text;
  v_deduct_on  text;
begin
  perform pg_advisory_xact_lock(hashtext(p_order_id::text));

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  v_old_status := v_order.status;
  if v_old_status = p_new_status then
    -- Idempotent no-op: safe for offline replay and repeated KDS taps.
    if not app.can_view_order(p_order_id) then raise exception 'FORBIDDEN'; end if;
    return v_order;
  end if;

  select required_permission into v_perm
  from public.order_status_transitions
  where from_status = v_old_status and to_status = p_new_status;

  if v_perm is null then
    raise exception 'INVALID_TRANSITION % -> %', v_old_status, p_new_status;
  end if;
  if not app.has_permission(v_perm) then
    raise exception 'FORBIDDEN';
  end if;

  if p_new_status = 'completed' and v_order.payment_status <> 'paid' then
    raise exception 'ORDER_NOT_PAID';
  end if;
  if p_new_status = 'cancelled' and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'REASON_REQUIRED';
  end if;

  update public.orders
     set status = p_new_status,
         updated_at = now()
   where id = p_order_id
   returning * into v_order;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  values (p_order_id, v_old_status, p_new_status, auth.uid(), nullif(btrim(coalesce(p_reason, '')), ''));

  select inventory_deduct_on into v_deduct_on from public.restaurant_settings where id = 1;

  -- Deduct once, at the configured point, or on completion if it never happened.
  if v_order.inventory_deducted_at is null
     and (p_new_status = v_deduct_on or p_new_status = 'completed') then
    perform app.deduct_inventory_for_order(p_order_id);
    select * into v_order from public.orders where id = p_order_id;
  end if;

  if p_new_status = 'cancelled' then
    perform app.reverse_inventory_for_order(p_order_id, p_reason, p_waste);
    select * into v_order from public.orders where id = p_order_id;
  end if;

  perform app.log_activity(
    'order.status_changed', 'orders', p_order_id::text,
    jsonb_build_object('from', v_old_status, 'to', p_new_status,
                       'reason', p_reason, 'waste', p_waste));

  return v_order;
end;
$$;

-- ===========================================================================
-- refund_order: records a refund and flags the order; stock is not returned.
-- ===========================================================================
create or replace function public.refund_order(
  p_order_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare v_order public.orders;
begin
  if not app.has_permission('orders.refund') then raise exception 'FORBIDDEN'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'REASON_REQUIRED'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.payment_status not in ('paid', 'partial') then raise exception 'NOTHING_TO_REFUND'; end if;

  update public.payments set status = 'refunded'
  where order_id = p_order_id and status = 'succeeded';

  update public.orders set payment_status = 'refunded' where id = p_order_id;

  perform app.log_activity('payment.refunded', 'orders', p_order_id::text,
    jsonb_build_object('reason', p_reason, 'amount', v_order.grand_total));
end;
$$;

-- ===========================================================================
-- RLS: reads by policy, writes only through the RPCs above.
-- ===========================================================================
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.order_status_history  enable row level security;
alter table public.payments              enable row level security;
alter table public.invoices              enable row level security;
alter table public.order_status_transitions enable row level security;

create policy orders_select on public.orders for select to authenticated using (
  app.has_permission('orders.view')
  or created_by = auth.uid()
  or (app.has_permission('kds.view') and status in ('new', 'preparing', 'ready'))
  or app.has_permission('dashboard.view')
);

create policy order_items_select on public.order_items for select to authenticated
  using (app.can_view_order(order_id));
create policy order_history_select on public.order_status_history for select to authenticated
  using (app.can_view_order(order_id));
create policy payments_select on public.payments for select to authenticated
  using (app.can_view_order(order_id));
create policy invoices_select on public.invoices for select to authenticated
  using (app.can_view_order(order_id));
create policy transitions_read on public.order_status_transitions for select to authenticated using (true);

revoke insert, update, delete on public.orders, public.order_items,
  public.order_status_history, public.payments, public.invoices
  from authenticated, anon;
revoke insert, update, delete on public.order_status_transitions from authenticated, anon;

grant execute on function public.create_order(uuid, jsonb) to authenticated;
grant execute on function public.pay_order(uuid, uuid, text, numeric, text) to authenticated;
grant execute on function public.set_order_status(uuid, text, text, boolean) to authenticated;
grant execute on function public.refund_order(uuid, text) to authenticated;
