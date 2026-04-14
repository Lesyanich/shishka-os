import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useCook } from '../contexts/CookContext'
import { useCookTasks } from '../hooks/useCookTasks'
import { useRecipeSteps } from '../hooks/useRecipeSteps'
import { StepWizard } from '../components/StepWizard'
import { TaskComplete } from '../components/TaskComplete'

type Phase = 'loading' | 'wizard' | 'complete'

export function TaskPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { cook } = useCook()
  const { tasks, startTask, setGrossWeight } = useCookTasks(cook?.id ?? null)
  const { steps, isLoading: stepsLoading, fetchSteps } = useRecipeSteps()

  const [phase, setPhase] = useState<Phase>('loading')

  const task = tasks.find(t => t.id === id)

  // Load recipe steps when task is available
  useEffect(() => {
    if (!task?.target_nomenclature_id) return
    fetchSteps(task.target_nomenclature_id).then(loaded => {
      if (loaded.length > 0) setPhase('wizard')
      else setPhase('wizard') // still show wizard even without steps
    })
  }, [task?.target_nomenclature_id, fetchSteps])

  // Auto-start if pending
  useEffect(() => {
    if (task?.status === 'pending') {
      startTask(task.id)
    }
  }, [task?.id, task?.status, startTask])

  // Redirect if task is completed
  useEffect(() => {
    if (task?.status === 'completed') {
      navigate('/dashboard', { replace: true })
    }
  }, [task?.status, navigate])

  const handleWizardComplete = useCallback(() => {
    setPhase('complete')
  }, [])

  const handleTaskDone = useCallback(() => {
    navigate('/dashboard', { replace: true })
  }, [navigate])

  // Loading state
  if (!task || stepsLoading || phase === 'loading') {
    return (
      <div className="flex h-dvh flex-col items-center justify-center">
        <Loader2 className="mb-4 h-8 w-8 animate-spin text-emerald-500" />
        <p className="text-sm text-slate-500">Loading task...</p>
      </div>
    )
  }

  // Task Complete phase
  if (phase === 'complete') {
    return (
      <div>
        <div className="px-4 pt-4">
          <button
            type="button"
            onClick={() => setPhase('wizard')}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300 transition"
          >
            <ArrowLeft className="h-4 w-4" /> Back to steps
          </button>
        </div>
        <TaskComplete task={task} onDone={handleTaskDone} />
      </div>
    )
  }

  // Wizard phase
  return (
    <div>
      <div className="px-4 pt-4">
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </button>
      </div>

      {steps.length > 0 ? (
        <StepWizard
          task={task}
          steps={steps}
          onSetGrossWeight={setGrossWeight}
          onComplete={handleWizardComplete}
        />
      ) : (
        <div className="px-4 py-8 text-center">
          <p className="text-lg text-slate-400">No recipe steps defined</p>
          <p className="mt-1 text-sm text-slate-600">
            This product has no process flow. You can complete it directly.
          </p>
          <button
            type="button"
            onClick={handleWizardComplete}
            className="mt-6 rounded-xl bg-emerald-600 px-8 py-3 text-base font-bold text-white"
          >
            Go to Complete
          </button>
        </div>
      )}
    </div>
  )
}
