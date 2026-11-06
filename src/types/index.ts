export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type OrderStatus =
  | 'draft'
  | 'new'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'completed'
  | 'cancelled';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded' | 'partially_refunded';

export interface Role {
  id: string;
  code: string;
  name: string;
  description?: string | null;
}

export interface Permission {
  id: string;
  code: string;
  module: string;
  description?: string | null;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  role_id: string | null;
  is_active: boolean;
  created_at: string;
  role?: Role | null;
}

export interface Employee {
  id: string;
  profile_id: string;
  job_title: string | null;
  hire_date: string | null;
  salary: number | null;
  national_id: string | null;
  emergency_contact: string | null;
  notes: string | null;
  profile?: Profile;
}

export interface Category {
  id: string;
  name: string;
  name_ar: string | null;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface Ingredient {
  id: string;
  name: string;
  name_ar: string | null;
  unit: 'g' | 'ml' | 'pcs';
  cost_per_unit: number;
  low_stock_threshold: number;
  is_active: boolean;
  quantity?: number;
}

export interface MenuItem {
  id: string;
  category_id: string | null;
  sku: string | null;
  name: string;
  name_ar: string | null;
  description: string | null;
  price: number;
  image_url: string | null;
  prep_minutes: number;
  is_available: boolean;
  is_active: boolean;
  sort_order: number;
  category?: Category | null;
  cost?: MenuItemCost | null;
}

export interface MenuItemCost {
  menu_item_id: string;
  price: number;
  production_cost: number;
  profit: number;
  margin_pct: number;
}

export interface Recipe {
  id: string;
  menu_item_id: string;
  yield_qty: number;
  notes: string | null;
  recipe_items: RecipeItem[];
}

export interface RecipeItem {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
  ingredient?: Ingredient;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  line_total: number;
  notes: string | null;
}

export interface Order {
  id: string;
  order_number: number;
  client_operation_id: string;
  local_ref: string | null;
  order_type: OrderType;
  status: OrderStatus;
  payment_status: PaymentStatus;
  table_no: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  notes: string | null;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  service_charge_total: number;
  grand_total: number;
  inventory_deducted_at: string | null;
  needs_review: boolean;
  review_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  sync_status: 'synced' | 'pending' | 'failed';
  order_items?: OrderItem[];
  payments?: Payment[];
  invoices?: Invoice[];
  order_status_history?: StatusHistoryEntry[];
  creator?: { full_name: string } | null;
}

export interface StatusHistoryEntry {
  id: number;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  method: string;
  amount: number;
  status: 'succeeded' | 'failed' | 'refunded';
  external_ref: string | null;
  received_by: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  order_id: string;
  invoice_number: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  service_charge_total: number;
  grand_total: number;
  snapshot: Record<string, unknown>;
  issued_at: string;
}

export interface InventoryStock {
  ingredient_id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
  low_stock_threshold: number;
  quantity: number;
  stock_value: number;
  is_low: boolean;
}

export interface InventoryTransaction {
  id: string;
  ingredient_id: string;
  type: 'purchase' | 'consumption' | 'waste' | 'adjustment' | 'stocktake' | 'reversal';
  quantity: number;
  unit_cost: number | null;
  order_id: string | null;
  supplier_id: string | null;
  reference: string | null;
  reason: string | null;
  created_by: string;
  created_at: string;
  ingredient?: Ingredient;
  supplier?: Supplier | null;
}

export interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface Expense {
  id: string;
  category_id: string | null;
  amount: number;
  expense_date: string;
  description: string;
  receipt_path: string | null;
  is_void: boolean;
  void_reason: string | null;
  created_by: string;
  created_at: string;
  category?: { name: string } | null;
  creator?: { full_name: string } | null;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  is_active: boolean;
}

export interface PaymentMethod {
  id: string;
  code: string;
  name: string;
  requires_reference: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface OrderTypeSetting {
  order_type: OrderType;
  label: string;
  requires_table: boolean;
  requires_customer: boolean;
  requires_phone: boolean;
  requires_address: boolean;
  pay_before_kitchen: boolean;
  is_active: boolean;
}

export interface RestaurantSettings {
  id: number;
  branch_id: string | null;
  restaurant_name: string;
  legal_name: string | null;
  tax_registration: string | null;
  phone: string | null;
  address: string | null;
  currency: string;
  timezone: string;
  tax_percent: number;
  service_charge_percent: number;
  default_discount_percent: number;
  max_cashier_discount_percent: number;
  inventory_deduct_on: 'new' | 'preparing';
  allow_negative_stock: boolean;
  offline_card_payments: boolean;
  require_manager_for_waste: boolean;
  invoice_prefix: string;
  receipt_footer: string | null;
  ai_report_time: string;
  low_stock_alert: boolean;
}

export interface ActivityLog {
  id: number;
  actor_id: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  actor?: { full_name: string } | null;
}

export interface SyncOperation {
  operation_id: string;
  kind: string;
  status: 'processing' | 'succeeded' | 'failed';
  attempts: number;
  last_error: string | null;
  created_at: string;
  result: Record<string, unknown> | null;
}

export interface AiReport {
  id: string;
  report_date: string;
  summary_md: string | null;
  metrics_json: Record<string, unknown>;
  model: string | null;
  status: 'succeeded' | 'failed';
  error: string | null;
  generated_at: string | null;
}

export interface AiMessage {
  id: number;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface DailyKpi {
  day: string;
  orders_count: number;
  revenue: number;
  avg_order_value: number;
  cogs: number;
  gross_profit: number;
}

export interface ItemSale {
  menu_item_id: string;
  item_name: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
}

export interface EmployeePerformance {
  profile_id: string;
  full_name: string;
  orders_count: number;
  revenue: number;
  avg_order_value: number;
}

export interface CreateOrderInput {
  order_type: OrderType;
  table_no?: string;
  customer_name?: string;
  customer_phone?: string;
  delivery_address?: string;
  notes?: string;
  local_ref?: string;
  items: { menu_item_id: string; quantity: number; notes?: string }[];
  discount?: { type: 'percent' | 'amount'; value: number; reason?: string };
}

export interface OutboxItem {
  operation_id: string;
  kind: 'create_order' | 'pay_order' | 'set_order_status' | 'create_and_pay';
  payload: Record<string, unknown>;
  created_at: number;
  attempts: number;
  next_retry_at: number;
  status: 'pending' | 'processing' | 'failed' | 'done';
  last_error?: string;
  depends_on?: string;
  local_ref?: string;
}
