import { useEffect, useMemo, useOptimistic, useRef, useState, startTransition } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Plus, RefreshCw, CalendarDays, ListTodo, Repeat, Send, ChevronDown, SlidersHorizontal,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAppRole } from '../contexts/AppRoleContext'
import { useStaff } from '../hooks/useStaff'
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
  categoryMeta,
  TASK_CATEGORIES,
  STATUS_OPTIONS,
  TIME_BANDS,
  type TimeBand,
  describeRecurrence,
  formatLocalDate,
  timeBandOf,
} from '../components/tasks/taskMeta'
import { useTabParam } from '../hooks/useTabParam'

type Tab = 'today' | 'all' | 'recurring' | 'team'
type StationFilter = 'all' | 'L1' | 'L2'
type KindFilter = 'all' | 'recurring' | 'oneoff'
type CategoryFilter = 'all' | TaskCategory
type DayScope = 'all' | 'overdue' | 'today' | 'week'

const DAY_SCOPES: { value: DayScope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: '7 days' },
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

/**
 * Always-visible work-type strip: [All] + one coloured chip per category that
 * has tasks in the current list (data-driven, like the /menu chips). Tap = filter.
 * The selected category stays visible even at zero so the filter can be cleared.
 */
function CategoryChipStrip({
  counts,
  value,
  onSelect,
}: {
  counts: Partial<Record<TaskCategory, number>>
  value: CategoryFilter
  onSelect: (v: CategoryFilter) => void
}) {
  const cats = TASK_CATEGORIES
    .filter((c) => (counts[c] ?? 0) > 0 || c === value)
    .sort((a, b) => categoryMeta(a).sort - categoryMeta(b).sort)
  const total = Object.values(counts).reduce((s, n) => s + (n ?? 0), 0)
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
      <button
        type="button"
        onClick={() => onSelect('all')}
        className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition ${
          value === 'all'
            ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
        }`}
      >
        All
        <span className="text-[10px] opacity-70">{total}</span>
      </button>
      {cats.map((c) => {
        const meta = categoryMeta(c)
        const Icon = meta.icon
        const active = value === c
        return (
          <button
            key={c}
            type="button"
            onClick={() => onSelect(active ? 'all' : c)}
            className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition ${
              active
                ? `${meta.style} ring-1 ring-current/30`
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {meta.label}
            <span className="text-[10px] opacity-70">{counts[c] ?? 0}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Always-visible station switch (All / L1 / L2) — the cook's primary axis, so it
 * lives in reach rather than behind the Filters button. Full-width segments =
 * big thumb targets; the active segment takes the station's own colour.
 */
function StationSegmented({
  value,
  onSelect,
}: {
  value: StationFilter
  onSelect: (v: StationFilter) => void
}) {
  const opts: { value: StationFilter; label: string; active: string }[] = [
    { value: 'all', label: 'All', active: 'bg-emerald-500/15 text-emerald-300' },
    { value: 'L1', label: 'L1 Kitchen', active: 'bg-orange-500/15 text-orange-300' },
    { value: 'L2', label: 'L2 Assembly', active: 'bg-cyan-500/15 text-cyan-300' },
  ]
  return (
    <div className="flex gap-1 rounded-lg bg-slate-900/60 p-1 ring-1 ring-slate-800">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onSelect(o.value)}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            value === o.value ? o.active : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Day-scope switch for the All tab (All / Overdue / Today / next 7 days). */
function DayScopeSegmented({
  value,
  onSelect,
}: {
  value: DayScope
  onSelect: (v: DayScope) => void
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-slate-900/60 p-1 ring-1 ring-slate-800">
      {DAY_SCOPES.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onSelect(o.value)}
          className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
            value === o.value
              ? o.value === 'overdue'
                ? 'bg-rose-500/15 text-rose-300'
                : 'bg-emerald-500/15 text-emerald-300'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Human day-group heading: "Today" / "Tomorrow" / "Wed 9 Jul" from a YYYY-MM-DD. */
function dayLabel(dateStr: string, todayStr: string, tomorrowStr: string): string {
  if (dateStr === todayStr) return 'Today'
  if (dateStr === tomorrowStr) return 'Tomorrow'
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

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
 * tasks and can create / assign / complete; managers additionally get Telegram
 * pushes and the Telegram-link tab.
 *
 * Today is sectioned by time of day (Morning / Day / Evening / Anytime); inside
 * each section cards are clustered by work type, which also shows as a coloured
 * stripe + icon. The station switch and the work-type chip strip stay always
 * visible; the rarer filters (person / kind) collapse behind the Filters button.
 * "general" tasks show under L1 & L2.
 */
export function KitchenTasksPage() {
  const today = formatLocalDate(new Date())
  const { role, staffId } = useAppRole()
  const isManager = role !== 'cook'

  const { staff } = useStaff()
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
  const [dayScope, setDayScope] = useState<DayScope>('all') // All-tab day filter
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [collapsedBands, setCollapsedBands] = useState<Set<TimeBand>>(new Set())
  // Overdue day-group starts collapsed so old backlog doesn't flood the All tab.
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set(['overdue']))
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

  const toggleDay = (key: string) =>
    setCollapsedDays((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // Overdue is collapsed by default (de-flood in the 'all' view); filtering
  // explicitly to Overdue should reveal it rather than show a collapsed header.
  const selectDayScope = (v: DayScope) => {
    setDayScope(v)
    if (v === 'overdue') {
      setCollapsedDays((prev) => {
        const next = new Set(prev)
        next.delete('overdue')
        return next
      })
    }
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
  const matchesCategory = (t: StaffTask) => categoryFilter === 'all' || t.category === categoryFilter

  // Day-scope bounds for the All tab (ISO date strings compare lexicographically).
  const tomorrow = useMemo(() => formatLocalDate(new Date(Date.now() + 864e5)), [])
  const weekEnd = useMemo(() => formatLocalDate(new Date(Date.now() + 6 * 864e5)), [])
  const matchesDayScope = (t: StaffTask) => {
    if (dayScope === 'all') return true
    if (!t.due_date) return false
    if (dayScope === 'overdue') return t.due_date < today
    if (dayScope === 'today') return t.due_date === today
    return t.due_date >= today && t.due_date <= weekEnd // 'week'
  }

  // ── Today: concrete tasks due today, grouped into time-of-day bands ──
  // Two-step: the pre-category base feeds the chip counts (a chip's count must
  // not depend on the category filter itself), then matchesCategory narrows it.
  const todayBase = useMemo(
    () =>
      optimisticTasks.filter(
        (t) =>
          t.due_date === today &&
          matchesStation(t) &&
          matchesPerson(t) &&
          matchesKind(t),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [optimisticTasks, today, stationFilter, personFilter, kindFilter],
  )
  const todayTasks = useMemo(
    () => todayBase.filter(matchesCategory),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayBase, categoryFilter],
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

  // ── All: filtered concrete tasks (same two-step split as Today) ──
  const allBase = useMemo(() => {
    return optimisticTasks.filter((t) => {
      if (!matchesStation(t) || !matchesPerson(t) || !matchesKind(t) || !matchesDayScope(t)) return false
      if (statusFilter === 'all') return true
      if (statusFilter === 'open') return t.status === 'todo' || t.status === 'in_progress'
      return t.status === statusFilter
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optimisticTasks, statusFilter, stationFilter, personFilter, kindFilter, dayScope, today, weekEnd])
  const filteredAll = useMemo(
    () => allBase.filter(matchesCategory),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allBase, categoryFilter],
  )

  // Break the All list out of one flat sheet into day groups: Overdue first,
  // then each concrete date ascending (Today / Tomorrow / weekday), No-date last.
  const dayGroups = useMemo(() => {
    const buckets = new Map<string, StaffTask[]>()
    for (const t of filteredAll) {
      const key = !t.due_date ? 'none' : t.due_date < today ? 'overdue' : t.due_date
      const arr = buckets.get(key)
      if (arr) arr.push(t)
      else buckets.set(key, [t])
    }
    const rank = (k: string) => (k === 'overdue' ? '0000-00-00' : k === 'none' ? '9999-99-99' : k)
    return [...buckets.keys()]
      .sort((a, b) => rank(a).localeCompare(rank(b)))
      .map((key) => ({
        key,
        label: key === 'overdue' ? 'Overdue' : key === 'none' ? 'No date' : dayLabel(key, today, tomorrow),
        overdue: key === 'overdue',
        spansDates: key === 'overdue' || key === 'none',
        tasks: buckets.get(key)!.slice().sort(
          (a, b) =>
            (a.due_date ?? '').localeCompare(b.due_date ?? '') ||
            (a.due_time ?? '').localeCompare(b.due_time ?? '') ||
            categoryMeta(a.category).sort - categoryMeta(b.category).sort ||
            a.title.localeCompare(b.title),
        ),
      }))
  }, [filteredAll, today, tomorrow])

  // Per-category counts for the chip strip, from the current tab's base list.
  const categoryCounts = useMemo(() => {
    const src = tab === 'today' ? todayBase : allBase
    const counts: Partial<Record<TaskCategory, number>> = {}
    for (const t of src) counts[t.category] = (counts[t.category] ?? 0) + 1
    return counts
  }, [tab, todayBase, allBase])

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
  // Station + category are always visible (segmented switch + chip strip), so
  // the Filters badge only counts the collapsed axes: person / kind.
  const activeFilterCount =
    (personFilter !== 'all' ? 1 : 0) +
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

        {showFilters && (
          <StationSegmented value={stationFilter} onSelect={setStationFilter} />
        )}

        {showCategoryRow && (
          <CategoryChipStrip
            counts={categoryCounts}
            value={categoryFilter}
            onSelect={setCategoryFilter}
          />
        )}

        {showFilters && filtersOpen && (
          <div className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-900/40 p-2.5">
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
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ListTodo className="h-4 w-4 text-emerald-400" />
            <span className="font-medium text-slate-200">Today's tasks</span>
            <span className="text-slate-600">·</span>
            <span>{doneToday}/{todayTasks.length} done</span>
          </div>

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
            <DayScopeSegmented value={dayScope} onSelect={selectDayScope} />
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

          {dayGroups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-xs text-slate-600">
              No tasks match these filters.
            </p>
          ) : (
            <div className="space-y-4">
              {dayGroups.map((group) => {
                const total = group.tasks.length
                const doneN = group.tasks.filter((t) => t.status === 'done').length
                const collapsed = collapsedDays.has(group.key)
                return (
                  <div key={group.key}>
                    <button
                      type="button"
                      onClick={() => toggleDay(group.key)}
                      className="mb-1.5 flex w-full items-center gap-2 px-1 text-left"
                    >
                      <span
                        className={`text-sm font-semibold ${
                          group.overdue ? 'text-rose-300' : 'text-slate-200'
                        }`}
                      >
                        {group.label}
                      </span>
                      <span className="ml-auto rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-300">
                        {doneN}/{total}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-slate-500 transition-transform ${collapsed ? '-rotate-90' : ''}`}
                      />
                    </button>
                    {!collapsed && (
                      <div className="space-y-1.5">
                        {group.tasks.map((t) => (
                          <TaskRow
                            key={t.id}
                            task={t}
                            showDate={group.spansDates}
                            onOpen={openView}
                            onToggleDone={toggleDone}
                            onPhotosChange={handlePhotosChange}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
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
