import { useMemo } from 'react'
import { ListTodo, RefreshCw } from 'lucide-react'
import { useAppRole } from '../contexts/AppRoleContext'
import { useStaffTasks, type StaffTask } from '../hooks/useStaffTasks'
import { TaskRow } from '../components/tasks/TaskRow'
import { formatLocalDate } from '../components/tasks/taskMeta'

/**
 * Kitchen-facing task board (cook tier). Shows today's tasks grouped by person
 * so the shared tablet shows everyone their work; the logged-in person's group
 * is pinned first when their identity is known. Cooks can tick tasks done.
 */
export function CookTasksPage() {
  const today = formatLocalDate(new Date())
  const { staffId } = useAppRole()
  const { tasks, isLoading, setStatus, materializeToday, refetch } = useStaffTasks()

  const todayTasks = useMemo(
    () => tasks.filter((t) => t.due_date === today),
    [tasks, today],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, { key: string; name: string; tasks: StaffTask[] }>()
    for (const t of todayTasks) {
      const key = t.assigned_to ?? 'unassigned'
      const name = t.staff?.name ?? 'Unassigned'
      if (!map.has(key)) map.set(key, { key, name, tasks: [] })
      map.get(key)!.tasks.push(t)
    }
    return Array.from(map.values()).sort((a, b) => {
      // Pin the logged-in person's group first
      if (staffId) {
        if (a.key === staffId) return -1
        if (b.key === staffId) return 1
      }
      return a.name.localeCompare(b.name)
    })
  }, [todayTasks, staffId])

  const doneCount = todayTasks.filter((t) => t.status === 'done').length
  const toggleDone = (task: StaffTask) =>
    setStatus(task.id, task.status === 'done' ? 'todo' : 'done')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ListTodo className="h-5 w-5 text-emerald-400" />
        <h1 className="text-lg font-semibold text-slate-100">Today's Tasks · งานวันนี้</h1>
        <span className="text-xs text-slate-500">{today}</span>
        <span className="text-slate-600">·</span>
        <span className="text-xs text-slate-400">{doneCount}/{todayTasks.length} done</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => { materializeToday(); refetch() }}
          title="Refresh"
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : grouped.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-800 px-4 py-12 text-center text-sm text-slate-600">
          No tasks for today. · วันนี้ไม่มีงาน
        </p>
      ) : (
        grouped.map((g) => (
          <div key={g.key}>
            <h3
              className={`mb-1.5 px-1 text-xs font-semibold ${
                g.key === staffId ? 'text-emerald-300' : 'text-slate-400'
              }`}
            >
              {g.name}
              {g.key === staffId && <span className="ml-1.5 text-[10px] text-emerald-500">· you</span>}
            </h3>
            <div className="space-y-1.5">
              {g.tasks.map((t) => (
                <TaskRow key={t.id} task={t} onToggleDone={toggleDone} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

export default CookTasksPage
