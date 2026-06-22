import { useState } from 'react'
import { Bell, BellRing, Printer } from 'lucide-react'
import { LiveOrderBoard } from '../components/orders/LiveOrderBoard'
import { ToastProvider } from '../components/ui/Toast'
import { useNewOrderAlerts, AUTO_PRINT_KEY } from '../hooks/useNewOrderAlerts'
import { unlockAudio } from '../lib/sound'

function notifPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
}

function OrderManagerInner() {
  useNewOrderAlerts()

  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>(notifPermission)
  const [autoPrint, setAutoPrint] = useState<boolean>(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(AUTO_PRINT_KEY) === '1',
  )

  const requestNotif = async () => {
    if (typeof Notification === 'undefined') return
    const p = await Notification.requestPermission()
    setNotifPerm(p)
  }

  const toggleAutoPrint = () => {
    setAutoPrint((v) => {
      const next = !v
      localStorage.setItem(AUTO_PRINT_KEY, next ? '1' : '0')
      return next
    })
  }

  return (
    // First click anywhere unlocks the audio context (browsers require a gesture).
    <div className="mx-auto max-w-6xl space-y-6" onClickCapture={unlockAudio}>
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Orders</h1>
          <p className="text-xs text-slate-500">
            Live order pipeline — manual, website &amp; POS orders flow through here
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleAutoPrint}
            title="Auto-print the kitchen ticket when a new website order arrives"
            className={[
              'inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition',
              autoPrint
                ? 'border-violet-500/60 bg-violet-500/15 text-violet-200'
                : 'border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200',
            ].join(' ')}
          >
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Auto-print {autoPrint ? 'On' : 'Off'}
          </button>
          {notifPerm === 'granted' ? (
            <span
              className="inline-flex h-8 items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-300"
              title="Browser notifications enabled"
            >
              <BellRing className="mr-1.5 h-3.5 w-3.5" />
              Alerts on
            </span>
          ) : notifPerm === 'unsupported' ? null : (
            <button
              type="button"
              onClick={requestNotif}
              className="inline-flex h-8 items-center rounded-md border border-slate-700 px-3 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100"
            >
              <Bell className="mr-1.5 h-3.5 w-3.5" />
              Enable alerts
            </button>
          )}
        </div>
      </div>

      {/* Live Kanban Board */}
      <LiveOrderBoard />
    </div>
  )
}

export function OrderManager() {
  return (
    <ToastProvider>
      <OrderManagerInner />
    </ToastProvider>
  )
}
