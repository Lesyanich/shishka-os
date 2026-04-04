import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { CreatePOPayload, CreatePOResult, POLineInput } from '../../types/procurement'

interface Supplier {
  id: string
  name: string
}

interface NomItem {
  id: string
  product_code: string
  name: string
  base_unit: string | null
}

interface Props {
  onCreated: (result: CreatePOResult) => void
  createPO: (payload: CreatePOPayload) => Promise<CreatePOResult>
  isCreating: boolean
}

interface DraftLine {
  nomenclature_id: string
  qty_ordered: number | ''
  unit_price_expected: number | '' | null
}

const defaultToday = new Date().toISOString().slice(0, 10)

export function PurchaseOrderForm({ onCreated, createPO, isCreating }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [items, setItems] = useState<NomItem[]>([])
  const [isLoadingLookups, setIsLoadingLookups] = useState(true)

  const [supplierId, setSupplierId] = useState('')
  const [expectedDate, setExpectedDate] = useState(defaultToday)
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([
    { nomenclature_id: '', qty_ordered: '', unit_price_expected: null },
  ])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [suppRes, nomRes] = await Promise.all([
        supabase.from('suppliers').select('id, name').eq('is_deleted', false).order('name'),
        supabase
          .from('nomenclature')
          .select('id, product_code, name, base_unit')
          .or('product_code.ilike.RAW-%,product_code.ilike.PF-%')
          .eq('is_deleted', false)
          .order('product_code'),
      ])
      setSuppliers((suppRes.data ?? []) as Supplier[])
      setItems((nomRes.data ?? []) as NomItem[])
      setIsLoadingLookups(false)
    }
    load()
  }, [])

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, { nomenclature_id: '', qty_ordered: '', unit_price_expected: null }])
  }, [])

  const removeLine = useCallback((idx: number) => {
    setLines((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)
  }, [])

  const updateLine = useCallback((idx: number, patch: Partial<DraftLine>) => {
    setLines((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!supplierId) {
      setError('Select a supplier')
      return
    }

    const validLines: POLineInput[] = lines
      .filter((l) => l.nomenclature_id && l.qty_ordered)
      .map((l) => ({
        nomenclature_id: l.nomenclature_id,
        qty_ordered: Number(l.qty_ordered),
        unit_price_expected: l.unit_price_expected ? Number(l.unit_price_expected) : undefined,
      }))

    if (validLines.length === 0) {
      setError('Add at least one item')
      return
    }

    const payload: CreatePOPayload = {
      supplier_id: supplierId,
      expected_date: expectedDate || null,
      notes: notes || null,
      lines: validLines,
    }

    const result = await createPO(payload)

    if (!result.ok) {
      setError(result.error ?? 'Failed to create PO')
      return
    }

    setSuccess(`Created ${result.po_number} with ${result.line_count} items`)
    setSupplierId('')
    setExpectedDate(defaultToday)
    setNotes('')
    setLines([{ nomenclature_id: '', qty_ordered: '', unit_price_expected: null }])
    onCreated(result)
  }

  if (isLoadingLookups) {
    return <div className="h-40 animate-pulse rounded-xl bg-slate-800/50" />
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
      <h3 className="text-sm font-bold text-slate-100">New Purchase Order</h3>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          {success}
        </div>
      )}

      {/* Supplier + Date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[11px] text-slate-500">Supplier</label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
          >
            <option value="">Select...</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-slate-500">Expected Date</label>
          <input
            type="date"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
            className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Line items */}
      <div className="space-y-2">
        <label className="block text-[11px] text-slate-500">Items</label>
        {lines.map((line, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <select
              value={line.nomenclature_id}
              onChange={(e) => updateLine(idx, { nomenclature_id: e.target.value })}
              className="h-9 min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 outline-none focus:border-emerald-500"
            >
              <option value="">Select item...</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.product_code} — {i.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={line.qty_ordered}
              onChange={(e) => updateLine(idx, { qty_ordered: e.target.value ? Number(e.target.value) : '' })}
              placeholder="Qty"
              min={0.01}
              step="any"
              className="h-9 w-20 rounded-md border border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 outline-none focus:border-emerald-500"
            />
            <input
              type="number"
              value={line.unit_price_expected ?? ''}
              onChange={(e) => updateLine(idx, { unit_price_expected: e.target.value ? Number(e.target.value) : null })}
              placeholder="Price"
              min={0}
              step="any"
              className="h-9 w-20 rounded-md border border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={() => removeLine(idx)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-600 transition hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addLine}
          className="flex items-center gap-1.5 text-xs text-sky-400 transition hover:text-sky-300"
        >
          <Plus className="h-3.5 w-3.5" />
          Add item
        </button>
      </div>

      {/* Notes */}
      <div>
        <label className="mb-1 block text-[11px] text-slate-500">Notes</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes..."
          className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isCreating}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-50"
      >
        <Send className="h-3.5 w-3.5" />
        {isCreating ? 'Creating...' : 'Create Purchase Order'}
      </button>
    </form>
  )
}
