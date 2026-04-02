import { useState, useRef, useCallback, useEffect } from 'react'
import {
  ScanLine,
  Check,
  AlertTriangle,
  ChevronLeft,
  Minus,
  Plus,
  CheckCheck,
} from 'lucide-react'
import type {
  PendingDelivery,
  ChecklistLine,
  RejectReason,
  ReceivingLineInput,
} from '../../types/procurement'

const REJECT_REASONS: { value: RejectReason; label: string }[] = [
  { value: 'short_delivery', label: 'Short' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'wrong_item', label: 'Wrong' },
  { value: 'quality_reject', label: 'Quality' },
  { value: 'expired', label: 'Expired' },
]

const SS_KEY = 'receiving_checklist_'

interface Props {
  delivery: PendingDelivery
  onBack: () => void
  onComplete: (lines: ReceivingLineInput[]) => void
  isSubmitting: boolean
}

function buildChecklist(delivery: PendingDelivery): ChecklistLine[] {
  return delivery.lines.map((l) => ({
    ...l,
    check_status: 'pending',
    actual_qty: 0,
    rejected_qty: 0,
    reject_reason: null,
    note: null,
  }))
}

function loadChecklist(delivery: PendingDelivery): ChecklistLine[] {
  try {
    const saved = sessionStorage.getItem(SS_KEY + delivery.po_id)
    if (saved) return JSON.parse(saved) as ChecklistLine[]
  } catch { /* ignore */ }
  return buildChecklist(delivery)
}

function saveChecklist(poId: string, lines: ChecklistLine[]) {
  try {
    sessionStorage.setItem(SS_KEY + poId, JSON.stringify(lines))
  } catch { /* ignore */ }
}

export function ReceivingChecklist({ delivery, onBack, onComplete, isSubmitting }: Props) {
  const [lines, setLines] = useState<ChecklistLine[]>(() => loadChecklist(delivery))
  const [flashIdx, setFlashIdx] = useState<number | null>(null)
  const [scanValue, setScanValue] = useState('')
  const scanRef = useRef<HTMLInputElement>(null)

  // Persist to sessionStorage on change
  useEffect(() => {
    saveChecklist(delivery.po_id, lines)
  }, [lines, delivery.po_id])

  // Focus scanner input on mount
  useEffect(() => {
    scanRef.current?.focus()
  }, [])

  const checkedCount = lines.filter((l) => l.check_status !== 'pending').length
  const totalCount = lines.length
  const allChecked = checkedCount === totalCount

  // ── Barcode scan handler ──
  const handleScan = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const code = scanValue.trim()
      if (!code) return

      const idx = lines.findIndex(
        (l) => l.barcode && l.barcode.toLowerCase() === code.toLowerCase(),
      )

      if (idx >= 0) {
        setLines((prev) => {
          const next = [...prev]
          const line = { ...next[idx] }
          line.actual_qty = Math.min(line.actual_qty + 1, line.qty_remaining)
          if (line.actual_qty >= line.qty_remaining) {
            line.check_status = 'ok'
          } else if (line.check_status === 'pending') {
            line.check_status = 'ok'
          }
          next[idx] = line
          return next
        })
        // Flash animation
        setFlashIdx(idx)
        setTimeout(() => setFlashIdx(null), 600)
      }

      setScanValue('')
      scanRef.current?.focus()
    },
    [scanValue, lines],
  )

  // ── Mark line as OK (one tap) ──
  const handleOk = useCallback((idx: number) => {
    setLines((prev) => {
      const next = [...prev]
      const line = { ...next[idx] }
      line.check_status = 'ok'
      line.actual_qty = line.qty_remaining
      line.rejected_qty = 0
      line.reject_reason = null
      line.note = null
      next[idx] = line
      return next
    })
  }, [])

  // ── Toggle issue mode ──
  const handleToggleIssue = useCallback((idx: number) => {
    setLines((prev) => {
      const next = [...prev]
      const line = { ...next[idx] }
      if (line.check_status === 'issue') {
        // Reset to pending
        line.check_status = 'pending'
        line.actual_qty = 0
        line.rejected_qty = 0
        line.reject_reason = null
        line.note = null
      } else {
        line.check_status = 'issue'
        line.actual_qty = line.qty_remaining
        line.rejected_qty = 0
      }
      next[idx] = line
      return next
    })
  }, [])

  // ── Update issue details ──
  const updateLine = useCallback((idx: number, patch: Partial<ChecklistLine>) => {
    setLines((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }, [])

  // ── Accept all remaining ──
  const handleAcceptAll = useCallback(() => {
    setLines((prev) =>
      prev.map((l) =>
        l.check_status === 'pending'
          ? { ...l, check_status: 'ok' as const, actual_qty: l.qty_remaining, rejected_qty: 0, reject_reason: null, note: null }
          : l,
      ),
    )
  }, [])

  // ── Complete receiving ──
  const handleComplete = useCallback(() => {
    const result: ReceivingLineInput[] = lines.map((l) => ({
      po_line_id: l.po_line_id,
      nomenclature_id: l.nomenclature_id,
      sku_id: l.sku_id,
      qty_expected: l.qty_remaining,
      qty_received: l.actual_qty,
      qty_rejected: l.rejected_qty,
      reject_reason: l.reject_reason,
      notes: l.note,
    }))
    onComplete(result)
    // Clear sessionStorage on submit
    sessionStorage.removeItem(SS_KEY + delivery.po_id)
  }, [lines, onComplete, delivery.po_id])

  return (
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-slate-400 transition hover:text-slate-100"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-slate-100">
            {delivery.po_number} — {delivery.supplier_name}
          </h2>
          <p className="text-xs text-slate-500">
            {checkedCount} of {totalCount} checked
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${totalCount > 0 ? (checkedCount / totalCount) * 100 : 0}%` }}
        />
      </div>

      {/* Barcode scanner */}
      <form onSubmit={handleScan}>
        <div className="relative">
          <ScanLine className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <input
            ref={scanRef}
            type="text"
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            placeholder="Scan barcode..."
            autoFocus
            className="w-full rounded-xl border border-slate-700 bg-slate-800 py-3 pl-11 pr-4 font-mono text-sm uppercase tracking-wider text-slate-100 placeholder-slate-600 outline-none focus:border-sky-500"
          />
        </div>
      </form>

      {/* Items list */}
      <div className="space-y-2">
        {lines.map((line, idx) => {
          const isFlashing = flashIdx === idx
          return (
            <div
              key={line.po_line_id}
              className={`rounded-xl border p-3 transition-all duration-300 ${
                isFlashing
                  ? 'border-sky-400 bg-sky-500/10'
                  : line.check_status === 'ok'
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : line.check_status === 'issue'
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : 'border-slate-700/50 bg-slate-800/30'
              }`}
            >
              {/* Line header */}
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-100">
                    {line.product_name}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    {line.brand && <span className="text-slate-400">{line.brand}</span>}
                    <span>
                      {line.actual_qty} / {line.qty_remaining} {line.unit || line.base_unit}
                    </span>
                    {line.barcode && (
                      <span className="font-mono text-[10px] text-slate-600">{line.barcode}</span>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => handleOk(idx)}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg transition active:scale-95 ${
                      line.check_status === 'ok'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-700/50 text-slate-400 hover:bg-emerald-500/20 hover:text-emerald-400'
                    }`}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleToggleIssue(idx)}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg transition active:scale-95 ${
                      line.check_status === 'issue'
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-700/50 text-slate-400 hover:bg-amber-500/20 hover:text-amber-400'
                    }`}
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Issue form (inline, only when issue selected) */}
              {line.check_status === 'issue' && (
                <div className="mt-3 space-y-2 border-t border-slate-700/50 pt-3">
                  {/* Numeric stepper */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">Received:</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          updateLine(idx, {
                            actual_qty: Math.max(0, line.actual_qty - 1),
                          })
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-700 text-slate-300 transition hover:bg-slate-600 active:scale-95"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-10 text-center text-sm font-semibold text-slate-100">
                        {line.actual_qty}
                      </span>
                      <button
                        onClick={() =>
                          updateLine(idx, {
                            actual_qty: Math.min(line.qty_remaining, line.actual_qty + 1),
                          })
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-700 text-slate-300 transition hover:bg-slate-600 active:scale-95"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="text-xs text-slate-600">/ {line.qty_remaining}</span>
                  </div>

                  {/* Reject reason radio buttons */}
                  <div className="flex flex-wrap gap-1.5">
                    {REJECT_REASONS.map((r) => (
                      <button
                        key={r.value}
                        onClick={() =>
                          updateLine(idx, {
                            reject_reason: line.reject_reason === r.value ? null : r.value,
                            rejected_qty:
                              line.reject_reason === r.value
                                ? 0
                                : line.qty_remaining - line.actual_qty,
                          })
                        }
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition active:scale-95 ${
                          line.reject_reason === r.value
                            ? 'bg-amber-500/30 text-amber-200'
                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>

                  {/* Optional note */}
                  <input
                    type="text"
                    value={line.note ?? ''}
                    onChange={(e) => updateLine(idx, { note: e.target.value || null })}
                    placeholder="Note (optional)"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-sky-500"
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Bottom actions */}
      <div className="space-y-2 pt-2">
        {!allChecked && (
          <button
            onClick={handleAcceptAll}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-700/50 py-3 text-sm font-medium text-slate-300 transition hover:bg-slate-700 active:scale-[0.99]"
          >
            <CheckCheck className="h-4 w-4" />
            Accept All Remaining
          </button>
        )}

        {allChecked && (
          <button
            onClick={handleComplete}
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {isSubmitting ? 'Submitting...' : 'Complete Receiving'}
          </button>
        )}
      </div>
    </div>
  )
}
