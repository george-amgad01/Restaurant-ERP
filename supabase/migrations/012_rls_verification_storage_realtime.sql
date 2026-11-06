-- =============================================================================
-- 012_rls_verification_storage_realtime.sql
-- Final security pass: anon lockout, storage buckets/policies, realtime,
-- and an inventory of tables still missing RLS (used by CI).
-- =============================================================================

-- No anonymous access to business data.
revoke usage on schema app from anon;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on function public.has_permission_public(text) from anon;

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema app to authenticated;

-- Tables the UI writes directly. RLS policies (not grants) decide whether a
-- caller may actually insert/update/delete; financial and stock tables are
-- intentionally absent because they are RPC-only.
grant insert, update, delete on
  public.categories,
  public.menu_items,
  public.ingredients,
  public.recipes,
  public.recipe_items,
  public.suppliers,
  public.expenses,
  public.payment_methods,
  public.order_type_settings,
  public.expense_categories
to authenticated;

grant update on public.restaurant_settings, public.branches to authenticated;

-- Storage buckets ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Menu images: public read, menu.manage upload.
drop policy if exists menu_images_read on storage.objects;
create policy menu_images_read on storage.objects for select
  using (bucket_id = 'menu-images');

drop policy if exists menu_images_write on storage.objects;
create policy menu_images_write on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-images' and app.has_permission('menu.manage'));

drop policy if exists menu_images_update on storage.objects;
create policy menu_images_update on storage.objects for update to authenticated
  using (bucket_id = 'menu-images' and app.has_permission('menu.manage'));

drop policy if exists menu_images_delete on storage.objects;
create policy menu_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'menu-images' and app.has_permission('menu.manage'));

-- Expense receipts: private, uploader/expenses.view can read.
drop policy if exists expense_receipts_read on storage.objects;
create policy expense_receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'expense-receipts'
         and (app.has_permission('expenses.view') or owner = auth.uid()));

drop policy if exists expense_receipts_write on storage.objects;
create policy expense_receipts_write on storage.objects for insert to authenticated
  with check (bucket_id = 'expense-receipts' and app.has_permission('expenses.create'));

drop policy if exists expense_receipts_delete on storage.objects;
create policy expense_receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'expense-receipts'
         and (owner = auth.uid() or app.has_permission('settings.manage')));

-- Documents: settings.manage only.
drop policy if exists documents_read on storage.objects;
create policy documents_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and app.has_permission('settings.manage'));

drop policy if exists documents_write on storage.objects;
create policy documents_write on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and app.has_permission('settings.manage'));

-- Realtime ------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['orders', 'order_items', 'inventory', 'menu_items']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then
      null; -- already a member or publication not present (plain Postgres)
    end;
  end loop;
end $$;

-- CI helper: any public table without RLS is a security bug.
create or replace view public.v_tables_without_rls
with (security_invoker = true) as
select c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
order by 1;

grant select on public.v_tables_without_rls to authenticated;


-- Internal helpers are not callable from the API.
revoke execute on function app.log_activity(text, text, text, jsonb) from authenticated, anon;
revoke execute on function app.deduct_inventory_for_order(uuid) from authenticated, anon;
revoke execute on function app.reverse_inventory_for_order(uuid, text, boolean) from authenticated, anon;
revoke execute on function app.audit_row() from authenticated, anon;
revoke execute on function app.handle_new_user() from authenticated, anon;

