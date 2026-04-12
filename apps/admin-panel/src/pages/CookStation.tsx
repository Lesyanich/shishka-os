import { useCallback, useState } from 'react'
import { useCookTasks, type CookTask } from '../hooks/useCookTasks'
import { useBatches } from '../hooks/useBatches'
import { useRecipeSteps, type RecipeStep } from '../hooks/useRecipeSteps'
import { TaskExecutionCard } from '../components/kds/TaskExecutionCard'
import { RecipeStepCard } from '../components/kds/RecipeStepCard'
import { BatchCompleteModal } from '../components/kds/BatchCompleteModal'
import { KitchenNav } from '../components/KitchenNav'
import { ChefHat, ArrowLeft } from 'lucide-react'

export function CookStation() {
  const { tasks, isLoading, error, startTask } = useCookTasks()
  const { createBatchesFromTask } = useBatches()
  const { steps: _steps, isLoading: stepsLoading, fetchSteps } = useRecipeSteps()

  const [activeTask, setActiveTask] = useState<CookTask | null>(null)
  const [currentStepIdx, setCurrentStepIdx] = useState(0)
  const [recipeSteps, setRecipeSteps] = useState<RecipeStep[]>([])
  const [showBatchModal, setShowBatchModal] = useState(false)

  const pendingTasks = tasks.filter((t) => t.status === 'pending')
  const activeTasks = tasks.filter((t) => t.status === 'in_progress')

  // Start task and auto-launch wizard if recipe steps exist
  const handleStartTask = useCallback(async (taskId: string) => {
    const result = await startTask(taskId)
    if (!result.ok) return result
    // Find the task to get nomenclature_id
    const task = tasks.find((t) => t.id === taskId)
    if (task?.target_nomenclature_id) {
      const loaded = await fetchSteps(task.target_nomenclature_id)
      if (loaded.length > 0) {
        setRecipeSteps(loaded)
        setActiveTask(task)
        setCurrentStepIdx(0)
      }
    }
    return result
  }, [startTask, tasks, fetchSteps])

  // Resume wizard for an already in_progress task
  const openRecipe = useCallback(async (task: CookTask) => {
    if (!task.target_nomenclature_id) return
    const loaded = await fetchSteps(task.target_nomenclature_id)
    if (loaded.length > 0) {
      setRecipeSteps(loaded)
      setActiveTask(task)
      setCurrentStepIdx(0)
    }
  }, [fetchSteps])

  const closeRecipe = useCallback(() => {
    setActiveTask(null)
    setRecipeSteps([])
    setCurrentStepIdx(0)
  }, [])

  // ─── Recipe step-by-step view ──────────────────────────────────

  if (activeTask && recipeSteps.length > 0) {
    const currentStep = recipeSteps[currentStepIdx]
    return (
      <div className="mx-auto max-w-lg space-y-4">
        {/* Back + progress */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={closeRecipe}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to tasks
          </button>
          <span className="text-xs text-slate-500">
            {activeTask.target_nomenclature?.name}
          </span>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1">
          {recipeSteps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < currentStepIdx
                  ? 'bg-emerald-500'
                  : i === currentStepIdx
                    ? 'bg-amber-500'
                    : 'bg-slate-800'
              }`}
            />
          ))}
        </div>

        {/* Step card */}
        {currentStep && (
          <RecipeStepCard
            step={currentStep}
            stepIndex={currentStepIdx}
            totalSteps={recipeSteps.length}
            onPrev={() => setCurrentStepIdx((i) => Math.max(0, i - 1))}
            onNext={() => setCurrentStepIdx((i) => Math.min(recipeSteps.length - 1, i + 1))}
            onDone={() => {
              if (currentStepIdx < recipeSteps.length - 1) {
                setCurrentStepIdx((i) => i + 1)
              } else {
                // Last step done → open batch completion
                setShowBatchModal(true)
              }
            }}
          />
        )}

        {/* Batch complete modal after wizard finishes */}
        {showBatchModal && activeTask && (
          <BatchCompleteModal
            taskId={activeTask.id}
            theoreticalYield={activeTask.theoretical_yield}
            onCompleteBatches={createBatchesFromTask}
            onClose={() => {
              setShowBatchModal(false)
              closeRecipe()
            }}
          />
        )}
      </div>
    )
  }

  // ─── Task list view ────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <KitchenNav />
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
          <ChefHat className="h-6 w-6 text-emerald-400" />
        </div>
        <h1 className="text-lg font-bold text-slate-100">Cook Station</h1>
        <p className="text-xs text-slate-500">
          {activeTasks.length} active · {pendingTasks.length} pending
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-center text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-800/50" />
          ))}
        </div>
      )}

      {/* Active tasks (in_progress first) */}
      {!isLoading && activeTasks.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-sky-400">
            In Progress
          </h2>
          {activeTasks.map((task) => (
            <div key={task.id} className="space-y-1">
              <TaskExecutionCard
                task={task}
                onStart={handleStartTask}
                onCompleteBatches={createBatchesFromTask}
              />
              {task.target_nomenclature_id ? (
                <button
                  type="button"
                  onClick={() => openRecipe(task)}
                  disabled={stepsLoading}
                  className="w-full rounded-lg border border-sky-500/20 bg-sky-500/5 py-1.5 text-[11px] text-sky-400 hover:bg-sky-500/10 transition-colors"
                >
                  {stepsLoading ? 'Loading…' : 'Resume Recipe Steps'}
                </button>
              ) : (
                <p className="text-center text-[11px] text-slate-500">
                  No process steps defined
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pending tasks */}
      {!isLoading && pendingTasks.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-400">
            Pending
          </h2>
          {pendingTasks.map((task) => (
            <TaskExecutionCard
              key={task.id}
              task={task}
              onStart={handleStartTask}
              onCompleteBatches={createBatchesFromTask}
            />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && tasks.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-slate-500">No tasks assigned</p>
          <p className="text-xs text-slate-600">
            Tasks will appear here when scheduled by the CEO
          </p>
        </div>
      )}
    </div>
  )
}
