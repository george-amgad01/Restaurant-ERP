import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const isConfigured =
  Boolean(url && anonKey) &&
  !url.includes('YOUR_PROJECT_REF') &&
  !anonKey.includes('YOUR_ANON_KEY');

export const supabase = createClient(
  isConfigured ? url : 'http://localhost:54321',
  isConfigured ? anonKey : 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: { params: { eventsPerSecond: 10 } },
  },
);

/** Translate Postgres/RPC errors into short, safe messages for the UI. */
export function errorMessage(err: unknown): string {
  const raw =
    typeof err === 'string'
      ? err
      : (err as { message?: string; error_description?: string; details?: string })?.message ??
        (err as { error_description?: string })?.error_description ??
        'Something went wrong';

  const map: Record<string, string> = {
    FORBIDDEN: 'You do not have permission to do this.',
    ORDER_NOT_FOUND: 'Order not found.',
    ORDER_NOT_PAID: 'The order must be paid before completing it.',
    ORDER_CANCELLED: 'This order has been cancelled.',
    ALREADY_PAID: 'This order is already fully paid.',
    OVERPAYMENT: 'Amount exceeds the remaining balance.',
    INVALID_TRANSITION: 'That status change is not allowed.',
    REASON_REQUIRED: 'A reason is required.',
    REFERENCE_REQUIRED: 'A terminal / gateway reference is required.',
    INVALID_PAYMENT_METHOD: 'Choose a valid payment method.',
    INVALID_AMOUNT: 'Enter a valid amount.',
    MENU_ITEM_UNAVAILABLE: raw,
    MENU_ITEM_NOT_FOUND: raw,
    DISCOUNT_LIMIT_EXCEEDED: 'Discount exceeds your limit. Ask a manager.',
    INSUFFICIENT_STOCK: 'Not enough stock and negative stock is disabled.',
    EMPTY_ORDER: 'Add at least one item to the order.',
    TABLE_REQUIRED: 'Table number is required for dine-in.',
    CUSTOMER_NAME_REQUIRED: 'Customer name is required.',
    CUSTOMER_PHONE_REQUIRED: 'Customer phone is required.',
    DELIVERY_ADDRESS_REQUIRED: 'Delivery address is required.',
    INVALID_ORDER_TYPE: 'Choose a valid order type.',
    INVALID_QUANTITY: 'Quantity must be a whole number greater than zero.',
    RATE_LIMITED: 'Too many attempts. Please wait and try again.',
    INVALID_DISCOUNT: 'That discount is not valid for this order.',
    SETTINGS_MISSING: 'Restaurant settings are missing. Run the database seed.',
    OPERATION_ID_REQUIRED: 'The operation could not be identified. Please retry.',
    ROLE_NOT_FOUND: 'That role no longer exists.',
    PROFILE_NOT_FOUND: 'User profile not found.',
    NOTHING_TO_REFUND: 'There is no settled payment to refund.',
    EMPTY_PURCHASE: 'Add at least one purchase line.',
    EMPTY_STOCKTAKE: 'Enter at least one counted quantity.',
    INVALID_TRANSACTION_TYPE: 'That inventory movement type is not supported.',
  };

  for (const [code, message] of Object.entries(map)) {
    if (raw.includes(code)) return message;
  }
  if (/failed to fetch|networkerror|network request failed/i.test(raw)) {
    return 'Network unavailable. The action was queued for sync where supported.';
  }
  return raw;
}
