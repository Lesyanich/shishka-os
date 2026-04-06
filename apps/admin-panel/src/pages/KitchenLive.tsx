import { useEffect, useState, useCallback } from 'react'
import { Monitor, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface LiveTask {
  id: string
  status: string
  scheduled_start: string | null
  duration_min: number | null
  actual_start: string | null
  assigned_to: string | null
  staff_name: string | null
  product_name: string | null
  equipment_name: string | null
}

export function KitchenLive() {
  const [tasks, setTasks] = useState<LiveTask[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchTasks = useCallback(async () => {
    setIsLoading(true)
    const today = new Date().toISOString().split('T')[0]

    const { data } = await supabase
      .from('production_tasks')
      .select('id, status, scheduled_start, duration_min, actual_start, assigned_to, nomenclature!target_nomenclature_id(name), equipment:equipment_id(name), staff:assigned_to(name)')
      .in('status', ['pending', 'in_progress'])
      .gte('scheduled_start', today + 'T00:00:00')
      .order('scheduled_start', { ascending: true })

    const mapped: LiveTask[] = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      status: row.status as string,
      scheduled_start: row.scheduled_start as string | null,
      duration_min: row.duration_min as number | null,
      actual_start: row.actual_start as string | null,
      assigned_to: row.assigned_to as string | null,
      staff_name: (row.staff as { name: string } | null)?.name ?? null,
      product_name: (row.nomenclature as { name: string } | null)?.name ?? null,
      equipment_name: (row.equipment as { name: string } | null)?.name ?? null,
    }))

    setTasks(mapped)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchTasks()
    const channel = supabase
      .channel('kitchen-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_tasks' }, () => fetchTasks())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchTasks])

  function getElapsed(actualStart: string | null): string {
    if (!actualStart) return ''
    const sec = Math.floor((Date.now() - new Date(actualStart).getTime()) / 1000)
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  function getStatus(task: LiveTask): 'on_track' | 'slow' | 'overdue' {
    if (task.status !== 'in_progress' || !task.actual_start || !task.duration_min) return 'on_track'
    const elapsed = (Date.now() - new Date(task.actual_start).getTime()) / 60_000
    if (elapsed > task.duration_min) return 'overdue'
    if (elapsed > task.duration_min * 0.8) return 'slow'
    return 'on_track'
  }

  const statusColors = {
    on_track: 'border-emerald-500/30 bg-emerald-500/5',
    slow: 'border-amber-500/30 bg-amber-500/5',
    overdue: 'border-rose-500/30 bg-rose-500/5',
  }

  const statusDot = {
    on_track: 'bg-emerald-400',
    slow: 'bg-amber-400',
    overdue: 'bg-rose-400 animate-pulse',
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <Monitor className="h-5 w-5 text-sky-400" />
          <h1 className="flex-1 text-lg font-bold">Kitchen Live</h1>
          <button type="button" onClick={fetchTasks} disabled={isLoading} className="rounded-xl bg-slate-800 p-2.5">
            <RefreshCw className={`h-4 w-4 text-slate-400 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-4">
        {isLoading && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-800/50" />
            ))}
          </div>
        )}

        {!isLoading && tasks.length === 0 && (
          <div className="py-20 text-center">
            <Monitor className="mx-auto mb-3 h-10 w-10 text-slate-700" />
            <p className="text-sm text-slate-500">No active tasks right now</p>
          </div>
        )}

        {!isLoading && tasks.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.map(task => {
              const s = getStatus(task)
              return (
                <div key={task.id} className={`rounded-2xl border p-4 ${statusColors[s]}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="truncate text-sm font-semibold text-slate-100">
                      {task.product_name ?? 'Task'}
                    </span>
                    <div className={`h-2.5 w-2.5 rounded-full ${statusDot[s]}`} />
                  </div>
                  {task.staff_name && (
                    <p className="text-xs text-slate-400">Cook: <span className="text-slate-200">{task.staff_name}</span></p>
                  )}
                  {task.equipment_name && (
                    <p className="text-xs text-slate-400">Equipment: <span className="text-slate-200">{task.equipment_name}</span></p>
                  )}
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className={task.status === 'in_progress' ? 'text-sky-300' : 'text-amber-300'}>
                      {task.status === 'in_progress' ? 'In Progress' : 'Pending'}
                    </span>
                    {task.status === 'in_progress' && (
                      <span className="font-mono text-slate-300">{getElapsed(task.actual_start)}</span>
                    )}
                    {task.status === 'pending' && task.scheduled_start && (
                      <span className="text-slate-500">
                        {new Date(task.scheduled_start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
