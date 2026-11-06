-- =============================================================================
-- 014_ai_quota.sql
-- Simple per-user hourly quota for AI calls (cost control).
-- =============================================================================

create table if not exists public.ai_usage (
  user_id      uuid not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (user_id, window_start)
);

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from authenticated, anon;

create or replace function app.ai_consume_quota(p_limit int default 30)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $$
declare v_count int;
begin
  if auth.uid() is null then return false; end if;

  insert into public.ai_usage (user_id, window_start, count)
  values (auth.uid(), date_trunc('hour', now()), 1)
  on conflict (user_id, window_start)
  do update set count = public.ai_usage.count + 1
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

create or replace function public.ai_consume_quota(p_limit int default 30)
returns boolean
language sql
security definer
set search_path = public, app
as $$
  select app.ai_consume_quota(p_limit);
$$;

revoke execute on function public.ai_consume_quota(int) from anon;
grant execute on function public.ai_consume_quota(int) to authenticated;

-- app.is_service_role() is defined in 001 so earlier migrations can use it.
