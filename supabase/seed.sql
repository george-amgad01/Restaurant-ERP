-- =============================================================================
-- seed.sql — reference data (idempotent, safe to re-run)
-- No demo users are created. Create the first user in Supabase Auth, then run
-- the promotion snippet in README.md to make them an owner.
-- =============================================================================

-- Permissions ---------------------------------------------------------------
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

-- Roles ---------------------------------------------------------------------
insert into public.roles (code, name, description, is_system) values
  ('owner',     'Owner',     'Full access to every module', true),
  ('manager',   'Manager',   'Operations, finance and reporting', true),
  ('cashier',   'Cashier',   'POS and own orders', true),
  ('kitchen',   'Kitchen',   'Kitchen display only', true),
  ('inventory', 'Inventory', 'Stock and purchasing', true)
on conflict (code) do nothing;

-- Role matrix ---------------------------------------------------------------
with matrix(role_code, perm_code) as (
  values
    -- owner: everything
    ('owner','pos.create_order'), ('owner','orders.view'), ('owner','orders.update_status'),
    ('owner','orders.cancel'), ('owner','orders.refund'), ('owner','kds.view'),
    ('owner','kds.update'), ('owner','menu.manage'), ('owner','inventory.view'),
    ('owner','inventory.adjust'), ('owner','expenses.create'), ('owner','expenses.view'),
    ('owner','dashboard.view'), ('owner','employees.manage'), ('owner','settings.manage'),
    ('owner','activity.view'), ('owner','ai.use'), ('owner','ai.view_reports'),
    -- manager: everything except employees/settings administration
    ('manager','pos.create_order'), ('manager','orders.view'), ('manager','orders.update_status'),
    ('manager','orders.cancel'), ('manager','orders.refund'), ('manager','kds.view'),
    ('manager','kds.update'), ('manager','menu.manage'), ('manager','inventory.view'),
    ('manager','inventory.adjust'), ('manager','expenses.create'), ('manager','expenses.view'),
    ('manager','dashboard.view'), ('manager','activity.view'), ('manager','ai.use'),
    ('manager','ai.view_reports'),
    -- cashier: POS + own orders
    ('cashier','pos.create_order'), ('cashier','orders.view'), ('cashier','orders.update_status'),
    -- kitchen: KDS only
    ('kitchen','kds.view'), ('kitchen','kds.update'),
    -- inventory: stock + create expenses
    ('inventory','inventory.view'), ('inventory','inventory.adjust'), ('inventory','expenses.create')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from matrix m
join public.roles r on r.code = m.role_code
join public.permissions p on p.code = m.perm_code
on conflict do nothing;

-- Branch + settings ---------------------------------------------------------
insert into public.branches (code, name, address, phone, timezone)
values ('main', 'Main Branch', 'Cairo, Egypt', '+20 100 000 0000', 'Africa/Cairo')
on conflict (code) do nothing;

insert into public.restaurant_settings (
  id, branch_id, restaurant_name, legal_name, currency, timezone,
  tax_percent, service_charge_percent, inventory_deduct_on,
  allow_negative_stock, offline_card_payments, invoice_prefix, receipt_footer
)
select 1, b.id, 'My Restaurant', 'My Restaurant LLC', 'EGP', 'Africa/Cairo',
       14, 12, 'preparing', true, true, 'INV', 'Thank you for your visit!'
from public.branches b where b.code = 'main'
on conflict (id) do nothing;

-- Payment methods -----------------------------------------------------------
insert into public.payment_methods (code, name, requires_reference, sort_order) values
  ('cash',   'Cash',            false, 1),
  ('card',   'Card (terminal)', true,  2),
  ('wallet', 'Mobile wallet',   true,  3)
on conflict (code) do nothing;

-- Order types ---------------------------------------------------------------
insert into public.order_type_settings
  (order_type, label, requires_table, requires_customer, requires_phone, requires_address, pay_before_kitchen)
values
  ('dine_in',  'Dine-in',  true,  false, false, false, false),
  ('takeaway', 'Takeaway', false, false, false, false, true),
  ('delivery', 'Delivery', false, true,  true,  true,  true)
on conflict (order_type) do nothing;

-- Expense categories --------------------------------------------------------
insert into public.expense_categories (name) values
  ('Rent'), ('Salaries'), ('Utilities'), ('Maintenance'),
  ('Supplies'), ('Marketing'), ('Other')
on conflict (name) do nothing;

-- Menu categories -----------------------------------------------------------
insert into public.categories (name, name_ar, sort_order) values
  ('Starters', 'المقبلات', 1),
  ('Main Courses', 'الأطباق الرئيسية', 2),
  ('Grills', 'المشويات', 3),
  ('Drinks', 'المشروبات', 4),
  ('Desserts', 'الحلويات', 5)
on conflict do nothing;

-- Ingredients (base units: g / ml / pcs) ------------------------------------
insert into public.ingredients (name, name_ar, unit, cost_per_unit, low_stock_threshold) values
  ('Beef',          'لحم بقري',   'g',  0.4500, 5000),
  ('Chicken',       'دجاج',       'g',  0.2200, 5000),
  ('Burger Bun',    'خبز برجر',   'pcs', 3.0000, 50),
  ('Cheese',        'جبنة',       'g',  0.1800, 2000),
  ('Tomato',        'طماطم',      'g',  0.0120, 3000),
  ('Onion',         'بصل',        'g',  0.0100, 3000),
  ('Rice',          'أرز',        'g',  0.0300, 5000),
  ('Flour',         'دقيق',       'g',  0.0180, 5000),
  ('Milk',          'لبن',        'ml', 0.0250, 3000),
  ('Coffee Beans',  'بن',         'g',  0.4000, 1000),
  ('Sugar',         'سكر',        'g',  0.0200, 2000),
  ('Cooking Oil',   'زيت طهي',    'ml', 0.0600, 3000),
  ('Cola Bottle',   'كولا',       'pcs', 8.0000, 24)
on conflict (name) do nothing;

-- Menu items ----------------------------------------------------------------
insert into public.menu_items (category_id, sku, name, name_ar, description, price, prep_minutes, sort_order)
select c.id, v.sku, v.name, v.name_ar, v.description, v.price, v.prep, v.sort
from (values
  ('Starters',     'STR-001', 'French Fries',      'بطاطس مقلية',   'Crispy golden fries',            40.00,  8, 1),
  ('Starters',     'STR-002', 'Cheese Sticks',     'أصابع جبنة',    'Fried cheese sticks',            65.00, 10, 2),
  ('Main Courses', 'MAIN-001','Beef Burger',       'برجر لحم',      'Beef patty, cheese, fresh veg', 120.00, 15, 1),
  ('Main Courses', 'MAIN-002','Chicken Shawarma',  'شاورما دجاج',   'Chicken wrap with garlic sauce', 90.00, 12, 2),
  ('Grills',       'GRL-001', 'Grilled Chicken',   'فراخ مشوية',    'Half chicken with rice',        160.00, 25, 1),
  ('Grills',       'GRL-002', 'Mixed Grill',       'مشاوي مشكلة',   'Chef selection of grills',      290.00, 30, 2),
  ('Drinks',       'DRK-001', 'Cola',              'كولا',          'Chilled bottle',                 25.00,  2, 1),
  ('Drinks',       'DRK-002', 'Turkish Coffee',    'قهوة تركي',     'Traditional coffee',             35.00,  7, 2),
  ('Desserts',     'DST-001', 'Cheesecake',        'تشيز كيك',      'New York style',                 60.00,  5, 1)
) as v(category, sku, name, name_ar, description, price, prep, sort)
join public.categories c on c.name = v.category
on conflict (sku) do nothing;

-- Recipes -------------------------------------------------------------------
insert into public.recipes (menu_item_id, yield_qty)
select id, 1 from public.menu_items
on conflict (menu_item_id) do nothing;

insert into public.recipe_items (recipe_id, ingredient_id, quantity)
select r.id, i.id, v.qty
from (values
  ('Beef Burger',      'Beef',         180),
  ('Beef Burger',      'Burger Bun',     1),
  ('Beef Burger',      'Cheese',        30),
  ('Beef Burger',      'Tomato',        30),
  ('Beef Burger',      'Onion',         20),
  ('Chicken Shawarma', 'Chicken',      150),
  ('Chicken Shawarma', 'Burger Bun',     1),
  ('Chicken Shawarma', 'Tomato',        20),
  ('Chicken Shawarma', 'Onion',         20),
  ('Chicken Shawarma', 'Cooking Oil',    5),
  ('Grilled Chicken',  'Chicken',      300),
  ('Grilled Chicken',  'Rice',         150),
  ('Grilled Chicken',  'Cooking Oil',   10),
  ('Mixed Grill',      'Beef',         200),
  ('Mixed Grill',      'Chicken',      200),
  ('Mixed Grill',      'Rice',         150),
  ('Mixed Grill',      'Cooking Oil',   15),
  ('Cola',             'Cola Bottle',     1),
  ('Turkish Coffee',   'Coffee Beans',   15),
  ('Turkish Coffee',   'Sugar',          10),
  ('Turkish Coffee',   'Milk',           50),
  ('Cheesecake',       'Cheese',         80),
  ('Cheesecake',       'Sugar',          30),
  ('Cheesecake',       'Flour',          40),
  ('Cheesecake',       'Milk',           60),
  ('French Fries',     'Cooking Oil',    50),
  ('Cheese Sticks',    'Cheese',        100),
  ('Cheese Sticks',    'Flour',          50)
) as v(item_name, ingredient_name, qty)
join public.menu_items m on m.name = v.item_name
join public.recipes r on r.menu_item_id = m.id
join public.ingredients i on i.name = v.ingredient_name
on conflict (recipe_id, ingredient_id) do nothing;

-- Suppliers -----------------------------------------------------------------
insert into public.suppliers (name, contact_name, phone)
select 'Main Food Supplier', 'Ahmed Hassan', '+20 100 111 2222'
where not exists (select 1 from public.suppliers where name = 'Main Food Supplier');
