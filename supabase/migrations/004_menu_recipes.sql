-- =============================================================================
-- 004_menu_recipes.sql
-- Categories, ingredients, menu items, recipes and live production cost view.
-- =============================================================================

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  name_ar     text,
  description text,
  image_url   text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.ingredients (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,
  name_ar             text,
  unit                text not null default 'pcs' check (unit in ('g', 'ml', 'pcs')),
  cost_per_unit       numeric(12,4) not null default 0 check (cost_per_unit >= 0),
  low_stock_threshold numeric(14,3) not null default 0,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.menu_items (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid references public.categories(id) on delete set null,
  sku          text unique,
  name         text not null,
  name_ar      text,
  description  text,
  price        numeric(12,2) not null default 0 check (price >= 0),
  image_url    text,
  prep_minutes int not null default 10,
  is_available boolean not null default true,
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists menu_items_category_idx on public.menu_items (category_id);
-- Required for the idempotent seed insert ... on conflict (name) do nothing.
create unique index if not exists categories_name_key on public.categories (name);

create table if not exists public.recipes (
  id          uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null unique references public.menu_items(id) on delete cascade,
  yield_qty   numeric(12,3) not null default 1 check (yield_qty > 0),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.recipe_items (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id),
  quantity      numeric(14,3) not null check (quantity > 0),
  unique (recipe_id, ingredient_id)
);

create index if not exists recipe_items_recipe_idx on public.recipe_items (recipe_id);

-- Live costing. Costs are always derived from current ingredient costs;
-- historical orders are protected by unit_cost snapshots on order_items.
create or replace view public.menu_item_costs
with (security_invoker = true) as
select
  mi.id as menu_item_id,
  mi.price,
  coalesce(c.cost, 0)::numeric(12,2) as production_cost,
  (mi.price - coalesce(c.cost, 0))::numeric(12,2) as profit,
  case when mi.price > 0
       then round(((mi.price - coalesce(c.cost, 0)) / mi.price) * 100, 2)
       else 0 end as margin_pct
from public.menu_items mi
left join lateral (
  select sum(ri.quantity * i.cost_per_unit) / greatest(r.yield_qty, 1) as cost
  from public.recipes r
  join public.recipe_items ri on ri.recipe_id = r.id
  join public.ingredients i on i.id = ri.ingredient_id
  where r.menu_item_id = mi.id
  group by r.yield_qty
) c on true;

drop trigger if exists categories_touch on public.categories;
create trigger categories_touch before update on public.categories
  for each row execute function app.touch_updated_at();
drop trigger if exists ingredients_touch on public.ingredients;
create trigger ingredients_touch before update on public.ingredients
  for each row execute function app.touch_updated_at();
drop trigger if exists menu_items_touch on public.menu_items;
create trigger menu_items_touch before update on public.menu_items
  for each row execute function app.touch_updated_at();
drop trigger if exists recipes_touch on public.recipes;
create trigger recipes_touch before update on public.recipes
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: all staff can read the menu (needed by POS/KDS), menu.manage to write.
-- ---------------------------------------------------------------------------
alter table public.categories  enable row level security;
alter table public.ingredients enable row level security;
alter table public.menu_items  enable row level security;
alter table public.recipes     enable row level security;
alter table public.recipe_items enable row level security;

create policy categories_read on public.categories for select to authenticated using (true);
create policy ingredients_read on public.ingredients for select to authenticated using (true);
create policy menu_items_read on public.menu_items for select to authenticated using (true);
create policy recipes_read on public.recipes for select to authenticated using (true);
create policy recipe_items_read on public.recipe_items for select to authenticated using (true);

create policy categories_write on public.categories for all to authenticated
  using (app.has_permission('menu.manage')) with check (app.has_permission('menu.manage'));
create policy ingredients_write on public.ingredients for all to authenticated
  using (app.has_permission('menu.manage')) with check (app.has_permission('menu.manage'));
create policy menu_items_write on public.menu_items for all to authenticated
  using (app.has_permission('menu.manage')) with check (app.has_permission('menu.manage'));
create policy recipes_write on public.recipes for all to authenticated
  using (app.has_permission('menu.manage')) with check (app.has_permission('menu.manage'));
create policy recipe_items_write on public.recipe_items for all to authenticated
  using (app.has_permission('menu.manage')) with check (app.has_permission('menu.manage'));
