import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { LayoutDashboard, RefreshCw, ChefHat, Clock, AlertTriangle, CheckCircle2, MessageCircle, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { KitchenNav } from '../components/KitchenNav'

interface TaskSummary {
  total: number
  pending: number
  in_progress: number
  completed: number
}

interface StaffOnDuty {
  id: string
  name: string
  activeTaskCount: number
}

interface Alert {
  type: 'overdue' | 'deviation' | 'idle'
  message: string
  taskId?: string
}

interface FeedbackItem {
  id: string
  staff_name: string | null
  type: string
  raw_text: string
  is_processed: boolean
  created_at: string
}

export function Dashboard() {
  const [summary, setSummary] = useState<TaskSummary>({ total: 0, pending: 0, in_progress: 0, completed: 0 })
  const [staff, setStaff] = useState<StaffOnDuty[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Fetch today's production tasks
      const { data: tasks, error: taskErr } = await supabase
        .from('production_tasks')
        .select('id, status, scheduled_start, actual_start, actual_end, actual_weight, theoretical_yield, assigned_to, duration_min')
        .gte('scheduled_start', today + 'T00:00:00')
        .lt('scheduled_start', today + 'T23:59:59')

      if (taskErr) throw taskErr

      const allTasks = tasks ?? []
      const pending = allTasks.filter(t => t.status === 'pending').length
      const inProgress = allTasks.filter(t => t.status === 'in_progress').length
      const completed = allTasks.filter(t => t.status === 'completed').length

      setSummary({
        total: allTasks.length,
        pending,
        in_progress: inProgress,
        completed,
      })

      // Build alerts
      const newAlerts: Alert[] = []
      const now = Date.now()
      for (const t of allTasks) {
        // Overdue: in_progress and past scheduled_start + duration_min
        if (t.status === 'in_progress' && t.scheduled_start && t.duration_min) {
          const deadline = new Date(t.scheduled_start).getTime() + t.duration_min * 60_000
          if (now > deadline) {
            newAlerts.push({ type: 'overdue', message: `Task overdue by ${Math.round((now - deadline) / 60_000)} min`, taskId: t.id })
          }
        }
        // Weight deviation > 10%
        if (t.status === 'completed' && t.actual_weight && t.theoretical_yield) {
          const dev = Math.abs(t.actual_weight - t.theoretical_yield) / t.theoretical_yield
          if (dev > 0.1) {
            newAlerts.push({ type: 'deviation', message: `Weight deviation ${(dev * 100).toFixed(0)}%`, taskId: t.id })
          }
        }
      }
      setAlerts(newAlerts)

      // Fetch staff on shift today
      const { data: shifts } = await supabase
        .from('shifts')
        .select('staff_id, staff:staff_id(id, name)')
        .eq('shift_date', today)
        .in('status', ['scheduled', 'confirmed', 'in_progress'])

      const staffMap = new Map<string, StaffOnDuty>()
      for (const s of shifts ?? []) {
        const st = s.staff as unknown as { id: string; name: string } | null
        if (st) {
          staffMap.set(st.id, { id: st.id, name: st.name, activeTaskCount: 0 })
        }
      }

      // Count active tasks per staff
      for (const t of allTasks) {
        if (t.assigned_to && t.status === 'in_progress' && staffMap.has(t.assigned_to)) {
          staffMap.get(t.assigned_to)!.activeTaskCount++
        }
      }
      setStaff(Array.from(staffMap.values()))

      // Fetch recent feedback (last 10, unprocessed first)
      const { data: fbData } = await supabase
        .from('cook_feedback')
        .select('id, staff_id, type, raw_text, is_processed, created_at, staff:staff_id(name)')
        .order('is_processed', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(10)

      setFeedback((fbData ?? []).map((f: Record<string, unknown>) => ({
        id: f.id as string,
        staff_name: (f.staff as { name: string } | null)?.name ?? null,
        type: f.type as string,
        raw_text: f.raw_text as string,
        is_processed: f.is_processed as boolean,
        created_at: f.created_at as string,
      })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
    } finally {
      setIsLoading(false)
    }
  }, [today])

  useEffect(() => {
    fetchData()
    // Realtime subscription for production_tasks changes
    const channel = supabase
      .channel('dashboard-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_tasks' }, () => fetchData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchData])

  const progressPct = summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10">
            <LayoutDashboard className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Dashboard</h1>
            <p className="text-[10px] text-slate-500">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
          </div>
          <button
            type="button"
            onClick={fetchData}
            disabled={isLoading}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 active:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 text-slate-400 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-20">
        <KitchenNav />

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-center text-sm text-rose-300">
            {error}
          </div>
        )}

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-800/50" />
            ))}
          </div>
        )}

        {!isLoading && (
          <>
            {/* Section A: Today's Summary */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Today's Production
              </h2>
              {summary.total === 0 ? (
                <p className="text-sm text-slate-500">No tasks scheduled for today</p>
              ) : (
                <>
                  {/* Progress bar */}
                  <div className="mb-3">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Progress</span>
                      <span className="font-mono font-bold text-emerald-400">{progressPct}%</span>
                    </div>
                    <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                  {/* Counters */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 text-center">
                      <p className="text-2xl font-bold text-amber-300">{summary.pending}</p>
                      <p className="text-[10px] text-amber-400/70">Pending</p>
                    </div>
                    <div className="rounded-xl bg-sky-500/5 border border-sky-500/20 p-3 text-center">
                      <p className="text-2xl font-bold text-sky-300">{summary.in_progress}</p>
                      <p className="text-[10px] text-sky-400/70">In Progress</p>
                    </div>
                    <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3 text-center">
                      <p className="text-2xl font-bold text-emerald-300">{summary.completed}</p>
                      <p className="text-[10px] text-emerald-400/70">Completed</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Section B: Alerts */}
            {alerts.length > 0 && (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
                <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-400">
                  <AlertTriangle className="h-3.5 w-3.5" /> Alerts ({alerts.length})
                </h2>
                <div className="space-y-2">
                  {alerts.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-rose-300">
                      {a.type === 'overdue' && <Clock className="h-3 w-3 shrink-0" />}
                      {a.type === 'deviation' && <AlertTriangle className="h-3 w-3 shrink-0" />}
                      <span>{a.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section D: Staff Today */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Staff Today
              </h2>
              {staff.length === 0 ? (
                <p className="text-sm text-slate-500">No shifts scheduled</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {staff.map(s => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2"
                    >
                      <ChefHat className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-sm text-slate-200">{s.name}</span>
                      {s.activeTaskCount > 0 && (
                        <span className="rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
                          {s.activeTaskCount} active
                        </span>
                      )}
                      {s.activeTaskCount === 0 && (
                        <span className="rounded-full bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-500">
                          idle
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cook Feedback */}
            {feedback.length > 0 && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
                <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <MessageCircle className="h-3.5 w-3.5" /> Cook Feedback ({feedback.filter(f => !f.is_processed).length} new)
                </h2>
                <div className="space-y-2">
                  {feedback.map(f => (
                    <div
                      key={f.id}
                      className={`flex items-start gap-3 rounded-xl p-3 ${
                        f.is_processed ? 'bg-slate-800/30' : 'bg-slate-800/60 border border-slate-700'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            f.type === 'problem' ? 'bg-rose-500/20 text-rose-300'
                            : f.type === 'suggestion' ? 'bg-emerald-500/20 text-emerald-300'
                            : f.type === 'question' ? 'bg-sky-500/20 text-sky-300'
                            : 'bg-slate-500/20 text-slate-400'
                          }`}>
                            {f.type}
                          </span>
                          {f.staff_name && (
                            <span className="text-[10px] text-slate-500">{f.staff_name}</span>
                          )}
                          <span className="text-[10px] text-slate-600">
                            {new Date(f.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className={`text-xs ${f.is_processed ? 'text-slate-500' : 'text-slate-200'}`}>
                          {f.raw_text}
                        </p>
                      </div>
                      {!f.is_processed && (
                        <button
                          type="button"
                          onClick={async () => {
                            await supabase.from('cook_feedback').update({ is_processed: true, processed_by: 'manager' }).eq('id', f.id)
                            setFeedback(prev => prev.map(x => x.id === f.id ? { ...x, is_processed: true } : x))
                          }}
                          className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-700 hover:text-emerald-400"
                          title="Mark as processed"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick links */}
            <div className="grid grid-cols-2 gap-3">
              <Link
                to="/planner/batch"
                className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 transition hover:border-emerald-500/30"
              >
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <span className="text-sm font-medium text-slate-200">Plan Production</span>
              </Link>
              <Link
                to="/live"
                className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 transition hover:border-sky-500/30"
              >
                <Clock className="h-5 w-5 text-sky-400" />
                <span className="text-sm font-medium text-slate-200">Kitchen Live</span>
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
