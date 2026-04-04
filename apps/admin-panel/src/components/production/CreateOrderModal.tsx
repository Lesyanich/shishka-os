import { useCallback, useEffect, useState } from 'react'
import { X, Calculator, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useRecipeSteps } from '../../hooks/useRecipeSteps'
import {
  backwardSchedule,
  totalScheduleDuration,
  type ScheduledStep,
} from '../../lib/backwardSchedule'
import type { CreateProductionOrderInput, ProductionOrderPriority } from '../../hooks/useProductionOrders'

// ─── Types ───────────────────────────────────────────────────────

interface NomItem {
  id: string
  product_code: string
  name: string
  base_unit: string
}

interface CreateOrderModalProps {
  open: boolean
  onClose: () => void
  onCreate: (input: CreateProductionOrderInput) => Promise<unknown>
}

// ─── Component ───────────────────────────────────────────────────

export function CreateOrderModal({ open, onClose, onCreate }: CreateOrderModalProps) {
  const [items, setItems] = useState<NomItem[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [targetQty, setTargetQty] = useState(1)
  const [targetUnit, setTargetUnit] = useState('')
  const [deadlineDate, setDeadlineDate] = useState('')
  const [deadlineTime, setDeadlineTime] = useState('12:00')
  const [priority, setPriority] = useState<ProductionOrderPriority>(0)
  const [notes, setNotes] = useState('')

  const [schedulePreview, setSchedulePreview] = useState<ScheduledStep[] | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const { fetchSteps } = useRecipeSteps()

  // Fetch PF-% and SALE-% items
  useEffect(() => {
    if (!open) return
    ;(async () => {
      const { data } = await supabase
        .from('nomenclature')
        .select('id, product_code, name, base_unit')
        .or('product_code.ilike.PF-%,product_code.ilike.SALE-%')
        .eq('is_deleted', false)
        .order('product_code')
      setItems((data ?? []) as NomItem[])
    })()
  }, [open])

  // Auto-fill unit when product changes
  useEffect(() => {
    const item = items.find((i) => i.id === selectedId)
    if (item) setTargetUnit(item.base_unit)
  }, [selectedId, items])

  // Set default deadline to tomorrow noon
  useEffect(() => {
    if (open && !deadlineDate) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      setDeadlineDate(tomorrow.toISOString().slice(0, 10))
    }
  }, [open, deadlineDate])

  const handleCalculate = useCallback(async () => {
    if (!selectedId || !deadlineDate) return
    setIsCalculating(true)

    const steps = await fetchSteps(selectedId)
    if (steps.length === 0) {
      setSchedulePreview([])
      setIsCalculating(false)
      return
    }

    const item = items.find((i) => i.id === selectedId)
    const deadline = new Date(`${deadlineDate}T${deadlineTime}:00`)

    const scheduled = backwardSchedule(
      steps,
      deadline,
      selectedId,
      item?.product_code ?? '',
      item?.name ?? '',
      { target_qty: targetQty, buffer_pct: 10 },
    )

    setSchedulePreview(scheduled)
    setIsCalculating(false)
  }, [selectedId, deadlineDate, deadlineTime, targetQty, items, fetchSteps])

  const handleCreate = useCallback(async () => {
    if (!selectedId || !deadlineDate) return
    setIsCreating(true)

    const deadlineIso = new Date(`${deadlineDate}T${deadlineTime}:00`).toISOString()

    let estimatedStartAt: string | undefined
    let estimatedDurationMin: number | undefined
    if (schedulePreview && schedulePreview.length > 0) {
      const dur = totalScheduleDuration(schedulePreview)
      estimatedStartAt = dur.earliest_start?.toISOString()
      estimatedDurationMin = Math.round(dur.total_min)
    }

    await onCreate({
      nomenclature_id: selectedId,
      target_qty: targetQty,
      target_unit: targetUnit,
      deadline_at: deadlineIso,
      priority,
      notes: notes || undefined,
      estimated_start_at: estimatedStartAt,
      estimated_duration_min: estimatedDurationMin,
    })

    // Reset form
    setSelectedId('')
    setTargetQty(1)
    setTargetUnit('')
    setDeadlineDate('')
    setDeadlineTime('12:00')
    setPriority(0)
    setNotes('')
    setSchedulePreview(null)
    setIsCreating(false)
    onClose()
  }, [selectedId, targetQty, targetUnit, deadlineDate, deadlineTime, priority, notes, schedulePreview, onCreate, onClose])

  if (!open) return null

  const duration = schedulePreview ? totalScheduleDuration(schedulePreview) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">New Production Order</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-3 p-4">
          {/* Product select */}
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Product</label>
            <select
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value)
                setSchedulePreview(null)
              }}
              className="h-8 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
            >
              <option value="">Select product (PF / SALE)...</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.product_code} — {i.name}
                </option>
              ))}
            </select>
          </div>

          {/* Qty + Unit */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Quantity</label>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={targetQty}
                onChange={(e) => setTargetQty(parseFloat(e.target.value) || 1)}
                className="h-8 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Unit</label>
              <input
                type="text"
                value={targetUnit}
                onChange={(e) => setTargetUnit(e.target.value)}
                className="h-8 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 focus:outline-none"
                readOnly
              />
            </div>
          </div>

          {/* Deadline */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Deadline date</label>
              <input
                type="date"
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
                className="h-8 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Deadline time</label>
              <input
                type="time"
                value={deadlineTime}
                onChange={(e) => setDeadlineTime(e.target.value)}
                className="h-8 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 focus:outline-none"
              />
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) as ProductionOrderPriority)}
              className="h-8 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
            >
              <option value={0}>Normal</option>
              <option value={1}>High</option>
              <option value={2}>Urgent</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Special instructions..."
              className="h-8 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 focus:outline-none"
            />
          </div>

          {/* Calculate schedule button */}
          <button
            type="button"
            onClick={handleCalculate}
            disabled={!selectedId || isCalculating}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-40"
          >
            {isCalculating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Calculator className="h-3.5 w-3.5" />
            )}
            Calculate Schedule
          </button>

          {/* Schedule preview */}
          {schedulePreview && schedulePreview.length > 0 && duration && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 space-y-1.5">
              <p className="text-[11px] font-medium text-slate-200">Schedule Preview</p>
              <div className="grid grid-cols-3 gap-1 text-[10px] text-slate-400">
                <span>Total: <span className="text-slate-100">{Math.round(duration.total_min)} min</span></span>
                <span>Active: <span className="text-amber-300">{Math.round(duration.active_min)} min</span></span>
                <span>Passive: <span className="text-sky-300">{Math.round(duration.passive_min)} min</span></span>
              </div>
              {duration.earliest_start && (
                <p className="text-[10px] text-slate-400">
                  Start by: <span className="text-emerald-300">
                    {duration.earliest_start.toLocaleString('en-GB', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </p>
              )}
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {schedulePreview.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-[10px]">
                    <span className={`${s.is_passive ? 'text-sky-400' : 'text-amber-400'}`}>
                      {s.step.step_order}. {s.step.operation_name}
                    </span>
                    <span className="text-slate-500">{s.step.duration_min} min</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {schedulePreview && schedulePreview.length === 0 && (
            <p className="text-[11px] text-slate-500 text-center py-2">
              No recipe steps found for this product
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!selectedId || !deadlineDate || isCreating}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 transition-colors disabled:opacity-40"
          >
            {isCreating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create Order
          </button>
        </div>
      </div>
    </div>
  )
}
