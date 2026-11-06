import { supabase, errorMessage } from '@/lib/supabase';
import { newOperationId, runWithOfflineSupport } from '@/offline/outbox-helpers';
import type { CreateOrderInput, Order, OrderStatus, PaymentMethod } from '@/types';

export interface OrderFilters {
  search?: string;
  status?: string;
  payment_status?: string;
  order_type?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function listOrders(filters: OrderFilters = {}) {
  let query = supabase
    .from('orders')
    .select('*, creator:profiles(full_name)', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.payment_status && filters.payment_status !== 'all')
    query = query.eq('payment_status', filters.payment_status);
  if (filters.order_type && filters.order_type !== 'all') query = query.eq('order_type', filters.order_type);
  if (filters.from) query = query.gte('created_at', `${filters.from}T00:00:00`);
  if (filters.to) query = query.lte('created_at', `${filters.to}T23:59:59`);
  if (filters.search?.trim()) {
    const term = filters.search.trim();
    const numeric = Number(term);
    if (Number.isFinite(numeric) && numeric > 0) {
      query = query.or(
        `order_number.eq.${numeric},customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%,table_no.ilike.%${term}%`,
      );
    } else {
      query = query.or(
        `customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%,table_no.ilike.%${term}%`,
      );
    }
  }

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { orders: (data ?? []) as Order[], count: count ?? 0 };
}

export async function getOrder(id: string) {
  const { data, error } = await supabase
    .from('orders')
    .select(
      '*, creator:profiles(full_name), order_items(*), payments(*), invoices(*), order_status_history(*)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const order = data as Order;
  order.order_status_history = (order.order_status_history ?? []).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return order;
}

export async function getOpenOrders() {
  const { data, error } = await supabase
    .from('v_open_orders')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Order[];
}

interface SubmitResult {
  queued: boolean;
  orderId?: string;
  orderNumber?: number;
  grandTotal?: number;
}

function assertReference(method: PaymentMethod | undefined, reference?: string) {
  if (method?.requires_reference && !reference?.trim()) {
    throw new Error('REFERENCE_REQUIRED');
  }
}

/** Send to kitchen: create the order and move it to `new`. */
export async function sendOrderToKitchen(
  input: CreateOrderInput,
  localRefValue?: string,
): Promise<SubmitResult> {
  const operationId = newOperationId();
  const payload = { ...input, local_ref: localRefValue };

  const result = await runWithOfflineSupport<Record<string, unknown>>({
    operationId,
    kind: 'create_order',
    payload: { ...payload, __send_to_kitchen: true },
    localRef: localRefValue,
    online: async () => {
      const { data, error } = await supabase.rpc('create_order', {
        p_operation_id: operationId,
        p_payload: payload,
      });
      if (error) throw error;
      const created = data as Record<string, unknown>;
      const { error: statusError } = await supabase.rpc('set_order_status', {
        p_order_id: created.order_id,
        p_new_status: 'new',
        p_reason: 'Sent to kitchen',
        p_waste: false,
      });
      if (statusError) throw statusError;
      return created;
    },
  });

  if (result.queued) return { queued: true };
  const data = result.data!;
  return {
    queued: false,
    orderId: data.order_id as string,
    orderNumber: Number(data.order_number),
    grandTotal: Number(data.grand_total),
  };
}

/** Take payment at the counter, then send the paid ticket to the kitchen. */
export async function payAndSendToKitchen(
  input: CreateOrderInput,
  method: PaymentMethod,
  reference?: string,
): Promise<SubmitResult> {
  assertReference(method, reference);
  const operationId = newOperationId();

  const result = await runWithOfflineSupport<Record<string, unknown>>({
    operationId,
    kind: 'create_and_pay',
    payload: {
      order: input,
      payment: { method: method.code, external_ref: reference ?? null },
      complete: false,
      send_to_kitchen: true,
    },
    online: async () => {
      const { data: created, error: createError } = await supabase.rpc('create_order', {
        p_operation_id: operationId,
        p_payload: input,
      });
      if (createError) throw createError;
      const order = created as Record<string, unknown>;

      const { error: payError } = await supabase.rpc('pay_order', {
        p_operation_id: `${operationId}-pay`,
        p_order_id: order.order_id,
        p_method: method.code,
        p_amount: order.grand_total,
        p_external_ref: reference ?? null,
      });
      if (payError) throw payError;

      const { error: kitchenError } = await supabase.rpc('set_order_status', {
        p_order_id: order.order_id,
        p_new_status: 'new',
        p_reason: 'Paid at POS',
        p_waste: false,
      });
      if (kitchenError) throw kitchenError;

      return order;
    },
  });

  if (result.queued) return { queued: true };
  const data = result.data!;
  return {
    queued: false,
    orderId: data.order_id as string,
    orderNumber: Number(data.order_number),
    grandTotal: Number(data.grand_total),
  };
}

export async function recordPayment(
  orderId: string,
  method: PaymentMethod,
  amount: number,
  reference?: string,
) {
  assertReference(method, reference);
  const operationId = newOperationId();
  const result = await runWithOfflineSupport<Record<string, unknown>>({
    operationId,
    kind: 'pay_order',
    payload: { order_id: orderId, method: method.code, amount, external_ref: reference ?? null },
    online: async () => {
      const { data, error } = await supabase.rpc('pay_order', {
        p_operation_id: operationId,
        p_order_id: orderId,
        p_method: method.code,
        p_amount: amount,
        p_external_ref: reference ?? null,
      });
      if (error) throw error;
      return data as Record<string, unknown>;
    },
  });
  return result;
}

export async function setOrderStatus(
  orderId: string,
  status: OrderStatus,
  reason?: string,
  waste = false,
) {
  const { data, error } = await supabase.rpc('set_order_status', {
    p_order_id: orderId,
    p_new_status: status,
    p_reason: reason ?? null,
    p_waste: waste,
  });
  if (error) throw new Error(errorMessage(error));
  return data as Order;
}

export async function refundOrder(orderId: string, reason: string) {
  const { error } = await supabase.rpc('refund_order', { p_order_id: orderId, p_reason: reason });
  if (error) throw new Error(errorMessage(error));
}

export async function orderStats() {
  const [open, today] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).in('status', ['new', 'preparing', 'ready']),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
  ]);
  return { open: open.count ?? 0, completedToday: today.count ?? 0 };
}
