import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Trash2, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { SearchableSelect, type SearchableOption } from '../ui/SearchableSelect'
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
  /** Pre-populate the form (e.g. from a staff stock request). */
  initialLines?: { nomenclature_id: string; qty_ordered: number }[]
  initialNotes?: string
}

interface DraftLine {
  nomenclature_id: string
  qty_ordered: number | ''
  unit_price_expected: number | '' | null
}

const defaultToday = new Date().toISOString().slice(0, 10)

export function PurchaseOrderForm({
  onCreated,
  createPO,
  isCreating,
  initialLines,
  initialNotes,
}: Props) {
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

  // Search matches the product code too, so "RAW-CHK" finds it as readily as
  // "chicken" — the code is what appears on supplier paperwork.
  const supplierOptions: SearchableOption[] = useMemo(
    () => suppliers.map((s) => ({ value: s.id, label: s.name })),
    [suppliers],
  )
  const itemOptions: SearchableOption[] = useMemo(
    () => items.map((i) => ({ value: i.id, label: i.name, sublabel: i.product_code })),
    [items],
  )

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

  // Apply a prefill (e.g. from a staff stock request). Re-runs when the parent
  // hands over a new prefill array, and guarantees the dropdown lists those items.
  useEffect(() => {
    if (!initialLines || initialLines.length === 0) return
    setLines(
      initialLines.map((l) => ({
        nomenclature_id: l.nomenclature_id,
        qty_ordered: l.qty_ordered,
        unit_price_expected: null,
      })),
    )
    if (initialNotes) setNotes(initialNotes)
    const ids = initialLines.map((l) => l.nomenclature_id)
    supabase
      .from('nomenclature')
      .select('id, product_code, name, base_unit')
      .in('id', ids)
      .then(({ data }) => {
        if (!data) return
        setItems((prev) => {
          const have = new Set(prev.map((p) => p.id))
          return [...prev, ...(data as NomItem[]).filter((d) => !have.has(d.id))]
        })
      })
  }, [initialLines, initialNotes])

  const addLine = useCallback(() => {
    setLines((prev) => [
      ...prev,
      { nomenclature_id: '', qty_ordered: '', unit_price_expected: null },
    ])
  }, [])

  const removeLine = useCallback((idx: number) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))
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

    // Consider only lines the user has actually started (a product or a qty).
    // Untouched empty rows are ignored; half-filled rows are validated, never
    // silently dropped — so the user always learns why a submit was rejected.
    const filledLines = lines.filter(
      (l) => l.nomenclature_id || (l.qty_ordered !== '' && l.qty_ordered != null),
    )

    if (filledLines.length === 0) {
      setError('Add at least one item')
      return
    }

    for (const l of filledLines) {
      if (!l.nomenclature_id) {
        setError('Select a product for every line')
        return
      }
      const qty = Number(l.qty_ordered)
      if (l.qty_ordered === '' || Number.isNaN(qty) || qty <= 0) {
        setError('Quantity must be greater than 0 for every item')
        return
      }
    }

    const validLines: POLineInput[] = filledLines.map((l) => ({
      nomenclature_id: l.nomenclature_id,
      qty_ordered: Number(l.qty_ordered),
      unit_price_expected: l.unit_price_expected ? Number(l.unit_price_expected) : undefined,
    }))

    const payload: CreatePOPayload = {
      supplier_id: supplierId,
      expected_date: expectedDate || null,
      notes: notes || null,
      lines: validLines,
    }

    let result: CreatePOResult
    try {
      result = await createPO(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create PO')
      return
    }

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
    return <div className="h-40 animate-pulse rounded-xl bg-[var(--s-2)]" />
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-[var(--line-strong)] bg-[var(--s-2)] p-4"
    >
      <h3 className="text-sm font-bold text-cream">New Purchase Order</h3>

      {error && (
        <div className="rounded-lg border border-brick-soft/30 bg-brick-soft/10 px-3 py-2 text-xs text-brick-bright">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-forest-soft/30 bg-forest-soft/10 px-3 py-2 text-xs text-mint-200">
          {success}
        </div>
      )}

      {/* Supplier + Date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[11px] text-cream/45">Supplier</label>
          <SearchableSelect
            label="Supplier"
            value={supplierId}
            onChange={setSupplierId}
            options={supplierOptions}
            placeholder="Select…"
            emptyText="No supplier matches"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-cream/45">Expected Date</label>
          <input
            type="date"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
            className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-3 text-xs text-cream outline-none focus:border-forest-soft"
          />
        </div>
      </div>

      {/* Line items */}
      <div className="space-y-2">
        <label className="block text-[11px] text-cream/45">Items</label>
        {lines.map((line, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <SearchableSelect
                label={`Item ${idx + 1}`}
                value={line.nomenclature_id}
                onChange={(v) => updateLine(idx, { nomenclature_id: v })}
                options={itemOptions}
                placeholder="Select item…"
                emptyText="No product matches"
              />
            </div>
            <input
              type="number"
              value={line.qty_ordered}
              onChange={(e) =>
                updateLine(idx, { qty_ordered: e.target.value ? Number(e.target.value) : '' })
              }
              placeholder="Qty"
              min={0.01}
              step="any"
              className="h-9 w-20 rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-2 text-xs text-cream outline-none focus:border-forest-soft"
            />
            <input
              type="number"
              value={line.unit_price_expected ?? ''}
              onChange={(e) =>
                updateLine(idx, {
                  unit_price_expected: e.target.value ? Number(e.target.value) : null,
                })
              }
              placeholder="Price"
              min={0}
              step="any"
              className="h-9 w-20 rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-2 text-xs text-cream outline-none focus:border-forest-soft"
            />
            <button
              type="button"
              onClick={() => removeLine(idx)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-cream/30 transition hover:bg-brick-soft/10 hover:text-brick-bright"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addLine}
          className="flex items-center gap-1.5 text-xs text-honey-300/85 transition hover:text-honey-300"
        >
          <Plus className="h-3.5 w-3.5" />
          Add item
        </button>
      </div>

      {/* Notes */}
      <div>
        <label className="mb-1 block text-[11px] text-cream/45">Notes</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes..."
          className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-3 text-xs text-cream outline-none focus:border-forest-soft"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isCreating}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-royal-green)] py-2.5 text-xs font-semibold text-white transition hover:bg-[var(--color-royal-soft)] active:scale-[0.99] disabled:opacity-50"
      >
        <Send className="h-3.5 w-3.5" />
        {isCreating ? 'Creating...' : 'Create Purchase Order'}
      </button>
    </form>
  )
}
