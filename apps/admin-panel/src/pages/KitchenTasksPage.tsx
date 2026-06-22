import { useEffect, useMemo, useOptimistic, useRef, useState, startTransition } from 'react'
import {
  Plus, RefreshCw, CalendarDays, ListTodo, Repeat, Users, Send,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAppRole } from '../contexts/AppRoleContext'
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
type StationFilter = 'all' | 'L1' | 'L2'
type KindFilter = 'all' | 'recurring' | 'oneoff'

const STATION_CHIPS: { value: StationFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'L1', label: 'L1 Kitchen' },
  { value: 'L2', label: 'L2 Assembly' },
]

const KIND_CHIPS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'recurring', label: '↻ Recurring' },
  { value: 'oneoff', label: '• One-off' },
]

interface ChipOption {
  value: string
  label: string
}

/** One labelled row of filter chips. */
function FilterChipRow({
  label,
  options,
  value,
  onSelect,
}: {
  label: string
  options: ChipOption[]
  value: string
  onSelect: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onSelect(o.value)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            value === o.value
              ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
              : 'bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Unified kitchen task board — the single tracker behind both `/kitchen/my-tasks`
 * (cook landing) and `/staff-tasks` (manager). Everyone sees the whole team's
 * tasks and can create / assign / complete; managers additionally get the shifts
 * strip, Telegram pushes, and the Telegram-link tab. Filters: station (L1/L2),
 * person (chips per staff member), and kind (recurring vs one-off). "general"
 * tasks show under both L1 and L2.
 */
export function KitchenTasksPage() {
  const today = formatLocalDate(new Date())
  const { role, staffId } = useAppRole()
  const isManager = role !== 'cook'

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

  // Optimistic done-toggle: flip the checkbox instantly, reconcile on refetch.
  const [optimisticTasks, applyOptimistic] = useOptimistic(
    tasks,
    (state: StaffTask[], patch: { id: string; status: TaskStatus }) =>
      state.map((t) =>
        t.id === patch.id
          ? { ...t, status: patch.status, completed_at: patch.status === 'done' ? new Date().toISOString() : null }
          : t,
      ),
  )

  const [tab, setTab] = useState<Tab>('today')
  const [stationFilter, setStationFilter] = useState<StationFilter>('all')
  const [personFilter, setPersonFilter] = useState<string>('all') // 'all' | 'unassigned' | staffId
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<StaffTask | null>(null)
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'open' | 'all'>('open')

  const activeStaff = useMemo(() => staff.filter((s) => s.is_active), [staff])

  // People chips — distinct assignees across all tasks + templates (stable set,
  // so chips don't appear/disappear as other filters change). Self pinned first.
  const people = useMemo(() => {
    const map = new Map<string, string>()
    let hasUnassigned = false
    for (const t of [...tasks, ...templates]) {
      if (t.assigned_to) map.set(t.assigned_to, t.staff?.name ?? '—')
      else hasUnassigned = true
    }
    const list = Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => {
      if (staffId) {
        if (a.id === staffId) return -1
        if (b.id === staffId) return 1
      }
      return a.name.localeCompare(b.name)
    })
    return { list, hasUnassigned }
  }, [tasks, templates, staffId])

  const personOptions: ChipOption[] = useMemo(() => {
    const opts: ChipOption[] = [{ value: 'all', label: 'All' }]
    for (const p of people.list) {
      opts.push({ value: p.id, label: p.id === staffId ? `${p.name} · me` : p.name })
    }
    if (people.hasUnassigned) opts.push({ value: 'unassigned', label: 'Unassigned' })
    return opts
  }, [people, staffId])

  // Materialize today's recurring instances once on load (the cron does this at
  // 07:25 ICT; this keeps the Today view correct before then).
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

  const toggleDone = (task: StaffTask) => {
    const next: TaskStatus = task.status === 'done' ? 'todo' : 'done'
    startTransition(async () => {
      applyOptimistic({ id: task.id, status: next })
      await setStatus(task.id, next)
    })
  }

  const handlePhotosChange = (task: StaffTask, photoUrls: string[]) =>
    updateTask(task.id, { photo_urls: photoUrls })

  const handleDelete = (task: StaffTask) => {
    if (window.confirm(`Delete "${task.title}"?`)) deleteTask(task.id)
  }

  // Filter predicates. "general" tasks show under L1 and L2.
  const matchesStation = (t: StaffTask) =>
    stationFilter === 'all' || t.station === stationFilter || t.station === 'general'
  const matchesPerson = (t: StaffTask) =>
    personFilter === 'all'
      ? true
      : personFilter === 'unassigned'
        ? !t.assigned_to
        : t.assigned_to === personFilter
  // Recurring instances carry a template_id; genuine one-offs don't.
  const matchesKind = (t: StaffTask) =>
    kindFilter === 'all' ? true : kindFilter === 'recurring' ? !!t.template_id : !t.template_id

  // ── Today: concrete tasks due today, grouped by assignee ──
  const todayTasks = useMemo(
    () =>
      optimisticTasks.filter(
        (t) => t.due_date === today && matchesStation(t) && matchesPerson(t) && matchesKind(t),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [optimisticTasks, today, stationFilter, personFilter, kindFilter],
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
      if (staffId) {
        if (a.key === staffId) return -1
        if (b.key === staffId) return 1
      }
      return a.name.localeCompare(b.name)
    })
  }, [todayTasks, staffId])

  // ── All: filtered concrete tasks ──
  const filteredAll = useMemo(() => {
    return optimisticTasks.filter((t) => {
      if (!matchesStation(t) || !matchesPerson(t) || !matchesKind(t)) return false
      if (statusFilter === 'all') return true
      if (statusFilter === 'open') return t.status === 'todo' || t.status === 'in_progress'
      return t.status === statusFilter
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optimisticTasks, statusFilter, stationFilter, personFilter, kindFilter])

  // ── Recurring: templates, filtered by station + person (kind is implicit) ──
  const filteredTemplates = useMemo(
    () => templates.filter((t) => matchesStation(t) && matchesPerson(t)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templates, stationFilter, personFilter],
  )

  const doneToday = todayTasks.filter((t) => t.status === 'done').length

  const TABS: { value: Tab; label: string; icon: typeof ListTodo }[] = [
    { value: 'today', label: 'Today', icon: CalendarDays },
    { value: 'all', label: 'All tasks', icon: ListTodo },
    { value: 'recurring', label: 'Recurring', icon: Repeat },
    ...(isManager ? [{ value: 'team' as Tab, label: 'Telegram', icon: Send }] : []),
  ]

  const showFilters = tab === 'today' || tab === 'all' || tab === 'recurring'
  const showKindRow = tab === 'today' || tab === 'all'

  return (
    <div className="space-y-4">
      {/* Header / tabs */}
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
            Refresh
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

      {/* Filter bar: Station · People · Type */}
      {showFilters && (
        <div className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-900/40 p-2.5">
          <FilterChipRow
            label="Station"
            options={STATION_CHIPS}
            value={stationFilter}
            onSelect={(v) => setStationFilter(v as StationFilter)}
          />
          <FilterChipRow
            label="People"
            options={personOptions}
            value={personFilter}
            onSelect={setPersonFilter}
          />
          {showKindRow && (
            <FilterChipRow
              label="Type"
              options={KIND_CHIPS}
              value={kindFilter}
              onSelect={(v) => setKindFilter(v as KindFilter)}
            />
          )}
        </div>
      )}

      {/* ── TODAY ── */}
      {tab === 'today' && (
        <div className="space-y-4">
          {isManager && (
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
          )}

          {!isManager && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ListTodo className="h-4 w-4 text-emerald-400" />
              <span className="font-medium text-slate-200">Today's tasks · งานวันนี้</span>
              <span className="text-slate-600">·</span>
              <span>{doneToday}/{todayTasks.length} done</span>
            </div>
          )}

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
                    <TaskRow
                      key={t.id}
                      task={t}
                      onToggleDone={toggleDone}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                      onPhotosChange={handlePhotosChange}
                      onPush={isManager ? handlePush : undefined}
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
                  onPhotosChange={handlePhotosChange}
                  onPush={isManager ? handlePush : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── RECURRING ── */}
      {tab === 'recurring' && (
        <div className="space-y-1.5">
          {filteredTemplates.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-xs text-slate-600">
              No recurring templates. Create a task and set it to repeat daily or weekly.
            </p>
          ) : (
            filteredTemplates.map((t) => (
              <TaskRow key={t.id} task={t} onEdit={openEdit} onDelete={handleDelete} />
            ))
          )}
          {filteredTemplates.length > 0 && (
            <p className="px-1 pt-2 text-[11px] text-slate-600">
              {filteredTemplates.length} template(s) · {filteredTemplates.map((t) => describeRecurrence(t)).join(' · ')}
            </p>
          )}
        </div>
      )}

      {/* ── TELEGRAM (managers) ── */}
      {tab === 'team' && isManager && <TelegramLinkPanel staff={activeStaff} />}

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

export default KitchenTasksPage
