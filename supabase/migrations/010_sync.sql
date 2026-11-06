-- =============================================================================
-- 010_sync.sql
-- Server-side idempotency ledger visibility and health helpers.
-- (The sync_operations table itself is created in 001 so RPCs can use it.)
-- =============================================================================

create policy sync_operations_read on public.sync_operations for select to authenticated
  using (created_by = auth.uid() or app.has_permission('activity.view'));

revoke insert, update, delete on public.sync_operations from authenticated, anon;
grant select on public.sync_operations to authenticated;

create or replace function app.sync_health()
returns table (
  pending int,
  failed int,
  succeeded_today int,
  oldest_pending_minutes numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*) filter (where status = 'processing')::int as pending,
    count(*) filter (where status = 'failed')::int as failed,
    count(*) filter (where status = 'succeeded' and created_at > now() - interval '1 day')::int as succeeded_today,
    coalesce(round(max(extract(epoch from (now() - created_at)) / 60)
      filter (where status = 'processing'), 1), 0) as oldest_pending_minutes
  from public.sync_operations
  where created_by = auth.uid() or app.has_permission('activity.view');
$$;

grant execute on function app.sync_health() to authenticated;
