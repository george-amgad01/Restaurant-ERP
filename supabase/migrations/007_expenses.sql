-- =============================================================================
-- 007_expenses.sql
-- Expense recording with categories, attachments and permission-based access.
-- =============================================================================

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid references public.expense_categories(id),
  amount       numeric(12,2) not null check (amount > 0),
  expense_date date not null default current_date,
  description  text not null,
  receipt_path text,
  is_void      boolean not null default false,
  void_reason  text,
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists expenses_date_idx on public.expenses (expense_date desc);
create index if not exists expenses_category_idx on public.expenses (category_id);

drop trigger if exists expenses_touch on public.expenses;
create trigger expenses_touch before update on public.expenses
  for each row execute function app.touch_updated_at();

alter table public.expenses enable row level security;

create policy expenses_read on public.expenses for select to authenticated
  using (app.has_permission('expenses.view') or created_by = auth.uid());
create policy expenses_insert on public.expenses for insert to authenticated
  with check (app.has_permission('expenses.create') and created_by = auth.uid());
create policy expenses_update on public.expenses for update to authenticated
  using (app.has_permission('expenses.view')) with check (app.has_permission('expenses.view'));
create policy expenses_delete on public.expenses for delete to authenticated
  using (app.has_permission('settings.manage'));

-- ---------------------------------------------------------------------------
-- Expense analytics helper (RLS inherited from the caller).
-- ---------------------------------------------------------------------------
create or replace function app.expense_totals(p_from date, p_to date)
returns table (category text, total numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(ec.name, 'Uncategorised') as category,
         sum(e.amount)::numeric(12,2) as total
  from public.expenses e
  left join public.expense_categories ec on ec.id = e.category_id
  where e.expense_date between p_from and p_to
    and e.is_void = false
  group by 1
  order by 2 desc;
$$;
