-- =============================================================================
-- 001_extensions_and_helpers.sql
-- Extensions, schemas, shared helpers and the idempotency ledger.
-- =============================================================================

create extension if not exists pgcrypto;

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron is not available in this environment (optional)';
end $$;

create schema if not exists app;
grant usage on schema app to authenticated, anon, service_role;

-- Generic updated_at trigger.
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Idempotency ledger used by create_order / pay_order / status changes.
-- The primary key on operation_id is what makes offline retries safe.
create table if not exists public.sync_operations (
  operation_id uuid primary key,
  kind         text not null,
  status       text not null default 'processing'
               check (status in ('processing', 'succeeded', 'failed')),
  payload      jsonb,
  result       jsonb,
  attempts     int not null default 0,
  last_error   text,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists sync_operations_created_idx
  on public.sync_operations (created_at desc);
create index if not exists sync_operations_status_idx
  on public.sync_operations (status);

alter table public.sync_operations enable row level security;

-- True when the request is authenticated with the service role (Edge Functions).
create or replace function app.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb) ->> 'role',
    ''
  ) = 'service_role';
$$;

-- Append-only audit helper (table itself is created in 008). plpgsql keeps
-- the body unresolved until first call, so migration order is not a problem.
create or replace function app.log_activity(
  p_action text,
  p_table text,
  p_record text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  insert into public.activity_logs (actor_id, action, table_name, record_id, details)
  values (auth.uid(), p_action, p_table, p_record, coalesce(p_details, '{}'::jsonb));
end;
$$;
