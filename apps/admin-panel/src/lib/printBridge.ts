// Client for the LAN print-bridge (services/print-bridge) that forwards ESC/POS
// to the Xprinter XP-Q90EC. In production the bridge runs on the cashier tablet,
// reachable at http://localhost:7777 (localhost is a secure context, so an HTTPS
// admin page may call it without a mixed-content block). Override via env.
const BRIDGE_URL =
  (import.meta.env.VITE_PRINT_BRIDGE_URL as string | undefined) ?? 'http://localhost:7777'

export interface PrintLineItem {
  name: string
  quantity: number
  price: number
}

export interface PrintOrderPayload {
  orderCode: string
  items: PrintLineItem[]
  total: number
  customerName?: string | null
  notes?: string | null
  fulfillmentType?: 'pickup' | 'dine_in'
  tableNumber?: string | null
  /** 'assembly' = kitchen ticket, 'customer' = receipt. */
  kind?: 'customer' | 'assembly'
  paid?: boolean
}

export async function printOrder(payload: PrintOrderPayload): Promise<void> {
  const res = await fetch(`${BRIDGE_URL}/print`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Print bridge responded ${res.status}`)
  const data = (await res.json()) as { ok?: boolean; error?: string }
  if (!data.ok) throw new Error(data.error ?? 'print failed')
}
