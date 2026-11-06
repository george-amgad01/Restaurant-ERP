-- =============================================================================
-- 011_ai.sql
-- AI report storage, conversation history and the aggregate data provider.
-- =============================================================================

create table if not exists public.ai_reports (
  id           uuid primary key default gen_random_uuid(),
  report_date  date not null unique,
  summary_md   text,
  metrics_json jsonb not null default '{}'::jsonb,
  model        text,
  status       text not null default 'succeeded' check (status in ('succeeded', 'failed')),
  error        text,
  generated_at timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_messages_user_idx on public.ai_messages (user_id, created_at desc);

alter table public.ai_reports  enable row level security;
alter table public.ai_messages enable row level security;

create policy ai_reports_read on public.ai_reports for select to authenticated
  using (app.has_permission('ai.view_reports') or app.has_permission('ai.use'));
create policy ai_messages_read on public.ai_messages for select to authenticated
  using (user_id = auth.uid());
create policy ai_messages_insert on public.ai_messages for insert to authenticated
  with check (user_id = auth.uid());

revoke update, delete on public.ai_reports, public.ai_messages from authenticated, anon;
revoke insert on public.ai_reports from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Aggregate metrics for one business day. security invoker: RLS applies to
-- the caller, so the assistant can never read data the user cannot see.
-- ---------------------------------------------------------------------------
create or replace function app.ai_daily_metrics(p_date date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, app
as $$
declare
  v_tz text;
  v_sales jsonb;
  v_top jsonb;
  v_expenses jsonb;
  v_low jsonb;
  v_waste jsonb;
  v_prev jsonb;
begin
  if not app.is_service_role()
     and not app.has_permission('ai.use')
     and not app.has_permission('ai.view_reports') then
    raise exception 'FORBIDDEN';
  end if;

  select timezone into v_tz from public.restaurant_settings where id = 1;
  v_tz := coalesce(v_tz, 'UTC');

  select jsonb_build_object(
           'revenue', round(coalesce(sum(grand_total), 0), 2),
           'orders', count(*),
           'avg_order_value', round(coalesce(avg(grand_total), 0), 2))
    into v_sales
  from public.orders
  where status = 'completed' and payment_status = 'paid'
    and (created_at at time zone v_tz)::date = p_date;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_top from (
    select oi.item_name as name,
           sum(oi.quantity)::int as quantity,
           round(sum(oi.line_total), 2) as revenue
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status = 'completed'
      and (o.created_at at time zone v_tz)::date = p_date
    group by 1
    order by revenue desc
    limit 10
  ) x;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_expenses from (
    select coalesce(ec.name, 'Uncategorised') as category,
           round(sum(e.amount), 2) as total
    from public.expenses e
    left join public.expense_categories ec on ec.id = e.category_id
    where e.expense_date = p_date and e.is_void = false
    group by 1
    order by 2 desc
  ) x;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_low from (
    select name, quantity, unit, low_stock_threshold
    from public.v_low_stock
    limit 20
  ) x;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_waste from (
    select i.name, round(sum(abs(t.quantity)), 3) as quantity, i.unit
    from public.inventory_transactions t
    join public.ingredients i on i.id = t.ingredient_id
    where t.type = 'waste' and (t.created_at at time zone v_tz)::date = p_date
    group by 1, 3
    order by 2 desc
  ) x;

  select jsonb_build_object(
           'revenue', round(coalesce(sum(grand_total), 0), 2),
           'orders', count(*))
    into v_prev
  from public.orders
  where status = 'completed' and payment_status = 'paid'
    and (created_at at time zone v_tz)::date = p_date - 1;

  return jsonb_build_object(
    'date', p_date,
    'timezone', v_tz,
    'sales', v_sales,
    'previous_day', v_prev,
    'top_items', v_top,
    'expenses_by_category', v_expenses,
    'low_stock', v_low,
    'waste', v_waste
  );
end;
$$;

grant execute on function app.ai_daily_metrics(date) to authenticated;
grant select on public.ai_reports, public.ai_messages to authenticated;
grant insert on public.ai_messages to authenticated;
