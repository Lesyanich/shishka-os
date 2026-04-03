import { useState } from 'react'
import { ChefHat, RefreshCw } from 'lucide-react'
import { useKitchenDashboard } from '../hooks/useKitchenDashboard'
import { ActiveShifts } from '../components/kitchen-dashboard/ActiveShifts'
import { ActiveTasks } from '../components/kitchen-dashboard/ActiveTasks'
import { EquipmentTimeline } from '../components/kitchen-dashboard/EquipmentTimeline'
import { UpcomingTasks } from '../components/kitchen-dashboard/UpcomingTasks'

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function KitchenDashboard() {
  const today = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(today)

  const { shifts, tasks, equipmentSlots, isLoading, error, refetch } =
    useKitchenDashboard(selectedDate)

  const isToday = selectedDate === today

  function shiftDate(days: number) {
    const d = new Date(selectedDate + 'T00:00:00')
    d.setDate(d.getDate() + days)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10">
            <ChefHat className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Kitchen</h1>
          </div>
          <button
            type="button"
            onClick={refetch}
            disabled={isLoading}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 active:bg-slate-700 disabled:opacity-50"
            style={{ touchAction: 'manipulation' }}
          >
            <RefreshCw className={`h-4 w-4 text-slate-400 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-4 pb-20">
        {/* Date navigator */}
        <div className="flex items-center justify-between rounded-xl bg-slate-900/50 px-3 py-2">
          <button
            type="button"
            onClick={() => shiftDate(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-base text-slate-300 active:bg-slate-700"
            style={{ touchAction: 'manipulation' }}
          >
            &larr;
          </button>
          <div className="text-center">
            <p className="text-base font-medium">
              {formatDateLabel(selectedDate)}
            </p>
            {!isToday && (
              <button
                type="button"
                onClick={() => setSelectedDate(today)}
                className="text-sm text-emerald-400 active:text-emerald-300"
              >
                Today
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => shiftDate(1)}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-base text-slate-300 active:bg-slate-700"
            style={{ touchAction: 'manipulation' }}
          >
            &rarr;
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-center text-base text-rose-300">
            {error}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-800/50" />
            ))}
          </div>
        )}

        {/* Content */}
        {!isLoading && (
          <>
            <ActiveShifts shifts={shifts} />
            <ActiveTasks tasks={tasks} onRefetch={refetch} />
            <EquipmentTimeline slots={equipmentSlots} />
            <UpcomingTasks tasks={tasks} />
          </>
        )}
      </main>
    </div>
  )
}
