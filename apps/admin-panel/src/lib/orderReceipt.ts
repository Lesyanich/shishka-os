// Build + send order receipts (customer receipt and kitchen/assembly ticket)
// through the LAN print-bridge. Single source of truth for turning an order into
// a PrintOrderPayload, used by both the manual print buttons (OrderDetailsModal,
// which already has items loaded) and the auto-print path (useNewOrderAlerts,
// which fetches by id). Mirrors the proven wiring in hooks/useCashier.ts.

import { supabase } from './supabase'
import { printOrder, type PrintOrderPayload } from './printBridge'

export interface ReceiptOrderInfo {
  orderCode: string
  total: number
  customerName?: string | null
  notes?: string | null
  fulfillmentType?: 'pickup' | 'dine_in'
  tableNumber?: string | null
  /** Order payment_status; drives the PAID/UNPAID stamp on the ticket. */
  paymentStatus?: string | null
}

export interface ReceiptLine {
  name: string
  quantity: number
  price: number
}

/** Pure builder — turns an order + its lines into a print-bridge payload. */
export function toReceiptPayload(
  o: ReceiptOrderInfo,
  lines: ReceiptLine[],
  kind: 'customer' | 'assembly',
): PrintOrderPayload {
  return {
    orderCode: o.orderCode,
    items: lines.map((l) => ({ name: l.name, quantity: l.quantity, price: l.price })),
    total: o.total,
    customerName: o.customerName ?? null,
    notes: o.notes ?? null,
    fulfillmentType: o.fulfillmentType,
    tableNumber: o.tableNumber ?? null,
    kind,
    paid: o.paymentStatus === 'paid',
  }
}

interface RawNom {
  name: string | null
  customer_short_name: string | null
}
interface RawItem {
  quantity: number
  price_at_purchase: number | string | null
  nomenclature: RawNom | RawNom[] | null
}

/** Load an order + its lines, resolving clean (customer_short_name) item names. */
export async function loadOrderForPrint(
  orderId: string,
): Promise<{ info: ReceiptOrderInfo; lines: ReceiptLine[] }> {
  const { data: o, error } = await supabase
    .from('orders')
    .select(
      'order_code, total_amount, customer_name, notes, fulfillment_type, table_number, payment_status',
    )
    .eq('id', orderId)
    .single()
  if (error || !o) throw new Error(error?.message ?? 'order_not_found')

  const { data: rawItems } = await supabase
    .from('order_items')
    .select(
      'quantity, price_at_purchase, nomenclature:nomenclature_id (name, customer_short_name)',
    )
    .eq('order_id', orderId)

  const lines: ReceiptLine[] = ((rawItems ?? []) as unknown as RawItem[]).map((r) => {
    const nom = Array.isArray(r.nomenclature) ? r.nomenclature[0] : r.nomenclature
    return {
      name: nom?.customer_short_name ?? nom?.name ?? 'Item',
      quantity: Number(r.quantity),
      price: r.price_at_purchase == null ? 0 : Number(r.price_at_purchase),
    }
  })

  const row = o as Record<string, unknown>
  return {
    info: {
      orderCode: (row.order_code as string) ?? orderId.slice(0, 8),
      total: row.total_amount == null ? 0 : Number(row.total_amount),
      customerName: (row.customer_name as string) ?? null,
      notes: (row.notes as string) ?? null,
      fulfillmentType: (row.fulfillment_type as 'pickup' | 'dine_in') ?? undefined,
      tableNumber: (row.table_number as string) ?? null,
      paymentStatus: (row.payment_status as string) ?? null,
    },
    lines,
  }
}

/** Convenience: fetch an order by id and print one ticket kind. */
export async function printOrderById(
  orderId: string,
  kind: 'customer' | 'assembly',
): Promise<void> {
  const { info, lines } = await loadOrderForPrint(orderId)
  await printOrder(toReceiptPayload(info, lines, kind))
}
