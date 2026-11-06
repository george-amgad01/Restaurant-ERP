-- =============================================================================
-- 008_audit.sql
-- Append-only activity log and generic row-change audit triggers.
-- =============================================================================

create table if not exists public.activity_logs (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles(id),
  action     text not null,
  table_name text,
  record_id  text,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_created_idx on public.activity_logs (created_at desc);
create index if not exists activity_actor_idx on public.activity_logs (actor_id, created_at desc);
create index if not exists activity_action_idx on public.activity_logs (action);

alter table public.activity_logs enable row level security;

create policy activity_select on public.activity_logs for select to authenticated
  using (app.has_permission('activity.view'));

-- Append-only for every application role.
revoke update, delete, truncate on public.activity_logs from authenticated, anon;
revoke insert on public.activity_logs from authenticated, anon;
grant select on public.activity_logs to authenticated;

-- Generic audit trigger. Attach to configuration / catalog tables that use
-- direct writes; business RPCs log explicitly via app.log_activity().
create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_details jsonb;
  v_record  text;
begin
  -- Read the primary key from the JSON representation so this works for every
  -- audited table, including order_type_settings which has no `id` column.
  if tg_op = 'INSERT' then
    v_details := jsonb_build_object('after', to_jsonb(new));
    v_record  := coalesce(to_jsonb(new)->>'id', '');
  elsif tg_op = 'UPDATE' then
    v_details := jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new));
    v_record  := coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id', '');
  else
    v_details := jsonb_build_object('before', to_jsonb(old));
    v_record  := coalesce(to_jsonb(old)->>'id', '');
  end if;

  insert into public.activity_logs (actor_id, action, table_name, record_id, details)
  values (auth.uid(), tg_table_name || '.' || lower(tg_op), tg_table_name, v_record, v_details);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Sprinkle audit triggers on tables that are edited directly by clients.
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'menu_items', 'ingredients', 'recipes', 'recipe_items',
    'expenses', 'suppliers', 'payment_methods', 'restaurant_settings',
    'expense_categories', 'order_type_settings'
  ] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I
       for each row execute function app.audit_row()', t);
  end loop;
end $$;
