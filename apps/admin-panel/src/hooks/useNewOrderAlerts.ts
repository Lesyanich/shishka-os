import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'
import { playNewOrderChime } from '../lib/sound'
import { printOrderById } from '../lib/orderReceipt'

/**
 * Alerts staff to a new customer order (website / own app) in real time:
 * a persistent toast, a chime, an optional browser notification, and (if the
 * per-device toggle is on) auto-printing the kitchen ticket.
 *
 * Subscribes to a dedicated INSERT-only channel (separate from LiveOrderBoard's
 * data-refetch channel) so it never double-fires on status UPDATEs. Manual and
 * Loyverse/POS inserts are ignored — only website/own_* channels alert.
 */

export const AUTO_PRINT_KEY = 'orders.autoPrintAssembly'

interface NewOrderRow {
  id: string
  order_code: string | null
  source: string | null
  channel: string | null
  customer_name: string | null
  total_amount: number | string | null
  status: string
}

function isCustomerOrder(o: NewOrderRow): boolean {
  if (o.source === 'website') return true
  if (o.channel && o.channel.startsWith('own_')) return true
  return false
}

export function useNewOrderAlerts(): void {
  const toast = useToast()
  // Keep a ref so the subscription closure always sees the latest toast api
  // without re-subscribing on every render.
  const toastRef = useRef(toast)
  useEffect(() => {
    toastRef.current = toast
  }, [toast])

  useEffect(() => {
    const channel = supabase
      .channel('orders-new-alerts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: 'status=eq.new' },
        (payload) => {
          const o = payload.new as NewOrderRow
          if (!isCustomerOrder(o)) return

          const total = Number(o.total_amount ?? 0)
          const code = o.order_code ?? o.id.slice(0, 8)
          const detail = `${o.customer_name || 'Walk-in'} · ${total.toFixed(0)} THB`

          try {
            playNewOrderChime()
          } catch {
            // best-effort: audio may be locked until a user gesture
          }

          toastRef.current.push({
            title: `🔔 New order #${code}`,
            body: detail,
            variant: 'info',
            durationMs: null,
          })

          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              new Notification(`New order #${code}`, { body: detail, tag: `order-${o.id}` })
            } catch {
              // ignore — notification is best-effort
            }
          }

          if (typeof localStorage !== 'undefined' && localStorage.getItem(AUTO_PRINT_KEY) === '1') {
            printOrderById(o.id, 'assembly').catch((e) => {
              toastRef.current.push({
                title: 'Auto-print failed',
                body: e instanceof Error ? e.message : 'Printer unreachable',
                variant: 'error',
                durationMs: 8000,
              })
            })
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])
}
