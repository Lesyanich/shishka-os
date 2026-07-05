import { useEffect, useMemo, useOptimistic, useRef, useState, startTransition } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Plus, RefreshCw, CalendarDays, ListTodo, Repeat, Users, Send, ChevronDown, SlidersHorizontal,
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
  type TaskCategory,
} from '../hooks/useStaffTasks'
import { TaskRow } from '../components/tasks/TaskRow'
import { TaskFormModal } from '../components/tasks/TaskFormModal'
import { TaskDetailModal } from '../components/tasks/TaskDetailModal'
import { TelegramLinkPanel } from '../components/tasks/TelegramLinkPanel'
import {
  CATEGORY_OPTIONS,
  categoryMeta,
  STATUS_OPTIONS,
  TIME_BANDS,
  type TimeBand,
  describeRecurrence,
  formatLocalDate,
  shortTime,
  timeBandOf,
} from '../components/tasks/taskMeta'
import { useTabParam } from '../hooks/useTabParam'

type Tab = 'today' | 'all' | 'recurring' | 'team'
type StationFilter = 'all' | 'L1' | 'L2'
type KindFilter = 'all' | 'recurring' | 'oneoff'
type CategoryFilter = 'all' | TaskCategory

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

const CATEGORY_CHIPS: ChipOption[] = [
  { value: 'all', label: 'All' },
  ...CATEGORY_OPTIONS.map((c) => ({ value: c.value, label: c.label })),
]

/** One labelled row of filter chips — label stays put, chips scroll sideways. */
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
    <div className="flex items-center gap-1.5">
      <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div className="flex gap-1.5 overflow-x-auto">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onSelect(o.value)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
              value === o.value
                ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Unified kitchen task board — the single tracker behind both `/kitchen/my-tasks`
 * (cook landing) and `/staff-tasks` (manager). Everyone sees the whole team's
 * tasks and can create / assign / complete; managers additionally get the shifts
 * strip, Telegram pushes, and the Telegram-link tab.
 *
 * Today is sectioned by time of day (Morning / Day / Evening / Anytime); inside
 * each section cards are clustered by work type, which also shows as a coloured
 * stripe + icon. Filters (work type / station / person / kind) collapse behind a
 * single button to keep the phone view clean. "general" tasks show under L1 & L2.
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

  // tab is URL-backed (?tab=) via useTabParam; searchParams drives the separate
  // ?task=<id> deep-link below. Both params are independent — each setter copies
  // the others, so they never clobber one another.
  const [tab, setTab] = useTabParam(['today', 'all', 'recurring', 'team'] as const, 'today')
  const [searchParams, setSearchParams] = useSearchParams()
  const [stationFilter, setStationFilter] = useState<StationFilter>('all')
  const [personFilter, setPersonFilter] = useState<string>('all') // 'all' | 'unassigned' | staffId
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [collapsedBands, setCollapsedBands] = useState<Set<TimeBand>>(new Set())
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<StaffTask | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'open' | 'all'>('open')

  const activeStaff = useMemo(() => staff.filter((s) => s.is_active), [staff])

  // People chips — every active staff member (so you can filter by anyone, even
  // those with no tasks yet). Self pinned first; "Unassigned" only when relevant.
  const personOptions: ChipOption[] = useMemo(() => {
    const opts: ChipOption[] = [{ value: 'all', label: 'All' }]
    const sorted = [...activeStaff].sort((a, b) => {
      if (staffId) {
        if (a.id === staffId) return -1
        if (b.id === staffId) return 1
      }
      return a.name.localeCompare(b.name)
    })
    for (const s of sorted) {
      opts.push({ value: s.id, label: s.id === staffId ? `${s.name} · me` : s.name })
    }
    if ([...tasks, ...templates].some((t) => !t.assigned_to)) {
      opts.push({ value: 'unassigned', label: 'Unassigned' })
    }
    return opts
  }, [activeStaff, staffId, tasks, templates])

  // Materialize today's recurring instances once on load (the cron does this at
  // 07:25 ICT; this keeps the Today view correct before then).
  const materializedRef = useRef(false)
  useEffect(() => {
    if (materializedRef.current) return
    materializedRef.current = true
    materializeToday()
  }, [materializeToday])

  // Each task gets a shareable URL via ?task=<id>. Opening that URL opens the
  // task; opening/closing the modal keeps the URL in sync.
  const syncTaskParam = (id: string | null) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (id) p.set('task', id)
        else p.delete('task')
        return p
      },
      { replace: true },
    )
  }

  // Read-only detail (tapping a card) resolves the *current* task by id, so it
  // reflects live edits and done-toggles.
  const viewing = useMemo(
    () => (viewingId ? [...optimisticTasks, ...templates].find((t) => t.id === viewingId) ?? null : null),
    [viewingId, optimisticTasks, templates],
  )

  const openView = (task: StaffTask) => {
    setViewingId(task.id)
    syncTaskParam(task.id)
  }
  const openEdit = (task: StaffTask) => {
    setViewingId(null)
    setEditing(task)
    setModalOpen(true)
    syncTaskParam(task.id)
  }
  const openNew = () => {
    setViewingId(null)
    setEditing(null)
    setModalOpen(true)
    syncTaskParam(null)
  }
  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
    syncTaskParam(null)
  }
  const closeView = () => {
    setViewingId(null)
    syncTaskParam(null)
  }

  // Open a task from a shared ?task=<id> link (read-only) once data is loaded.
  const taskParam = searchParams.get('task')
  useEffect(() => {
    if (!taskParam || modalOpen || viewingId) return
    const found = [...tasks, ...templates].find((t) => t.id === taskParam)
    if (found) setViewingId(found.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskParam, tasks, templates])

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
    closeModal()
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

  const handleSaveComment = (task: StaffTask, comment: string) =>
    updateTask(task.id, { comment: comment.trim() || null })

  // Delete is confirmed inside TaskDetailModal, which then closes itself.
  const handleDelete = (task: StaffTask) => deleteTask(task.id)

  const toggleBand = (key: TimeBand) =>
    setCollapsedBands((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

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
  const matchesCategory = (t: StaffTask) => categoryFilter === 'all' || t.category === categoryFilter

  // ── Today: concrete tasks due today, grouped into time-of-day bands ──
  const todayTasks = useMemo(
    () =>
      optimisticTasks.filter(
        (t) =>
          t.due_date === today &&
          matchesStation(t) &&
          matchesPerson(t) &&
          matchesKind(t) &&
          matchesCategory(t),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [optimisticTasks, today, stationFilter, personFilter, kindFilter, categoryFilter],
  )
  // Group by time band, drop empty bands, cluster by work type inside each.
  const bands = useMemo(() => {
    const map = new Map<TimeBand, StaffTask[]>()
    for (const t of todayTasks) {
      const b = timeBandOf(t)
      const arr = map.get(b)
      if (arr) arr.push(t)
      else map.set(b, [t])
    }
    return TIME_BANDS.map((band) => ({
      ...band,
      tasks: (map.get(band.key) ?? []).slice().sort(
        (a, b) =>
          categoryMeta(a.category).sort - categoryMeta(b.category).sort ||
          (a.due_time ?? '').localeCompare(b.due_time ?? '') ||
          a.title.localeCompare(b.title),
      ),
    })).filter((band) => band.tasks.length > 0)
  }, [todayTasks])

  // ── All: filtered concrete tasks ──
  const filteredAll = useMemo(() => {
    return optimisticTasks.filter((t) => {
      if (!matchesStation(t) || !matchesPerson(t) || !matchesKind(t) || !matchesCategory(t)) return false
      if (statusFilter === 'all') return true
      if (statusFilter === 'open') return t.status === 'todo' || t.status === 'in_progress'
      return t.status === statusFilter
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optimisticTasks, statusFilter, stationFilter, personFilter, kindFilter, categoryFilter])

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
  const showCategoryRow = tab === 'today' || tab === 'all'
  const showKindRow = tab === 'today' || tab === 'all'
  const activeFilterCount =
    (stationFilter !== 'all' ? 1 : 0) +
    (personFilter !== 'all' ? 1 : 0) +
    (showCategoryRow && categoryFilter !== 'all' ? 1 : 0) +
    (showKindRow && kindFilter !== 'all' ? 1 : 0)

  return (
    <div className="space-y-4">
      {/* Sticky header: tabs · filters toggle · actions, plus the collapsible filter panel */}
      <div className="sticky top-0 z-20 -mx-6 space-y-2 bg-slate-950/90 px-6 pb-2 pt-1 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-900/60 p-1 ring-1 ring-slate-800">
            {TABS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
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

          {showFilters && (
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              title="Filters"
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                filtersOpen || activeFilterCount > 0
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-emerald-500/20 px-1.5 text-[10px] font-semibold text-emerald-300">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}

          {tab === 'today' && (
            <button
              type="button"
              onClick={() => materializeToday()}
              title="Generate today's recurring tasks"
              className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}

          {tab !== 'team' && (
            <button
              type="button"
              onClick={openNew}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New task</span>
            </button>
          )}
        </div>

        {showFilters && filtersOpen && (
          <div className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-900/40 p-2.5">
            {showCategoryRow && (
              <FilterChipRow
                label="Work"
                options={CATEGORY_CHIPS}
                value={categoryFilter}
                onSelect={(v) => setCategoryFilter(v as CategoryFilter)}
              />
            )}
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
      </div>

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
          ) : bands.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-800 px-4 py-12 text-center text-sm text-slate-600">
              No tasks for today. · วันนี้ไม่มีงาน
            </p>
          ) : (
            bands.map((band) => {
              const Icon = band.icon
              const total = band.tasks.length
              const doneN = band.tasks.filter((t) => t.status === 'done').length
              const collapsed = collapsedBands.has(band.key)
              return (
                <div key={band.key}>
                  <button
                    type="button"
                    onClick={() => toggleBand(band.key)}
                    className="mb-1.5 flex w-full items-center gap-2 px-1 text-left"
                  >
                    <Icon className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-200">{band.label}</span>
                    <span className="text-xs text-slate-500">· {band.label_th}</span>
                    <span className="ml-auto rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-300">
                      {doneN}/{total}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-slate-500 transition-transform ${collapsed ? '-rotate-90' : ''}`}
                    />
                  </button>
                  {!collapsed && (
                    <div className="space-y-1.5">
                      {band.tasks.map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          onOpen={openView}
                          onToggleDone={toggleDone}
                          onPhotosChange={handlePhotosChange}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })
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
                  onOpen={openView}
                  onToggleDone={toggleDone}
                  onPhotosChange={handlePhotosChange}
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
              <TaskRow key={t.id} task={t} onOpen={openView} />
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

      {/* Read-only detail first — tap a card to read; Edit switches to the form. */}
      {viewing && (
        <TaskDetailModal
          task={viewing}
          onClose={closeView}
          onEdit={openEdit}
          onToggleDone={toggleDone}
          onSaveComment={handleSaveComment}
          onPhotosChange={handlePhotosChange}
          onDelete={handleDelete}
          onPush={isManager ? handlePush : undefined}
        />
      )}

      {/* Mounted only while open so the form re-reads `initial` each time it
          opens (a persistently-mounted modal keeps stale empty state). */}
      {modalOpen && (
        <TaskFormModal
          open
          initial={editing}
          staff={activeStaff}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  )
}

export default KitchenTasksPage
