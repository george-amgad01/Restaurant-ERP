-- =============================================================================
-- 013_api_wrappers.sql
-- PostgREST exposes the public schema only, so thin security-invoker wrappers
-- expose the read helpers defined in the app schema to authenticated clients.
-- =============================================================================

create or replace function public.item_sales(p_from timestamptz, p_to timestamptz)
returns table (menu_item_id uuid, item_name text, quantity int, revenue numeric, cost numeric, profit numeric)
language sql stable security invoker set search_path = public, app as $$
  select * from app.item_sales(p_from, p_to);
$$;

create or replace function public.employee_performance(p_from timestamptz, p_to timestamptz)
returns table (profile_id uuid, full_name text, orders_count int, revenue numeric, avg_order_value numeric)
language sql stable security invoker set search_path = public, app as $$
  select * from app.employee_performance(p_from, p_to);
$$;

create or replace function public.expense_totals(p_from date, p_to date)
returns table (category text, total numeric)
language sql stable security invoker set search_path = public, app as $$
  select * from app.expense_totals(p_from, p_to);
$$;

create or replace function public.inventory_consistency()
returns table (ingredient_id uuid, name text, balance numeric, ledger_total numeric, difference numeric)
language sql stable security invoker set search_path = public, app as $$
  select * from app.inventory_consistency();
$$;

create or replace function public.sync_health()
returns table (pending int, failed int, succeeded_today int, oldest_pending_minutes numeric)
language sql stable security invoker set search_path = public, app as $$
  select * from app.sync_health();
$$;

create or replace function public.ai_daily_metrics(p_date date)
returns jsonb
language sql stable security invoker set search_path = public, app as $$
  select app.ai_daily_metrics(p_date);
$$;

grant execute on function public.item_sales(timestamptz, timestamptz) to authenticated;
grant execute on function public.employee_performance(timestamptz, timestamptz) to authenticated;
grant execute on function public.expense_totals(date, date) to authenticated;
grant execute on function public.inventory_consistency() to authenticated;
grant execute on function public.sync_health() to authenticated;
grant execute on function public.ai_daily_metrics(date) to authenticated;
