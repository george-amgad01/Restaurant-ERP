-- =============================================================================
-- 002_auth_profiles_rbac.sql
-- Roles, permissions, profiles, employees and the permission helper.
-- =============================================================================

create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.permissions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  module      text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_id       uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text not null default '',
  phone      text,
  avatar_url text,
  role_id    uuid references public.roles(id),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role_id);

create table if not exists public.employees (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null unique references public.profiles(id) on delete cascade,
  job_title         text,
  hire_date         date,
  salary            numeric(12,2),
  national_id       text,
  emergency_contact text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Permission check used by RLS, RPCs and the UI.
-- is_active = false immediately revokes access even for an existing JWT.
-- ---------------------------------------------------------------------------
create or replace function app.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role_id = p.role_id
    join public.permissions perm   on perm.id = rp.permission_id
    where p.id = auth.uid()
      and p.is_active = true
      and perm.code = p_permission
  );
$$;

create or replace function public.has_permission_public(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select app.has_permission(p_permission);
$$;

grant execute on function public.has_permission_public(text) to authenticated, anon;

create or replace function app.current_role_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.code from public.profiles p join public.roles r on r.id = p.role_id
  where p.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Bootstrap a profile for every new auth user.
-- ---------------------------------------------------------------------------
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
begin
  -- Never trust a role supplied at sign-up, and never auto-activate an account:
  -- a self-registered user must be activated and assigned a role explicitly.
  -- The Employees module (admin-invite-user) creates staff and activates them.
  select id into v_role_id from public.roles where code = 'cashier' limit 1;

  insert into public.profiles (id, email, full_name, role_id, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'user'), '@', 1)),
    v_role_id,
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

create or replace function app.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

drop trigger if exists employees_touch on public.employees;
create trigger employees_touch before update on public.employees
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Self-service profile update (no role escalation possible).
-- ---------------------------------------------------------------------------
create or replace function public.update_my_profile(
  p_full_name text default null,
  p_phone text default null,
  p_avatar_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set full_name  = coalesce(p_full_name, full_name),
         phone      = coalesce(p_phone, phone),
         avatar_url = coalesce(p_avatar_url, avatar_url)
   where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin operations (employees.manage) kept in RPCs so no table grants are
-- needed and role escalation is audited.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_employee_role(p_profile_id uuid, p_role_code text)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare v_role uuid;
begin
  if not app.has_permission('employees.manage') then raise exception 'FORBIDDEN'; end if;
  select id into v_role from roles where code = p_role_code;
  if v_role is null then raise exception 'ROLE_NOT_FOUND'; end if;
  update profiles set role_id = v_role where id = p_profile_id;
  perform app.log_activity('employee.role_changed', 'profiles', p_profile_id::text,
    jsonb_build_object('role', p_role_code));
end;
$$;

create or replace function public.admin_set_employee_active(p_profile_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if not app.has_permission('employees.manage') then raise exception 'FORBIDDEN'; end if;
  update profiles set is_active = p_active where id = p_profile_id;
  perform app.log_activity(
    case when p_active then 'employee.activated' else 'employee.deactivated' end,
    'profiles', p_profile_id::text, '{}'::jsonb);
end;
$$;

create or replace function public.admin_upsert_employee(
  p_profile_id uuid,
  p_job_title text default null,
  p_hire_date date default null,
  p_salary numeric default null,
  p_national_id text default null,
  p_emergency_contact text default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if not app.has_permission('employees.manage') then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  insert into public.employees
    (profile_id, job_title, hire_date, salary, national_id, emergency_contact, notes)
  values
    (p_profile_id, p_job_title, p_hire_date, p_salary, p_national_id, p_emergency_contact, p_notes)
  on conflict (profile_id) do update
    set job_title         = excluded.job_title,
        hire_date         = excluded.hire_date,
        salary            = excluded.salary,
        national_id       = excluded.national_id,
        emergency_contact = excluded.emergency_contact,
        notes             = excluded.notes;

  perform app.log_activity('employee.details_updated', 'employees', p_profile_id::text,
    jsonb_build_object('job_title', p_job_title, 'salary', p_salary));
end;
$$;

grant execute on function public.admin_set_employee_role(uuid, text) to authenticated;
grant execute on function public.admin_set_employee_active(uuid, boolean) to authenticated;
grant execute on function public.admin_upsert_employee(uuid, text, date, numeric, text, text, text) to authenticated;
grant execute on function public.update_my_profile(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.roles            enable row level security;
alter table public.permissions      enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles         enable row level security;
alter table public.employees        enable row level security;

create policy roles_read on public.roles for select to authenticated using (true);
create policy permissions_read on public.permissions for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);

create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid()
  or app.has_permission('employees.manage')
  or app.has_permission('dashboard.view')
  or app.has_permission('activity.view')
);
create policy employees_read on public.employees for select to authenticated using (
  profile_id = auth.uid() or app.has_permission('employees.manage')
);

-- No client-side writes on RBAC tables; all writes go through RPCs / migrations.
revoke insert, update, delete on public.roles, public.permissions, public.role_permissions,
  public.profiles, public.employees from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Default RBAC data lives in the migration (not only in seed.sql) so that a
-- fresh `supabase db push` already yields a working cashier role and the app is
-- not locked out if the seed step is skipped. The seed repeats these rows
-- idempotently for local resets.
-- ---------------------------------------------------------------------------
insert into public.permissions (code, module, description) values
  ('pos.create_order',    'pos',        'Create orders and record payments'),
  ('orders.view',         'orders',     'View orders and invoices'),
  ('orders.update_status','orders',     'Advance order status and complete orders'),
  ('orders.cancel',       'orders',     'Cancel orders and approve large discounts'),
  ('orders.refund',       'orders',     'Refund settled orders'),
  ('kds.view',            'kds',        'View the kitchen display'),
  ('kds.update',          'kds',        'Start and complete kitchen tickets'),
  ('menu.manage',         'menu',       'Manage menu, recipes and ingredient costs'),
  ('inventory.view',      'inventory',  'View stock, movements and suppliers'),
  ('inventory.adjust',    'inventory',  'Record purchases, waste, adjustments and stocktakes'),
  ('expenses.create',     'expenses',   'Record expenses'),
  ('expenses.view',       'expenses',   'View and edit expenses'),
  ('dashboard.view',      'dashboard',  'View business dashboards'),
  ('employees.manage',    'employees',  'Manage employees, roles and permissions'),
  ('settings.manage',     'settings',   'Manage restaurant and application settings'),
  ('activity.view',       'activity',   'View the activity log'),
  ('ai.use',              'ai',         'Use the AI assistant'),
  ('ai.view_reports',     'ai',         'View AI daily reports')
on conflict (code) do nothing;

insert into public.roles (code, name, description, is_system) values
  ('owner',     'Owner',     'Full access to every module', true),
  ('manager',   'Manager',   'Operations, finance and reporting', true),
  ('cashier',   'Cashier',   'POS and own orders', true),
  ('kitchen',   'Kitchen',   'Kitchen display only', true),
  ('inventory', 'Inventory', 'Stock and purchasing', true)
on conflict (code) do nothing;

with matrix(role_code, perm_code) as (
  values
    ('owner','pos.create_order'), ('owner','orders.view'), ('owner','orders.update_status'),
    ('owner','orders.cancel'), ('owner','orders.refund'), ('owner','kds.view'),
    ('owner','kds.update'), ('owner','menu.manage'), ('owner','inventory.view'),
    ('owner','inventory.adjust'), ('owner','expenses.create'), ('owner','expenses.view'),
    ('owner','dashboard.view'), ('owner','employees.manage'), ('owner','settings.manage'),
    ('owner','activity.view'), ('owner','ai.use'), ('owner','ai.view_reports'),
    ('manager','pos.create_order'), ('manager','orders.view'), ('manager','orders.update_status'),
    ('manager','orders.cancel'), ('manager','orders.refund'), ('manager','kds.view'),
    ('manager','kds.update'), ('manager','menu.manage'), ('manager','inventory.view'),
    ('manager','inventory.adjust'), ('manager','expenses.create'), ('manager','expenses.view'),
    ('manager','dashboard.view'), ('manager','activity.view'), ('manager','ai.use'),
    ('manager','ai.view_reports'),
    ('cashier','pos.create_order'), ('cashier','orders.view'), ('cashier','orders.update_status'),
    ('kitchen','kds.view'), ('kitchen','kds.update'),
    ('inventory','inventory.view'), ('inventory','inventory.adjust'), ('inventory','expenses.create')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from matrix m
join public.roles r on r.code = m.role_code
join public.permissions p on p.code = m.perm_code
on conflict do nothing;
