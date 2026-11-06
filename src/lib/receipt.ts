import type { Order, RestaurantSettings } from '@/types';
import { dateTime, money, orderTypeLabel } from './utils';

function esc(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

/** Opens a print-ready receipt in a new window (works on Hostinger / any browser). */
export function printReceipt(order: Order, settings: RestaurantSettings | null) {
  const currency = settings?.currency ?? 'EGP';
  const items = order.order_items ?? [];
  const invoice = order.invoices?.[0];
  const payment = (order.payments ?? []).find((p) => p.status === 'succeeded');
  const addressLines = [settings?.address, settings?.phone, settings?.tax_registration ? `Tax Reg: ${settings.tax_registration}` : null]
    .filter(Boolean)
    .map((line) => `<div>${esc(line)}</div>`)
    .join('');

  const rows = items
    .map(
      (item) => `<tr>
        <td>${esc(item.item_name)}${item.notes ? `<div class="note">${esc(item.notes)}</div>` : ''}</td>
        <td class="c">${item.quantity}</td>
        <td class="r">${money(item.unit_price, currency)}</td>
        <td class="r">${money(item.line_total, currency)}</td>
      </tr>`,
    )
    .join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(order.order_number)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#111;width:80mm;margin:0 auto;padding:8px}
    h1{font-size:16px;text-align:center;margin:0 0 2px} .muted{color:#555;text-align:center;font-size:10px;line-height:1.5}
    .sep{border-top:1px dashed #999;margin:8px 0}
    table{width:100%;border-collapse:collapse} th{font-size:10px;text-align:left;border-bottom:1px dashed #999;padding:3px 0}
    td{padding:3px 0;vertical-align:top} .r{text-align:right} .c{text-align:center}
    .totals{display:flex;justify-content:space-between;padding:1px 0} .grand{font-weight:700;font-size:14px;border-top:1px solid #111;margin-top:4px;padding-top:4px}
    .note{font-size:10px;color:#666} .footer{text-align:center;margin-top:8px;font-size:10px;color:#555}
    @media print{body{width:auto;margin:0}}
  </style></head><body>
    <h1>${esc(settings?.restaurant_name ?? 'Restaurant')}</h1>
    <div class="muted">${addressLines}</div>
    <div class="sep"></div>
    <div class="muted" style="text-align:left">
      <div>Invoice: <b>${esc(invoice?.invoice_number ?? `#${order.order_number}`)}</b></div>
      <div>Order: #${esc(order.order_number)} &nbsp; ${esc(orderTypeLabel[order.order_type] ?? order.order_type)}</div>
      ${order.table_no ? `<div>Table: ${esc(order.table_no)}</div>` : ''}
      ${order.customer_name ? `<div>Customer: ${esc(order.customer_name)}</div>` : ''}
      <div>${esc(dateTime(order.created_at))}</div>
    </div>
    <div class="sep"></div>
    <table><thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Price</th><th class="r">Total</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="sep"></div>
    <div class="totals"><span>Subtotal</span><span>${money(order.subtotal, currency)}</span></div>
    ${Number(order.discount_total) ? `<div class="totals"><span>Discount</span><span>-${money(order.discount_total, currency)}</span></div>` : ''}
    <div class="totals"><span>Tax (${settings?.tax_percent ?? 0}%)</span><span>${money(order.tax_total, currency)}</span></div>
    <div class="totals"><span>Service (${settings?.service_charge_percent ?? 0}%)</span><span>${money(order.service_charge_total, currency)}</span></div>
    <div class="totals grand"><span>Total</span><span>${money(order.grand_total, currency)}</span></div>
    <div class="sep"></div>
    <div class="totals"><span>Payment</span><span>${esc(payment?.method ?? order.payment_status)}</span></div>
    ${payment?.external_ref ? `<div class="totals"><span>Ref</span><span>${esc(payment.external_ref)}</span></div>` : ''}
    <div class="footer">${esc(settings?.receipt_footer ?? 'Thank you!')}</div>
    <script>window.onload=function(){window.print();}</script>
  </body></html>`;

  const win = window.open('', '_blank', 'width=420,height=700');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
