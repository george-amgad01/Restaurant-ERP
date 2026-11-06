import { supabase } from '@/lib/supabase';
import type { OutboxItem } from '@/types';

/**
 * Replays one outbox item against the idempotent RPCs.
 * Permanent business errors are distinguished from network errors by the caller.
 */
export async function executeOutboxItem(item: OutboxItem): Promise<Record<string, unknown> | null> {
  switch (item.kind) {
    case 'create_order': {
      const sendToKitchen = Boolean(item.payload.__send_to_kitchen);
      const payload = { ...item.payload };
      delete payload.__send_to_kitchen;

      const { data, error } = await supabase.rpc('create_order', {
        p_operation_id: item.operation_id,
        p_payload: payload,
      });
      if (error) throw error;
      const created = data as Record<string, unknown>;

      if (sendToKitchen) {
        const { error: statusError } = await supabase.rpc('set_order_status', {
          p_order_id: created.order_id,
          p_new_status: 'new',
          p_reason: 'Sent to kitchen (offline replay)',
          p_waste: false,
        });
        if (statusError) throw statusError;
      }
      return created;
    }
    case 'pay_order': {
      const { data, error } = await supabase.rpc('pay_order', {
        p_operation_id: item.operation_id,
        p_order_id: item.payload.order_id,
        p_method: item.payload.method,
        p_amount: item.payload.amount,
        p_external_ref: item.payload.external_ref ?? null,
      });
      if (error) throw error;
      return data as Record<string, unknown>;
    }
    case 'set_order_status': {
      const { data, error } = await supabase.rpc('set_order_status', {
        p_order_id: item.payload.order_id,
        p_new_status: item.payload.status,
        p_reason: item.payload.reason ?? null,
        p_waste: item.payload.waste ?? false,
      });
      if (error) throw error;
      return data as Record<string, unknown>;
    }
    case 'create_and_pay': {
      const p = item.payload as Record<string, unknown>;
      const orderPayload = p.order as Record<string, unknown>;
      const payment = p.payment as Record<string, unknown>;
      const complete = Boolean(p.complete);
      const sendToKitchen = Boolean(p.send_to_kitchen);

      const { data: created, error: createError } = await supabase.rpc('create_order', {
        p_operation_id: `${item.operation_id}`,
        p_payload: orderPayload,
      });
      if (createError) throw createError;

      const createdData = created as Record<string, unknown>;
      const orderId = createdData.order_id as string;

      const { error: payError } = await supabase.rpc('pay_order', {
        p_operation_id: `${item.operation_id}-pay`,
        p_order_id: orderId,
        p_method: payment.method,
        p_amount: payment.amount ?? createdData.grand_total,
        p_external_ref: payment.external_ref ?? null,
      });
      if (payError) throw payError;

      if (sendToKitchen) {
        const { error: kitchenError } = await supabase.rpc('set_order_status', {
          p_order_id: orderId,
          p_new_status: 'new',
          p_reason: 'Paid at POS',
          p_waste: false,
        });
        if (kitchenError) throw kitchenError;
      }

      if (complete) {
        const { error: completeError } = await supabase.rpc('set_order_status', {
          p_order_id: orderId,
          p_new_status: 'completed',
          p_reason: 'Offline quick sale',
          p_waste: false,
        });
        // A completed order needs to be paid; if the transition is rejected the
        // order still exists and is paid, which is safe. Surface it as failed.
        if (completeError) throw completeError;
      }
      return createdData;
    }
    default:
      throw new Error(`Unsupported operation: ${item.kind}`);
  }
}

const PERMANENT_ERRORS = [
  'FORBIDDEN',
  'INVALID_TRANSITION',
  'ORDER_NOT_FOUND',
  'ORDER_NOT_PAID',
  'ALREADY_PAID',
  'OVERPAYMENT',
  'INVALID_PAYMENT_METHOD',
  'REASON_REQUIRED',
  'REFERENCE_REQUIRED',
  'MENU_ITEM_NOT_FOUND',
  'MENU_ITEM_UNAVAILABLE',
  'DISCOUNT_LIMIT_EXCEEDED',
  'INSUFFICIENT_STOCK',
  'EMPTY_ORDER',
  'INVALID_',
  'TABLE_REQUIRED',
  'CUSTOMER_',
  'DELIVERY_ADDRESS_REQUIRED',
];

export function isPermanentError(err: unknown): boolean {
  const message = String((err as { message?: string })?.message ?? err ?? '');
  return PERMANENT_ERRORS.some((code) => message.includes(code));
}
