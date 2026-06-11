import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'
import { printOrder, type PrintOrderPayload } from '../lib/printBridge'

export type PaymentMethod = 'cash' | 'card' | 'promptpay'

export interface CashierItem {
  id: string
  name: string
  productCode: string
  quantity: number
  price: number
}

export interface CashierOrder {
  id: string
  orderCode: string
  status: string
  paymentStatus: string
  paymentMethod: string | null
  customerName: string | null
  customerPhone: string | null
  fulfillmentType: 'pickup' | 'dine_in'
  tableNumber: string | null
  total: number
  notes: string | null
  createdAt: string
  items: CashierItem[]
}

// Raw row shapes (DB types aren't generated, so we cast + map explicitly).
interface RawOrder {
  id: string
  order_code: string | null
  status: string
  payment_status: string
  payment_method: string | null
  customer_name: string | null
  customer_phone: string | null
  fulfillment_type: 'pickup' | 'dine_in'
  table_number: string | null
  total_amount: number | string | null
  notes: string | null
  created_at: string
}
interface RawNom {
  name: string | null
  product_code: string | null
}
interface RawItem {
  id: string
  quantity: number
  price_at_purchase: number | string | null
  nomenclature: RawNom | RawNom[] | null
}

function num(v: number | string | null | undefined): number {
  return v == null ? 0 : Number(v)
}

function mapItem(r: RawItem): CashierItem {
  const nom = Array.isArray(r.nomenclature) ? r.nomenclature[0] : r.nomenclature
  return {
    id: r.id,
    name: nom?.name ?? 'Unknown item',
    productCode: nom?.product_code ?? '',
    quantity: r.quantity,
    price: num(r.price_at_purchase),
  }
}

function mapOrder(o: RawOrder, items: RawItem[]): CashierOrder {
  return {
    id: o.id,
    orderCode: o.order_code ?? '—',
    status: o.status,
    paymentStatus: o.payment_status,
    paymentMethod: o.payment_method,
    customerName: o.customer_name,
    customerPhone: o.customer_phone,
    fulfillmentType: o.fulfillment_type,
    tableNumber: o.table_number,
    total: num(o.total_amount),
    notes: o.notes,
    createdAt: o.created_at,
    items: items.map(mapItem),
  }
}

function toPrintPayload(o: CashierOrder, paid: boolean): Omit<PrintOrderPayload, 'kind'> {
  return {
    orderCode: o.orderCode,
    items: o.items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
    total: o.total,
    customerName: o.customerName,
    notes: o.notes,
    fulfillmentType: o.fulfillmentType,
    tableNumber: o.tableNumber,
    paid,
  }
}

export interface UseCashier {
  order: CashierOrder | null
  isLoading: boolean
  isBusy: boolean
  error: string | null
  lookup: (code: string) => Promise<void>
  acceptPayment: (method: PaymentMethod) => Promise<void>
  markDelivered: () => Promise<void>
  reset: () => void
}

const ACTIVE_STATUSES = ['new', 'preparing', 'ready']

export function useCashier(): UseCashier {
  const [order, setOrder] = useState<CashierOrder | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lookup = useCallback(async (code: string) => {
    const trimmed = code.trim()
    setError(null)
    setOrder(null)
    if (!trimmed) return
    setIsLoading(true)
    try {
      const { data: o, error: oErr } = await supabase
        .from('orders')
        .select(
          'id, order_code, status, payment_status, payment_method, customer_name, customer_phone, fulfillment_type, table_number, total_amount, notes, created_at',
        )
        .eq('order_code', trimmed)
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (oErr) throw new Error(oErr.message)
      if (!o) {
        setError(`No active order with code "${trimmed}"`)
        return
      }
      const { data: items, error: iErr } = await supabase
        .from('order_items')
        .select('id, quantity, price_at_purchase, nomenclature:nomenclature_id (name, product_code)')
        .eq('order_id', (o as RawOrder).id)
      if (iErr) throw new Error(iErr.message)
      setOrder(mapOrder(o as RawOrder, (items ?? []) as unknown as RawItem[]))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const acceptPayment = useCallback(
    async (method: PaymentMethod) => {
      if (!order) return
      setIsBusy(true)
      setError(null)
      try {
        const { error: uErr } = await supabase
          .from('orders')
          .update({ payment_status: 'paid', payment_method: method, status: 'preparing' })
          .eq('id', order.id)
        if (uErr) throw new Error(uErr.message)

        // Print the kitchen/assembly ticket first, then the customer receipt.
        const base = toPrintPayload(order, true)
        await printOrder({ ...base, kind: 'assembly' })
        await printOrder({ ...base, kind: 'customer' })

        setOrder({ ...order, status: 'preparing', paymentStatus: 'paid', paymentMethod: method })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Payment/print failed')
      } finally {
        setIsBusy(false)
      }
    },
    [order],
  )

  const markDelivered = useCallback(async () => {
    if (!order) return
    setIsBusy(true)
    setError(null)
    try {
      const { error: uErr } = await supabase
        .from('orders')
        .update({ status: 'delivered' })
        .eq('id', order.id)
      if (uErr) throw new Error(uErr.message)
      setOrder({ ...order, status: 'delivered' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setIsBusy(false)
    }
  }, [order])

  const reset = useCallback(() => {
    setOrder(null)
    setError(null)
  }, [])

  return { order, isLoading, isBusy, error, lookup, acceptPayment, markDelivered, reset }
}
