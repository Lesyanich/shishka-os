import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, RefreshCw, CalendarDays, ListTodo, Repeat, Users, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStaff } from '../hooks/useStaff'
import { useShifts } from '../hooks/useShifts'
import {
  useStaffTasks,
  type StaffTask,
  type StaffTaskInsert,
  type TaskStatus,
} from '../hooks/useStaffTasks'
import { TaskRow } from '../components/tasks/TaskRow'
import { TaskFormModal } from '../components/tasks/TaskFormModal'
import { TelegramLinkPanel } from '../components/tasks/TelegramLinkPanel'
import {
  STATUS_OPTIONS,
  describeRecurrence,
  formatLocalDate,
  shortTime,
} from '../components/tasks/taskMeta'

type Tab = 'today' | 'all' | 'recurring' | 'team'

const TABS: { value: Tab; label: string; icon: typeof ListTodo }[] = [
  { value: 'today', label: 'Today', icon: CalendarDays },
  { value: 'all', label: 'All tasks', icon: ListTodo },
  { value: 'recurring', label: 'Recurring', icon: Repeat },
  { value: 'team', label: 'Telegram', icon: Send },
]

export function StaffTasksPage() {
  const today = formatLocalDate(new Date())
  const { staff } = useStaff()
  const { shifts } = useShifts(today)
  const {
    tasks,
    templates,
    isLoading,
    createTask,
    updateTask,
    setStatus,
    deleteTask,
    materializeToday,
  } = useStaffTasks()

  const [tab, setTab] = useState<Tab>('today')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<StaffTask | null>(null)
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'open' | 'all'>('open')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('')

  const activeStaff = useMemo(() => staff.filter((s) => s.is_active), [staff])

  // Materialize today's recurring instances once on first load (cron does this
  // automatically in Phase 3; this keeps the Today view correct before then).
  const materializedRef = useRef(false)
  useEffect(() => {
    if (materializedRef.current) return
    materializedRef.current = true
    materializeToday()
  }, [materializeToday])

  const openNew = () => {
    setEditing(null)
    setModalOpen(true)
  }
  const openEdit = (task: StaffTask) => {
    setEditing(task)
    setModalOpen(true)
  }

  const pushToTelegram = async (taskId: string): Promise<{ ok: boolean; error?: string }> => {
    const { data, error } = await supabase.functions.invoke(
      `telegram-push?action=assign&task_id=${taskId}`,
      { method: 'POST' },
    )
    if (error) return { ok: false, error: error.message }
    return data as { ok: boolean; error?: string }
  }

  const handleSubmit = async (input: StaffTaskInsert, notify?: boolean) => {
    if (editing) {
      await updateTask(editing.id, input)
    } else {
      const created = await createTask(input)
      if (notify && created && !created.is_template && created.assigned_to) {
        const res = await pushToTelegram(created.id)
        if (!res.ok) {
          window.alert(
            res.error === 'assignee_not_linked'
              ? "Task saved, but this person hasn't connected Telegram yet (see the Telegram tab)."
              : `Task saved, but Telegram push failed: ${res.error ?? 'unknown'}`,
          )
        }
      }
    }
    setModalOpen(false)
    setEditing(null)
  }

  const handlePush = async (task: StaffTask) => {
    const res = await pushToTelegram(task.id)
    if (!res.ok) {
      window.alert(
        res.error === 'assignee_not_linked'
          ? "This person hasn't connected Telegram yet (see the Telegram tab)."
          : `Telegram push failed: ${res.error ?? 'unknown'}`,
      )
    }
  }

  const toggleDone = (task: StaffTask) =>
    setStatus(task.id, task.status === 'done' ? 'todo' : 'done')

  const handleDelete = (task: StaffTask) => {
    if (window.confirm(`Delete "${task.title}"?`)) deleteTask(task.id)
  }

  // ── Today: concrete tasks due today, grouped by assignee ──
  const todayTasks = useMemo(
    () => tasks.filter((t) => t.due_date === today),
    [tasks, today],
  )
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; tasks: StaffTask[] }>()
    for (const t of todayTasks) {
      const key = t.assigned_to ?? 'unassigned'
      const name = t.staff?.name ?? 'Unassigned'
      if (!map.has(key)) map.set(key, { name, tasks: [] })
      map.get(key)!.tasks.push(t)
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [todayTasks])

  // ── All: filtered concrete tasks ──
  const filteredAll = useMemo(() => {
    return tasks.filter((t) => {
      if (assigneeFilter && t.assigned_to !== assigneeFilter) return false
      if (statusFilter === 'all') return true
      if (statusFilter === 'open') return t.status === 'todo' || t.status === 'in_progress'
      return t.status === statusFilter
    })
  }, [tasks, assigneeFilter, statusFilter])

  const doneToday = todayTasks.filter((t) => t.status === 'done').length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-slate-900/60 p-1 ring-1 ring-slate-800">
          {TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                tab === value
                  ? 'bg-emerald-500/15 text-emerald-300 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {tab === 'today' && (
          <button
            type="button"
            onClick={() => materializeToday()}
            title="Generate today's recurring tasks"
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh recurring
          </button>
        )}

        {tab !== 'team' && (
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
          >
            <Plus className="h-3.5 w-3.5" />
            New task
          </button>
        )}
      </div>

      {/* ── TODAY ── */}
      {tab === 'today' && (
        <div className="space-y-4">
          {/* Shifts today strip */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
              <Users className="h-3.5 w-3.5" />
              <span className="font-medium">Working today</span>
              <span className="text-slate-600">·</span>
              <span>{today}</span>
              <span className="text-slate-600">·</span>
              <span>{doneToday}/{todayTasks.length} tasks done</span>
            </div>
            {shifts.length === 0 ? (
              <p className="text-xs text-slate-600">No shifts scheduled today.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {shifts.map((sh) => (
                  <span key={sh.id} className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                    {sh.staff?.name ?? '—'} · {shortTime(sh.start_time)}–{shortTime(sh.end_time)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Grouped tasks */}
          {isLoading ? (
            <p className="text-xs text-slate-500">Loading…</p>
          ) : grouped.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-xs text-slate-600">
              No tasks for today yet. Create a task or set up recurring checklists.
            </p>
          ) : (
            grouped.map((g) => (
              <div key={g.name}>
                <h3 className="mb-1.5 px-1 text-xs font-semibold text-slate-400">{g.name}</h3>
                <div className="space-y-1.5">
                  {g.tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      onToggleDone={toggleDone}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                      onPush={handlePush}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── ALL ── */}
      {tab === 'all' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200"
            >
              <option value="open">Open</option>
              <option value="all">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200"
            >
              <option value="">Everyone</option>
              {activeStaff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {filteredAll.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-xs text-slate-600">
              No tasks match these filters.
            </p>
          ) : (
            <div className="space-y-1.5">
              {filteredAll.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  showDate
                  onToggleDone={toggleDone}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onPush={handlePush}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── RECURRING ── */}
      {tab === 'recurring' && (
        <div className="space-y-1.5">
          {templates.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-xs text-slate-600">
              No recurring templates. Create a task and set it to repeat daily or weekly.
            </p>
          ) : (
            templates.map((t) => (
              <TaskRow key={t.id} task={t} onEdit={openEdit} onDelete={handleDelete} />
            ))
          )}
          {templates.length > 0 && (
            <p className="px-1 pt-2 text-[11px] text-slate-600">
              {templates.length} template(s) · {templates.map((t) => describeRecurrence(t)).join(' · ')}
            </p>
          )}
        </div>
      )}

      {/* ── TELEGRAM ── */}
      {tab === 'team' && <TelegramLinkPanel staff={activeStaff} />}

      <TaskFormModal
        open={modalOpen}
        initial={editing}
        staff={activeStaff}
        onClose={() => {
          setModalOpen(false)
          setEditing(null)
        }}
        onSubmit={handleSubmit}
      />
    </div>
  )
}

export default StaffTasksPage
