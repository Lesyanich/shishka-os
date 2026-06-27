import { useState } from 'react'
import { Loader2, Save, X } from 'lucide-react'
import type { PriceSummaryRow, QuoteInput, RpcResult } from '../../types/priceBook'

export function QuoteEntryModal({
  item,
  supplierNames,
  onClose,
  onSubmit,
}: {
  item: PriceSummaryRow
  supplierNames: string[]
  onClose: () => void
  onSubmit: (input: QuoteInput) => Promise<RpcResult>
}) {
  const [supplier, setSupplier] = useState('')
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handleSave = async () => {
    const priceNum = Number(price)
    if (!supplier.trim()) {
      setErr('Supplier name is required')
      return
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setErr('Enter a price greater than 0')
      return
    }
    setSaving(true)
    setErr(null)
    const res = await onSubmit({
      nomenclature_id: item.nomenclature_id,
      unit_price: priceNum,
      supplier_name: supplier.trim(),
      note: note.trim() || undefined,
    })
    setSaving(false)
    if (!res.ok) {
      setErr(res.error ?? 'Failed to record quote')
      return
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Record supplier quote</h3>
            <p className="text-[11px] text-slate-500">
              {item.item_name}
              {item.base_unit ? ` · per ${item.base_unit}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {err && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {err}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-slate-400">Supplier</label>
            <input
              type="text"
              list="pb-supplier-names"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Type or pick a supplier"
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
              autoFocus
            />
            <datalist id="pb-supplier-names">
              {supplierNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <p className="mt-1 text-[10px] text-slate-500">A new name creates a supplier automatically.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Price {item.base_unit ? `(฿ per ${item.base_unit})` : '(฿)'}
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave()
              }}
              placeholder="0.00"
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. branded 8oz, MOQ 1000"
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-md border border-slate-700 bg-slate-800 px-4 text-xs text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex h-8 items-center rounded-md border border-emerald-500/60 bg-emerald-500/15 px-4 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
            Save quote
          </button>
        </div>
      </div>
    </div>
  )
}
