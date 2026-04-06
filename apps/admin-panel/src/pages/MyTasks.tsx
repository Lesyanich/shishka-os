import { useCallback, useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useRecipeSteps, type RecipeStep } from '../hooks/useRecipeSteps'
import { RecipeStepCard } from '../components/kds/RecipeStepCard'
import { KitchenNav } from '../components/KitchenNav'
import { FeedbackFAB } from '../components/kitchen/FeedbackFAB'
import {
  ChefHat, ArrowLeft, Play, Clock, Camera, SkipForward,
  CheckCircle2, Package, Tag,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────

interface MyTask {
  id: string
  description: string | null
  status: string
  scheduled_start: string | null
  duration_min: number | null
  equipment_id: string | null
  actual_start: string | null
  actual_end: string | null
  actual_weight: number | null
  theoretical_yield: number | null
  target_nomenclature_id: string | null
  target_quantity: number | null
  assigned_to: string | null
  product_name: string | null
  product_code: string | null
  equipment_name: string | null
}

interface BatchResult {
  ok: boolean
  batches?: { batch_id: string; barcode: string; batch_code: string; weight: number; expires_at: string }[]
  product_name?: string
  product_code?: string
  total_weight?: number
  batch_count?: number
  error?: string
}

// ─── Photo compression helper ───────────────────────────────────

function compressPhoto(file: File, maxWidth: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas not supported')); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Compression failed')),
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })
}

// ─── Component ──────────────────────────────────────────────────

export function MyTasks() {
  const navigate = useNavigate()
  const cookId = sessionStorage.getItem('cook_staff_id')
  const cookName = sessionStorage.getItem('cook_staff_name')

  const [tasks, setTasks] = useState<MyTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  // Task execution state
  const [activeTask, setActiveTask] = useState<MyTask | null>(null)
  const [recipeSteps, setRecipeSteps] = useState<RecipeStep[]>([])
  const [currentStepIdx, setCurrentStepIdx] = useState(0)

  // Completion flow state
  const [completionTask, setCompletionTask] = useState<MyTask | null>(null)
  const [completionStep, setCompletionStep] = useState<'weight' | 'photo' | 'label'>('weight')
  const [weightInput, setWeightInput] = useState('')
  const [tempInput, setTempInput] = useState('')
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [showSkipMenu, setShowSkipMenu] = useState(false)
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { fetchSteps } = useRecipeSteps()

  // ─── Redirect to login if no cook session ───────────────────
  useEffect(() => {
    if (!cookId) navigate('/cook-login')
  }, [cookId, navigate])

  // ─── Fetch tasks ────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const query = supabase
      .from('production_tasks')
      .select('id, description, status, scheduled_start, duration_min, equipment_id, actual_start, actual_end, actual_weight, theoretical_yield, target_nomenclature_id, target_quantity, assigned_to, nomenclature!target_nomenclature_id(name, product_code), equipment:equipment_id(name)')
      .in('status', ['pending', 'in_progress'])
      .order('scheduled_start', { ascending: true, nullsFirst: false })

    // Filter by assigned cook unless showing all
    if (!showAll && cookId) {
      query.eq('assigned_to', cookId)
    }

    const { data, error: fetchErr } = await query

    if (fetchErr) {
      setError(fetchErr.message)
    } else {
      const mapped: MyTask[] = (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        description: row.description as string | null,
        status: row.status as string,
        scheduled_start: row.scheduled_start as string | null,
        duration_min: row.duration_min as number | null,
        equipment_id: row.equipment_id as string | null,
        actual_start: row.actual_start as string | null,
        actual_end: row.actual_end as string | null,
        actual_weight: row.actual_weight as number | null,
        theoretical_yield: row.theoretical_yield as number | null,
        target_nomenclature_id: row.target_nomenclature_id as string | null,
        target_quantity: row.target_quantity as number | null,
        assigned_to: row.assigned_to as string | null,
        product_name: (row.nomenclature as { name: string } | null)?.name ?? null,
        product_code: (row.nomenclature as { product_code: string } | null)?.product_code ?? null,
        equipment_name: (row.equipment as { name: string } | null)?.name ?? null,
      }))
      setTasks(mapped)
    }
    setIsLoading(false)
  }, [showAll, cookId])

  useEffect(() => {
    fetchTasks()
    const channel = supabase
      .channel('my-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_tasks' }, () => fetchTasks())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchTasks])

  // ─── Actions ────────────────────────────────────────────────
  const handleStart = useCallback(async (taskId: string) => {
    const { error: rpcErr } = await supabase.rpc('fn_start_production_task', { p_task_id: taskId })
    if (rpcErr) setError(rpcErr.message)
  }, [])

  const openRecipe = useCallback(async (task: MyTask) => {
    if (!task.target_nomenclature_id) return
    const loaded = await fetchSteps(task.target_nomenclature_id)
    if (loaded.length > 0) {
      setRecipeSteps(loaded)
      setActiveTask(task)
      setCurrentStepIdx(0)
    }
  }, [fetchSteps])

  const startCompletion = useCallback((task: MyTask) => {
    setCompletionTask(task)
    setCompletionStep('weight')
    setWeightInput('')
    setTempInput('')
    setPhotoBlob(null)
    setPhotoPreview(null)
    setShowSkipMenu(false)
    setBatchResult(null)
    setSubmitError(null)
  }, [])

  const handlePhotoCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const compressed = await compressPhoto(file, 1200, 0.7)
      setPhotoBlob(compressed)
      setPhotoPreview(URL.createObjectURL(compressed))
    } catch {
      setSubmitError('Failed to process photo')
    }
  }, [])

  const handleSkipPhoto = useCallback((reason: string) => {
    setShowSkipMenu(false)
    setCompletionStep('label')
    submitBatches(reason)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const submitBatches = useCallback(async (photoSkipReason?: string) => {
    if (!completionTask) return
    setIsSubmitting(true)
    setSubmitError(null)

    const weight = parseFloat(weightInput)
    if (isNaN(weight) || weight <= 0) {
      setSubmitError('Enter a valid weight')
      setIsSubmitting(false)
      return
    }

    // Upload photo if present
    let photoUrl: string | null = null
    if (photoBlob && !photoSkipReason) {
      const batchCode = `task-${completionTask.id}-${Date.now()}`
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('batch-photos')
        .upload(`${batchCode}.jpg`, photoBlob, { contentType: 'image/jpeg' })

      if (uploadErr) {
        // Storage bucket may not exist yet — log but don't block
        console.warn('[MyTasks] photo upload failed:', uploadErr.message)
      } else if (uploadData) {
        const { data: urlData } = supabase.storage.from('batch-photos').getPublicUrl(uploadData.path)
        photoUrl = urlData.publicUrl
      }
    }

    // Create batches via RPC
    const { data, error: rpcErr } = await supabase.rpc('fn_create_batches_from_task', {
      p_task_id: completionTask.id,
      p_containers: [{ weight }],
      p_produced_by: cookId,
    })

    if (rpcErr) {
      setSubmitError(rpcErr.message)
      setIsSubmitting(false)
      return
    }

    const result = data as BatchResult
    if (!result.ok) {
      setSubmitError(result.error ?? 'Failed to create batch')
      setIsSubmitting(false)
      return
    }

    // Update photo and temperature on the batch records
    if (result.batches && result.batches.length > 0) {
      for (const b of result.batches) {
        const updates: Record<string, unknown> = {}
        if (photoUrl) updates.photo_url = photoUrl
        if (photoSkipReason) updates.photo_skipped_reason = photoSkipReason
        if (Object.keys(updates).length > 0) {
          await supabase.from('inventory_batches').update(updates).eq('id', b.batch_id)
        }
      }
    }

    // Update temperature on task if provided
    if (tempInput) {
      await supabase.from('production_tasks').update({ actual_temperature: parseFloat(tempInput) }).eq('id', completionTask.id)
    }

    setBatchResult(result)
    setCompletionStep('label')
    setIsSubmitting(false)
  }, [completionTask, weightInput, tempInput, photoBlob, cookId])

  const closeCompletion = useCallback(() => {
    setCompletionTask(null)
    setBatchResult(null)
    setActiveTask(null)
    setRecipeSteps([])
    if (photoPreview) URL.revokeObjectURL(photoPreview)
  }, [photoPreview])

  // ─── Timer helper ───────────────────────────────────────────
  function formatElapsed(start: string | null): string {
    if (!start) return ''
    const sec = Math.floor((Date.now() - new Date(start).getTime()) / 1000)
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  // ═══ RENDER: Label Info screen ════════════════════════════════
  if (completionTask && completionStep === 'label' && batchResult?.ok) {
    const batch = batchResult.batches?.[0]
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center space-y-6 px-4">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
            <Tag className="h-7 w-7 text-emerald-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-100">Label Info</h2>
          <p className="text-xs text-slate-500">Write this on the bag with marker</p>
        </div>

        <div className="w-full rounded-2xl border-2 border-dashed border-emerald-500/40 bg-emerald-500/5 p-6 text-center space-y-3">
          <p className="text-2xl font-bold text-slate-100">
            {batchResult.product_name ?? completionTask.product_name}
          </p>
          {batch?.batch_code && (
            <p className="font-mono text-3xl font-black tracking-widest text-emerald-300">
              {batch.batch_code}
            </p>
          )}
          <div className="flex justify-center gap-6 text-sm">
            <div>
              <p className="text-slate-500">Produced</p>
              <p className="font-semibold text-slate-200">
                {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </p>
            </div>
            {batch?.expires_at && (
              <div>
                <p className="text-slate-500">Expires</p>
                <p className="font-semibold text-amber-300">
                  {new Date(batch.expires_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </p>
              </div>
            )}
            <div>
              <p className="text-slate-500">Weight</p>
              <p className="font-semibold text-slate-200">{batch?.weight?.toFixed(2)} kg</p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={closeCompletion}
          className="w-full rounded-2xl bg-emerald-600 py-4 text-base font-bold text-white transition hover:bg-emerald-500 active:scale-[0.98]"
        >
          Done
        </button>
      </div>
    )
  }

  // ═══ RENDER: Photo capture screen ═════════════════════════════
  if (completionTask && completionStep === 'photo') {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center space-y-6 px-4">
        <h2 className="text-lg font-bold text-slate-100">Take a photo of the batch</h2>
        <p className="text-xs text-slate-500">Photo is required for quality control</p>

        {photoPreview ? (
          <div className="space-y-4 text-center">
            <img src={photoPreview} alt="Batch photo" className="mx-auto max-h-64 rounded-2xl border border-slate-700" />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setPhotoBlob(null); setPhotoPreview(null); fileInputRef.current?.click() }}
                className="flex-1 rounded-xl border border-slate-700 py-3 text-sm text-slate-300 transition hover:bg-slate-800"
              >
                Retake
              </button>
              <button
                type="button"
                onClick={() => { setCompletionStep('label'); submitBatches() }}
                disabled={isSubmitting}
                className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 w-full">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-sky-500/40 bg-sky-500/5 py-12 transition hover:border-sky-500/60"
            >
              <Camera className="h-12 w-12 text-sky-400" />
              <span className="text-sm font-medium text-sky-300">Open Camera</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoCapture}
            />
          </div>
        )}

        {/* Skip photo option */}
        {!photoPreview && (
          <div className="w-full">
            {!showSkipMenu ? (
              <button
                type="button"
                onClick={() => setShowSkipMenu(true)}
                className="flex w-full items-center justify-center gap-2 py-2 text-xs text-slate-500 hover:text-slate-300 transition"
              >
                <SkipForward className="h-3 w-3" /> Skip photo
              </button>
            ) : (
              <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-3">
                <p className="text-xs text-slate-400">Reason for skipping:</p>
                {['Camera broken', 'Hands too dirty', 'Other'].map(reason => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => handleSkipPhoto(reason)}
                    disabled={isSubmitting}
                    className="w-full rounded-lg bg-slate-800 px-3 py-2 text-left text-xs text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
                  >
                    {reason}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {submitError && <p className="text-xs text-rose-400">{submitError}</p>}
      </div>
    )
  }

  // ═══ RENDER: Weight input screen ══════════════════════════════
  if (completionTask && completionStep === 'weight') {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center space-y-6 px-4">
        <div className="text-center">
          <Package className="mx-auto mb-2 h-8 w-8 text-sky-400" />
          <h2 className="text-lg font-bold text-slate-100">
            {completionTask.product_name ?? 'Complete Task'}
          </h2>
          <p className="text-xs text-slate-500">Enter the actual weight produced</p>
        </div>

        <div className="w-full space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Weight (kg)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={weightInput}
              onChange={e => setWeightInput(e.target.value)}
              placeholder="0.00"
              autoFocus
              className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-6 py-5 text-center text-3xl font-bold text-slate-100 placeholder-slate-600 outline-none focus:border-emerald-500"
            />
            {completionTask.theoretical_yield != null && (
              <p className="mt-1 text-center text-xs text-slate-500">
                Expected: {completionTask.theoretical_yield} kg
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">Temperature (optional)</label>
            <input
              type="number"
              step="0.1"
              value={tempInput}
              onChange={e => setTempInput(e.target.value)}
              placeholder="°C"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-center text-lg text-slate-100 placeholder-slate-600 outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {submitError && <p className="text-xs text-rose-400">{submitError}</p>}

        <div className="flex w-full gap-3">
          <button
            type="button"
            onClick={() => setCompletionTask(null)}
            className="flex-1 rounded-xl border border-slate-700 py-3 text-sm text-slate-300 transition hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setCompletionStep('photo')}
            disabled={!weightInput || parseFloat(weightInput) <= 0}
            className="flex-1 rounded-xl bg-sky-600 py-3 text-sm font-bold text-white transition hover:bg-sky-500 disabled:opacity-40"
          >
            Next: Photo
          </button>
        </div>
      </div>
    )
  }

  // ═══ RENDER: Recipe step-by-step view ═════════════════════════
  if (activeTask && recipeSteps.length > 0) {
    const currentStep = recipeSteps[currentStepIdx]
    const isLastStep = currentStepIdx >= recipeSteps.length - 1
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => { setActiveTask(null); setRecipeSteps([]) }}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <span className="text-xs text-slate-500">{activeTask.product_name}</span>
        </div>

        {/* Progress dots */}
        <div className="flex gap-1">
          {recipeSteps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition ${
                i < currentStepIdx ? 'bg-emerald-500' : i === currentStepIdx ? 'bg-amber-500' : 'bg-slate-800'
              }`}
            />
          ))}
        </div>

        {currentStep && (
          <RecipeStepCard
            step={currentStep}
            stepIndex={currentStepIdx}
            totalSteps={recipeSteps.length}
            onPrev={() => setCurrentStepIdx(i => Math.max(0, i - 1))}
            onNext={() => setCurrentStepIdx(i => Math.min(recipeSteps.length - 1, i + 1))}
            onDone={() => {
              if (isLastStep) {
                startCompletion(activeTask)
              } else {
                setCurrentStepIdx(i => i + 1)
              }
            }}
          />
        )}
      </div>
    )
  }

  // ═══ RENDER: Task list ════════════════════════════════════════
  const pending = tasks.filter(t => t.status === 'pending')
  const active = tasks.filter(t => t.status === 'in_progress')

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-4">
      <KitchenNav />

      {/* Header */}
      <div className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
          <ChefHat className="h-6 w-6 text-emerald-400" />
        </div>
        <h1 className="text-lg font-bold text-slate-100">
          {cookName ? `${cookName}'s Tasks` : 'My Tasks'}
        </h1>
        <p className="text-xs text-slate-500">
          {active.length} active · {pending.length} pending
        </p>
      </div>

      {/* My Tasks / All toggle */}
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${!showAll ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}
        >
          My Tasks
        </button>
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${showAll ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}
        >
          All Tasks
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-center text-sm text-rose-300">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-800/50" />
          ))}
        </div>
      )}

      {/* Active tasks */}
      {!isLoading && active.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-sky-400">In Progress</h2>
          {active.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              formatElapsed={formatElapsed}
              onOpenRecipe={openRecipe}
              onComplete={startCompletion}
            />
          ))}
        </div>
      )}

      {/* Pending tasks */}
      {!isLoading && pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-400">Pending</h2>
          {pending.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              formatElapsed={formatElapsed}
              onStart={handleStart}
              onOpenRecipe={openRecipe}
            />
          ))}
        </div>
      )}

      {!isLoading && tasks.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-slate-500">No tasks assigned</p>
          <p className="text-xs text-slate-600">Tasks appear when scheduled by the manager</p>
        </div>
      )}

      {/* Feedback FAB — always visible */}
      <FeedbackFAB
        staffId={cookId}
        activeTaskId={activeTask?.id ?? null}
      />
    </div>
  )
}

// ─── Task Card sub-component ────────────────────────────────────

function TaskCard({
  task,
  formatElapsed,
  onStart,
  onOpenRecipe,
  onComplete,
}: {
  task: MyTask
  formatElapsed: (start: string | null) => string
  onStart?: (taskId: string) => Promise<void>
  onOpenRecipe: (task: MyTask) => Promise<void>
  onComplete?: (task: MyTask) => void
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
      <div className="mb-2 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-100">
            {task.product_name ?? task.description ?? 'Task'}
          </p>
          <p className="text-[10px] text-slate-500">
            {task.product_code ?? task.id.slice(0, 8)}
            {task.target_quantity ? ` · ${task.target_quantity} kg` : ''}
            {task.equipment_name ? ` · ${task.equipment_name}` : ''}
          </p>
        </div>
        {task.scheduled_start && (
          <span className="ml-2 shrink-0 text-xs text-slate-500">
            {new Date(task.scheduled_start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Timer for in_progress */}
      {task.status === 'in_progress' && task.actual_start && (
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-sky-400" />
          <span className="font-mono text-lg font-bold text-sky-300">{formatElapsed(task.actual_start)}</span>
          {task.duration_min && (
            <span className="text-xs text-slate-500">/ {task.duration_min} min</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {task.status === 'pending' && onStart && (
          <button
            type="button"
            onClick={() => onStart(task.id)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.98]"
          >
            <Play className="h-4 w-4" /> Start
          </button>
        )}
        {task.status === 'in_progress' && (
          <>
            {task.target_nomenclature_id && (
              <button
                type="button"
                onClick={() => onOpenRecipe(task)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/5 py-3 text-sm text-sky-300 transition hover:bg-sky-500/10"
              >
                Recipe Steps
              </button>
            )}
            {onComplete && (
              <button
                type="button"
                onClick={() => onComplete(task)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white transition hover:bg-sky-500 active:scale-[0.98]"
              >
                <CheckCircle2 className="h-4 w-4" /> Complete
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
