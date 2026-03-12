import { useCallback, useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import type { InventoryItem } from '../../hooks/useInventory'
import {
  type WasteReason,
  type FinancialLiability,
  WASTE_REASON_LABELS,
  LIABILITY_LABELS,
  type WasteLogEntry,
} from '../../hooks/useWasteLog'

interface WasteLogFormProps {
  nomenclature: InventoryItem[]
  logs: WasteLogEntry[]
  isLoading: boolean
  error: string | null
  onSubmit: (entry: {
    nomenclature_id: string
    quantity: number
    reason: WasteReason
    financial_liability: FinancialLiability
    comment: string | null
  }) => Promise<{ ok: boolean; error?: string }>
}

const REASONS: WasteReason[] = ['expiration', 'spillage_damage', 'quality_reject', 'rd_testing']
const LIABILITIES: FinancialLiability[] = ['cafe', 'employee', 'supplier']

export function WasteLogForm({
  nomenclature,
  logs,
  isLoading,
  error,
  onSubmit,
}: WasteLogFormProps) {
  const [selectedItem, setSelectedItem] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState<WasteReason>('expiration')
  const [liability, setLiability] = useState<FinancialLiability>('cafe')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const needsComment = liability === 'employee' || liability === 'supplier'

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setSubmitError(null)
      setSubmitSuccess(false)

      if (!selectedItem) {
        setSubmitError('Select an item')
        return
      }
      const qty = parseFloat(quantity)
      if (isNaN(qty) || qty <= 0) {
        setSubmitError('Enter a valid quantity')
        return
      }
      if (needsComment && !comment.trim()) {
        setSubmitError('Comment is required for employee/supplier liability')
        return
      }

      setSubmitting(true)
      const result = await onSubmit({
        nomenclature_id: selectedItem,
        quantity: qty,
        reason,
        financial_liability: liability,
        comment: comment.trim() || null,
      })

      if (!result.ok) {
        setSubmitError(result.error ?? 'Failed to log waste')
      } else {
        setSubmitSuccess(true)
        setSelectedItem('')
        setQuantity('')
        setReason('expiration')
        setLiability('cafe')
        setComment('')
        setTimeout(() => setSubmitSuccess(false), 3000)
      }
      setSubmitting(false)
    },
    [selectedItem, quantity, reason, liability, comment, needsComment, onSubmit],
  )

  return (
    <div className="space-y-4">
      {/* Form */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-rose-400" />
          <h3 className="text-sm font-semibold text-slate-100">Log Waste</h3>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Item select */}
          <select
            value={selectedItem}
            onChange={(e) => setSelectedItem(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 outline-none focus:border-rose-500"
          >
            <option value="">Select item...</option>
            {nomenclature.map((n) => (
              <option key={n.nomenclature_id} value={n.nomenclature_id}>
                {n.name} ({n.product_code})
              </option>
            ))}
          </select>

          {/* Quantity */}
          <input
            type="number"
            step="0.01"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Quantity (kg)"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-rose-500"
          />

          {/* Reason */}
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as WasteReason)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 outline-none focus:border-rose-500"
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {WASTE_REASON_LABELS[r]}
              </option>
            ))}
          </select>

          {/* Financial Liability */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Financial Liability
            </label>
            <div className="flex gap-2">
              {LIABILITIES.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLiability(l)}
                  className={[
                    'flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition',
                    liability === l
                      ? l === 'cafe'
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                        : l === 'employee'
                          ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                          : 'border-rose-500/50 bg-rose-500/10 text-rose-300'
                      : 'border-slate-700 text-slate-400 hover:border-slate-600',
                  ].join(' ')}
                >
                  {LIABILITY_LABELS[l].split(' (')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Comment */}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={needsComment ? 'Comment (required)...' : 'Comment (optional)...'}
            rows={2}
            className={[
              'w-full rounded-lg border bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none',
              needsComment ? 'border-amber-500/50 focus:border-amber-500' : 'border-slate-700 focus:border-rose-500',
            ].join(' ')}
          />

          {/* Errors / Success */}
          {submitError && (
            <div className="flex items-center gap-1.5 text-xs text-rose-400">
              <AlertTriangle className="h-3 w-3" />
              {submitError}
            </div>
          )}
          {submitSuccess && (
            <p className="text-xs text-emerald-400">Waste logged successfully</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-rose-600 py-2 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
          >
            {submitting ? 'Logging...' : 'Log Waste'}
          </button>
        </form>
      </div>

      {/* Recent logs */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="border-b border-slate-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-100">Recent Write-offs</h3>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-slate-800/50" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4 text-center text-xs text-rose-300">{error}</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No waste logged yet</div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="border-b border-slate-800 text-left text-slate-500">
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium">Qty</th>
                  <th className="px-4 py-2 font-medium">Reason</th>
                  <th className="px-4 py-2 font-medium">Liability</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-800/50">
                    <td className="px-4 py-2 text-slate-200">{log.name ?? log.nomenclature_id.slice(0, 8)}</td>
                    <td className="px-4 py-2 text-slate-300">{log.quantity}</td>
                    <td className="px-4 py-2 text-slate-400">{WASTE_REASON_LABELS[log.reason]}</td>
                    <td className="px-4 py-2">
                      <span
                        className={[
                          'rounded-full px-2 py-0.5 text-[10px] font-medium',
                          log.financial_liability === 'cafe'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : log.financial_liability === 'employee'
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-rose-500/10 text-rose-400',
                        ].join(' ')}
                      >
                        {log.financial_liability}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {new Date(log.created_at).toLocaleDateString('en-GB')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
