import { RefreshCw, CalendarDays, ChefHat } from 'lucide-react'
import { useGanttTasks } from '../hooks/useGanttTasks'
import { useEquipmentCategories } from '../hooks/useEquipmentCategories'
import { GanttTimeline } from '../components/kds/GanttTimeline'
import { EquipmentFilter } from '../components/kds/EquipmentFilter'
import { CookStationPanel } from '../components/kds/CookStationPanel'
import { KitchenNav } from '../components/KitchenNav'
import { useTabParam } from '../hooks/useTabParam'

/**
 * Kitchen board — one surface over `production_tasks`, two views.
 *
 * `schedule` plans the day (Gantt against equipment), `cook` executes it (start
 * a task, walk its recipe steps, close it into batches). They were two nav
 * entries, `/kitchen/schedule` and `/kitchen/tasks`, over the same table; the
 * split meant a cook could stand on the planning board wondering where the
 * start button went. `/kitchen/tasks` now redirects here.
 */
export const VIEWS = ['schedule', 'cook'] as const

export function KDSBoard() {
  const [view, setView] = useTabParam(VIEWS, 'schedule')
  const { tasks, conflicts, isLoading: tasksLoading, error: tasksError, refetch } = useGanttTasks()
  const {
    equipment,
    categories,
    selectedCategory,
    setSelectedCategory,
    isLoading: eqLoading,
  } = useEquipmentCategories()

  const filteredEquipment = selectedCategory
    ? equipment.filter((eq) => eq.category === selectedCategory)
    : equipment

  const isLoading = tasksLoading || eqLoading

  return (
    <div className="space-y-4">
      <KitchenNav />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Kitchen KDS</h1>
          <p className="text-xs text-slate-500">
            {view === 'schedule' ? 'Gantt scheduling' : 'Cook station'} ·{' '}
            {tasks.length} task{tasks.length !== 1 ? 's' : ''} today
            {conflicts.length > 0 && view === 'schedule' && (
              <span className="ml-2 text-rose-400">
                · {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        {view === 'schedule' && (
          <button
            onClick={refetch}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        )}
      </div>

      {/* View switch — driven by ?tab= so both views stay linkable */}
      <div className="flex items-center gap-1 text-xs">
        {VIEWS.map((key) => {
          const Icon = key === 'schedule' ? CalendarDays : ChefHat
          const active = view === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={[
                'flex items-center gap-1 rounded-md px-2.5 py-1.5 transition',
                active ? 'bg-slate-800 text-emerald-300' : 'text-slate-500 hover:text-slate-300',
              ].join(' ')}
            >
              <Icon className="h-3 w-3" />
              {key === 'schedule' ? 'Schedule' : 'Cook Station'}
            </button>
          )
        })}
      </div>

      {view === 'schedule' ? (
        <>
          <EquipmentFilter
            categories={categories}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
          />
          <GanttTimeline
            tasks={tasks}
            equipment={filteredEquipment}
            conflicts={conflicts}
            isLoading={isLoading}
            error={tasksError}
          />
        </>
      ) : (
        <CookStationPanel />
      )}
    </div>
  )
}
