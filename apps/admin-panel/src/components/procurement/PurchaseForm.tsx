import { useEffect, useState } from 'react'
import { Loader2, Receipt } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Supplier = {
  id: string
  name: string
}

type NomItem = {
  id: string
  product_code: string
  name: string
  base_unit: string | null
  cost_per_unit: number
}

export function PurchaseForm({
  onPurchaseCreated,
}: {
  onPurchaseCreated: () => void
}) {
  // Lookups
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [items, setItems] = useState<NomItem[]>([])
  const [isLoadingLookups, setIsLoadingLookups] = useState(true)

  // Form fields
  const [supplierId, setSupplierId] = useState('')
  const [nomenclatureId, setNomenclatureId] = useState('')
  const [quantity, setQuantity] = useState<number | ''>('')
  const [totalPrice, setTotalPrice] = useState<number | ''>('')
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().split('T')[0],
  )
  const [notes, setNotes] = useState('')

  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Computed: price per unit
  const pricePerUnit =
    typeof quantity === 'number' &&
    typeof totalPrice === 'number' &&
    quantity > 0
      ? totalPrice / quantity
      : null

  // Current cost of selected item
  const selectedItem = items.find((i) => i.id === nomenclatureId)

  // Load suppliers + nomenclature (RAW + PF only)
  useEffect(() => {
    const load = async () => {
      setIsLoadingLookups(true)

      const [suppRes, nomRes] = await Promise.all([
        supabase
          .from('suppliers')
          .select('id, name')
          .eq('is_deleted', false)
          .order('name'),
        supabase
          .from('nomenclature')
          .select('id, product_code, name, base_unit, cost_per_unit')
          .or('product_code.ilike.RAW-%,product_code.ilike.PF-%')
          .eq('is_deleted', false)
          .order('product_code'),
      ])

      if (suppRes.error)
        console.error('[PurchaseForm] suppliers error', suppRes.error)
      if (nomRes.error)
        console.error('[PurchaseForm] nomenclature error', nomRes.error)

      setSuppliers((suppRes.data ?? []) as Supplier[])
      setItems(
        (nomRes.data ?? []).map((d) => ({
          ...d,
          cost_per_unit: Number(d.cost_per_unit ?? 0),
        })) as NomItem[],
      )
      setIsLoadingLookups(false)
    }

    load()
  }, [])

  const handleSubmit = async () => {
    if (!supplierId) {
      setError('Select a supplier')
      return
    }
    if (!nomenclatureId) {
      setError('Select an item')
      return
    }
    if (!quantity || quantity <= 0) {
      setError('Quantity must be > 0')
      return
    }
    if (!totalPrice || totalPrice < 0) {
      setError('Total price must be >= 0')
      return
    }
    if (pricePerUnit === null) {
      setError('Cannot compute price per unit')
      return
    }

    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const { error: insertErr } = await supabase
        .from('purchase_logs')
        .insert({
          supplier_id: supplierId,
          nomenclature_id: nomenclatureId,
          quantity: quantity,
          price_per_unit: Math.round(pricePerUnit * 100) / 100,
          total_price: totalPrice,
          invoice_date: invoiceDate,
          notes: notes.trim() || null,
        })

      if (insertErr) throw insertErr

      // Show success and reset form
      const itemName =
        items.find((i) => i.id === nomenclatureId)?.product_code ?? ''
      setSuccess(
        `Logged: ${itemName} — ${quantity} units @ ${pricePerUnit.toFixed(2)} THB/unit. Cost updated!`,
      )

      // Reset
      setNomenclatureId('')
      setQuantity('')
      setTotalPrice('')
      setNotes('')

      onPurchaseCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoadingLookups) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm">
        <div className="flex items-center justify-center py-8 text-xs text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading form data...
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 shadow-sm">
      <header className="border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-emerald-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Log Purchase
            </h2>
            <p className="text-xs text-slate-500">
              Enter invoice data. Cost auto-updates on save.
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-4 px-4 py-4">
        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            {success}
          </div>
        )}

        {/* Supplier + Date row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Supplier
            </label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 outline-none focus:border-emerald-500"
            >
              <option value="">Select supplier...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Invoice Date
            </label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Item selector */}
        <div>
          <label className="mb-1 block text-xs text-slate-400">
            Item (RAW / PF only)
          </label>
          <select
            value={nomenclatureId}
            onChange={(e) => setNomenclatureId(e.target.value)}
            className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 outline-none focus:border-emerald-500"
          >
            <option value="">Select item...</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.product_code} — {i.name}
                {i.base_unit ? ` [${i.base_unit}]` : ''}
                {i.cost_per_unit > 0
                  ? ` (current: ${i.cost_per_unit} THB)`
                  : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Quantity + Total Price row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Quantity ({selectedItem?.base_unit ?? 'units'})
            </label>
            <input
              type="number"
              step="0.001"
              value={quantity}
              onChange={(e) =>
                setQuantity(e.target.value === '' ? '' : Number(e.target.value))
              }
              placeholder="e.g. 10"
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Total Price (THB)
            </label>
            <input
              type="number"
              step="0.01"
              value={totalPrice}
              onChange={(e) =>
                setTotalPrice(
                  e.target.value === '' ? '' : Number(e.target.value),
                )
              }
              placeholder="e.g. 500"
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Price per unit (auto-calc) + cost comparison */}
        {pricePerUnit !== null && (
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-4 py-3">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Price per Unit (auto)
                </div>
                <div className="mt-1 text-lg font-semibold text-amber-300">
                  {pricePerUnit.toFixed(2)} THB
                </div>
              </div>
              {selectedItem && selectedItem.cost_per_unit > 0 && (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">
                    Current Cost
                  </div>
                  <div className="mt-1 text-sm text-slate-300">
                    {selectedItem.cost_per_unit.toFixed(2)} THB
                  </div>
                  {(() => {
                    const diff = pricePerUnit - selectedItem.cost_per_unit
                    const pct =
                      selectedItem.cost_per_unit > 0
                        ? (diff / selectedItem.cost_per_unit) * 100
                        : 0
                    if (Math.abs(pct) < 0.5) return null
                    return (
                      <div
                        className={`mt-0.5 text-[10px] font-medium ${
                          diff > 0 ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {diff > 0 ? '+' : ''}
                        {pct.toFixed(1)}% vs current
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="mb-1 block text-xs text-slate-400">
            Notes (optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Invoice #, batch note..."
            className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
          />
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSaving}
          className="inline-flex h-9 w-full items-center justify-center rounded-md border border-emerald-500/60 bg-emerald-500/15 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Receipt className="mr-1 h-3.5 w-3.5" />
          )}
          Log Purchase & Update Cost
        </button>
      </div>
    </section>
  )
}
