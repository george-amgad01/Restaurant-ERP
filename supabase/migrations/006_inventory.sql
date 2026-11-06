-- =============================================================================
-- 006_inventory.sql
-- Ledger-based inventory: balances are only ever changed by transactions.
-- =============================================================================

create table if not exists public.suppliers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  contact_name text,
  phone        text,
  email        text,
  notes        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.inventory (
  ingredient_id uuid primary key references public.ingredients(id) on delete cascade,
  quantity      numeric(14,3) not null default 0,
  updated_at    timestamptz not null default now()
);

create table if not exists public.inventory_transactions (
  id            uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id),
  type          text not null check (type in ('purchase', 'consumption', 'waste', 'adjustment', 'stocktake', 'reversal')),
  quantity      numeric(14,3) not null,
  unit_cost     numeric(12,4),
  order_id      uuid references public.orders(id),
  supplier_id   uuid references public.suppliers(id),
  reference     text,
  reason        text,
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now()
);

create index if not exists inv_tx_ingredient_idx on public.inventory_transactions (ingredient_id, created_at desc);
create index if not exists inv_tx_order_idx on public.inventory_transactions (order_id);
create index if not exists inv_tx_type_idx on public.inventory_transactions (type, created_at desc);

-- Balance maintenance trigger: the ONLY place inventory.quantity changes.
create or replace function app.apply_inventory_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.inventory (ingredient_id, quantity)
  values (new.ingredient_id, new.quantity)
  on conflict (ingredient_id) do update
    set quantity = public.inventory.quantity + excluded.quantity,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_inventory_tx_apply on public.inventory_transactions;
create trigger trg_inventory_tx_apply
  after insert on public.inventory_transactions
  for each row execute function app.apply_inventory_transaction();

drop trigger if exists suppliers_touch on public.suppliers;
create trigger suppliers_touch before update on public.suppliers
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Orders -> Inventory: recipe-based consumption, guarded against double runs.
-- ---------------------------------------------------------------------------
create or replace function app.deduct_inventory_for_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_done timestamptz;
  v_cost numeric(12,4);
begin
  select inventory_deducted_at into v_done
  from public.orders where id = p_order_id for update;

  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_done is not null then return; end if;

  insert into public.inventory_transactions
    (ingredient_id, type, quantity, unit_cost, order_id, reason, created_by)
  select ri.ingredient_id,
         'consumption',
         -(ri.quantity * oi.quantity / greatest(r.yield_qty, 1)),
         i.cost_per_unit,
         p_order_id,
         'Recipe consumption for order',
         auth.uid()
  from public.order_items oi
  join public.recipes r       on r.menu_item_id = oi.menu_item_id
  join public.recipe_items ri on ri.recipe_id = r.id
  join public.ingredients i   on i.id = ri.ingredient_id
  where oi.order_id = p_order_id;

  update public.orders set inventory_deducted_at = now() where id = p_order_id;
end;
$$;

-- Cancel after deduction: add stock back (reversal) and optionally waste it.
create or replace function app.reverse_inventory_for_order(
  p_order_id uuid,
  p_reason text,
  p_waste boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare v_done timestamptz;
begin
  select inventory_deducted_at into v_done from public.orders where id = p_order_id for update;
  if v_done is null then return; end if;

  insert into public.inventory_transactions
    (ingredient_id, type, quantity, unit_cost, order_id, reason, created_by)
  select ingredient_id, 'reversal', abs(quantity), unit_cost, p_order_id,
         coalesce(p_reason, 'Order cancelled'), auth.uid()
  from public.inventory_transactions
  where order_id = p_order_id and type = 'consumption';

  if p_waste then
    insert into public.inventory_transactions
      (ingredient_id, type, quantity, unit_cost, order_id, reason, created_by)
    select ingredient_id, 'waste', -abs(quantity), unit_cost, p_order_id,
           coalesce(p_reason, 'Wasted after preparation'), auth.uid()
    from public.inventory_transactions
    where order_id = p_order_id and type = 'consumption';
  end if;

  perform app.log_activity('inventory.reversed', 'orders', p_order_id::text,
    jsonb_build_object('waste', p_waste, 'reason', p_reason));
end;
$$;

-- ---------------------------------------------------------------------------
-- Manual stock operations
-- ---------------------------------------------------------------------------
create or replace function public.record_inventory_transaction(
  p_ingredient_id uuid,
  p_type text,
  p_quantity numeric,
  p_unit_cost numeric default null,
  p_reason text default null,
  p_supplier_id uuid default null,
  p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_id       uuid;
  v_current  numeric(14,3);
  v_cost     numeric(12,4);
  v_allow_negative boolean;
  v_new_cost numeric(12,4);
begin
  if not app.has_permission('inventory.adjust') then raise exception 'FORBIDDEN'; end if;
  if p_type not in ('purchase', 'waste', 'adjustment', 'stocktake') then
    raise exception 'INVALID_TRANSACTION_TYPE';
  end if;
  if p_quantity is null or p_quantity = 0 then raise exception 'INVALID_QUANTITY'; end if;

  -- Optional policy: waste needs a manager-level approval permission.
  if p_type = 'waste'
     and coalesce((select require_manager_for_waste from public.restaurant_settings where id = 1), false)
     and not app.has_permission('orders.cancel') then
    raise exception 'FORBIDDEN';
  end if;

  if p_type = 'purchase' and p_quantity < 0 then raise exception 'INVALID_QUANTITY'; end if;
  if p_type = 'waste' and p_quantity > 0 then p_quantity := -p_quantity; end if;

  select quantity into v_current from public.inventory where ingredient_id = p_ingredient_id for update;
  v_current := coalesce(v_current, 0);

  select allow_negative_stock into v_allow_negative from public.restaurant_settings where id = 1;
  if coalesce(v_allow_negative, true) = false and v_current + p_quantity < 0 then
    raise exception 'INSUFFICIENT_STOCK';
  end if;

  insert into public.inventory_transactions
    (ingredient_id, type, quantity, unit_cost, supplier_id, reference, reason, created_by)
  values (p_ingredient_id, p_type, p_quantity, p_unit_cost, p_supplier_id,
          nullif(p_reference, ''), nullif(btrim(coalesce(p_reason, '')), ''), auth.uid())
  returning id into v_id;

  -- Weighted average cost on purchases.
  if p_type = 'purchase' and p_unit_cost is not null then
    select cost_per_unit into v_cost from public.ingredients where id = p_ingredient_id for update;
    if v_current > 0 then
      v_new_cost := ((v_current * coalesce(v_cost, 0)) + (p_quantity * p_unit_cost)) / (v_current + p_quantity);
    else
      v_new_cost := p_unit_cost;
    end if;
    update public.ingredients set cost_per_unit = round(v_new_cost, 4) where id = p_ingredient_id;
  end if;

  perform app.log_activity('inventory.' || p_type, 'inventory', p_ingredient_id::text,
    jsonb_build_object('quantity', p_quantity, 'reason', p_reason, 'reference', p_reference));

  return v_id;
end;
$$;

create or replace function public.record_purchase(
  p_supplier_id uuid,
  p_items jsonb,
  p_reference text default null
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare v_item jsonb;
begin
  if not app.has_permission('inventory.adjust') then raise exception 'FORBIDDEN'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'EMPTY_PURCHASE'; end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    perform public.record_inventory_transaction(
      (v_item->>'ingredient_id')::uuid,
      'purchase',
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_cost')::numeric,
      'Purchase received',
      p_supplier_id,
      p_reference
    );
  end loop;
end;
$$;

create or replace function public.stocktake(
  p_items jsonb,
  p_reason text default 'Stocktake'
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_item jsonb;
  v_counted numeric(14,3);
  v_current numeric(14,3);
  v_diff numeric(14,3);
begin
  if not app.has_permission('inventory.adjust') then raise exception 'FORBIDDEN'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'EMPTY_STOCKTAKE'; end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_counted := (v_item->>'counted_quantity')::numeric;
    select quantity into v_current from public.inventory
    where ingredient_id = (v_item->>'ingredient_id')::uuid for update;
    v_current := coalesce(v_current, 0);
    v_diff := v_counted - v_current;
    if v_diff <> 0 then
      insert into public.inventory_transactions
        (ingredient_id, type, quantity, reason, created_by)
      values ((v_item->>'ingredient_id')::uuid, 'stocktake', v_diff,
              coalesce(p_reason, 'Stocktake'), auth.uid());
    end if;
  end loop;

  perform app.log_activity('inventory.stocktake', 'inventory', null,
    jsonb_build_object('items', jsonb_array_length(p_items), 'reason', p_reason));
end;
$$;

-- ---------------------------------------------------------------------------
-- Reporting views
-- ---------------------------------------------------------------------------
create or replace view public.v_inventory_stock
with (security_invoker = true) as
select
  i.id as ingredient_id,
  i.name,
  i.unit,
  i.cost_per_unit,
  i.low_stock_threshold,
  coalesce(inv.quantity, 0) as quantity,
  round(coalesce(inv.quantity, 0) * i.cost_per_unit, 2) as stock_value,
  (coalesce(inv.quantity, 0) <= i.low_stock_threshold) as is_low
from public.ingredients i
left join public.inventory inv on inv.ingredient_id = i.id
where i.is_active = true;

create or replace view public.v_low_stock
with (security_invoker = true) as
select * from public.v_inventory_stock where is_low = true;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.suppliers              enable row level security;
alter table public.inventory              enable row level security;
alter table public.inventory_transactions enable row level security;

create policy suppliers_read on public.suppliers for select to authenticated
  using (app.has_permission('inventory.view') or app.has_permission('menu.manage'));
create policy suppliers_write on public.suppliers for all to authenticated
  using (app.has_permission('inventory.adjust')) with check (app.has_permission('inventory.adjust'));

create policy inventory_read on public.inventory for select to authenticated
  using (app.has_permission('inventory.view') or app.has_permission('menu.manage'));

create policy inventory_tx_read on public.inventory_transactions for select to authenticated
  using (app.has_permission('inventory.view') or app.has_permission('menu.manage'));

revoke insert, update, delete on public.inventory, public.inventory_transactions
  from authenticated, anon;

grant execute on function public.record_inventory_transaction(uuid, text, numeric, numeric, text, uuid, text) to authenticated;
grant execute on function public.record_purchase(uuid, jsonb, text) to authenticated;
grant execute on function public.stocktake(jsonb, text) to authenticated;
