-- =============================================================================
-- 009_dashboard_views.sql
-- KPI views. security_invoker = true so every viewer's RLS applies.
-- =============================================================================

create or replace view public.v_daily_kpis
with (security_invoker = true) as
select
  date_trunc('day', o.created_at at time zone rs.timezone)::date as day,
  count(*)::int as orders_count,
  round(sum(o.grand_total), 2) as revenue,
  round(avg(o.grand_total), 2) as avg_order_value,
  round(sum(coalesce(c.cogs, 0)), 2) as cogs,
  round(sum(o.grand_total) - sum(coalesce(c.cogs, 0)), 2) as gross_profit
from public.orders o
cross join (select timezone from public.restaurant_settings where id = 1) rs
left join lateral (
  select sum(oi.unit_cost * oi.quantity) as cogs
  from public.order_items oi where oi.order_id = o.id
) c on true
where o.status = 'completed' and o.payment_status = 'paid'
group by 1;

create or replace view public.v_open_orders
with (security_invoker = true) as
select o.id, o.order_number, o.order_type, o.status, o.payment_status,
       o.table_no, o.customer_name, o.grand_total, o.created_at, o.updated_at,
       o.created_by
from public.orders o
where o.status in ('draft', 'new', 'preparing', 'ready', 'served');

-- Item sales for a period (RLS inherited from orders/order_items).
create or replace function app.item_sales(p_from timestamptz, p_to timestamptz)
returns table (
  menu_item_id uuid,
  item_name text,
  quantity int,
  revenue numeric,
  cost numeric,
  profit numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select oi.menu_item_id,
         oi.item_name,
         sum(oi.quantity)::int as quantity,
         round(sum(oi.line_total), 2) as revenue,
         round(sum(oi.unit_cost * oi.quantity), 2) as cost,
         round(sum(oi.line_total - oi.unit_cost * oi.quantity), 2) as profit
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.status = 'completed'
    and o.created_at >= p_from and o.created_at < p_to
  group by 1, 2
  order by revenue desc;
$$;

create or replace function app.employee_performance(p_from timestamptz, p_to timestamptz)
returns table (
  profile_id uuid,
  full_name text,
  orders_count int,
  revenue numeric,
  avg_order_value numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select p.id,
         p.full_name,
         count(o.id)::int as orders_count,
         round(coalesce(sum(o.grand_total), 0), 2) as revenue,
         round(coalesce(avg(o.grand_total), 0), 2) as avg_order_value
  from public.profiles p
  left join public.orders o
    on o.created_by = p.id
   and o.status = 'completed'
   and o.created_at >= p_from and o.created_at < p_to
  group by 1, 2
  order by revenue desc;
$$;

-- ---------------------------------------------------------------------------
-- Reconciliation helpers (used by dashboard + operational checks).
-- ---------------------------------------------------------------------------
create or replace function app.inventory_consistency()
returns table (ingredient_id uuid, name text, balance numeric, ledger_total numeric, difference numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select i.id,
         i.name,
         coalesce(inv.quantity, 0) as balance,
         coalesce((select sum(t.quantity) from public.inventory_transactions t
                   where t.ingredient_id = i.id), 0) as ledger_total,
         coalesce(inv.quantity, 0) - coalesce((select sum(t.quantity) from public.inventory_transactions t
                   where t.ingredient_id = i.id), 0) as difference
  from public.ingredients i
  left join public.inventory inv on inv.ingredient_id = i.id;
$$;

grant execute on function app.item_sales(timestamptz, timestamptz) to authenticated;
grant execute on function app.employee_performance(timestamptz, timestamptz) to authenticated;
grant execute on function app.inventory_consistency() to authenticated;
grant execute on function app.expense_totals(date, date) to authenticated;
grant select on public.v_daily_kpis, public.v_open_orders,
  public.v_inventory_stock, public.v_low_stock to authenticated;
