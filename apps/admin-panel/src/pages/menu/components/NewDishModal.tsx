import { useEffect, useState } from 'react'
import { Check, ChefHat, Loader2, X } from 'lucide-react'
import { useCreateDish, productCodeFromName, type PortionUnit } from '../../../hooks/useCreateDish'

interface NewDishModalProps {
  open: boolean
  onClose: () => void
  /** Called on successful creation with the new dish id. Parent should refetch + expand row. */
  onCreated: (dishId: string) => void
}

export function NewDishModal({ open, onClose, onCreated }: NewDishModalProps) {
  const {
    categories,
    subcategories,
    isLoadingCategories,
    isCreating,
    error: hookError,
    createDish,
  } = useCreateDish()

  // ─── Form state ─────────────────────────────────────────
  const [name, setName] = useState('')
  const [productCode, setProductCode] = useState('')
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null)
  const [price, setPrice] = useState('')
  const [portionSize, setPortionSize] = useState('')
  const [portionUnit, setPortionUnit] = useState<PortionUnit>('g')
  const [isAvailable, setIsAvailable] = useState(true)
  const [isFeatured, setIsFeatured] = useState(false)

  const [localError, setLocalError] = useState<string | null>(null)

  // Auto-generate product_code from name (until user edits manually)
  useEffect(() => {
    if (!codeManuallyEdited) {
      setProductCode(productCodeFromName(name))
    }
  }, [name, codeManuallyEdited])

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      setName('')
      setProductCode('')
      setCodeManuallyEdited(false)
      setCategoryId(null)
      setSubcategoryId(null)
      setPrice('')
      setPortionSize('')
      setPortionUnit('g')
      setIsAvailable(true)
      setIsFeatured(false)
      setLocalError(null)
    }
  }, [open])

  // When L1 changes, reset L2
  useEffect(() => {
    setSubcategoryId(null)
  }, [categoryId])

  const l2Options = categoryId ? (subcategories.get(categoryId) ?? []) : []

  const canSubmit =
    name.trim().length >= 2 &&
    productCode.trim().startsWith('SALE-') &&
    productCode.trim().length > 5 &&
    categoryId !== null &&
    !isCreating

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!canSubmit) return
    setLocalError(null)

    const priceNum = price.trim() ? Number(price) : null
    if (priceNum !== null && (Number.isNaN(priceNum) || priceNum < 0)) {
      setLocalError('Price must be a non-negative number')
      return
    }

    const portionNum = portionSize.trim() ? Number(portionSize) : null
    if (portionNum !== null && (Number.isNaN(portionNum) || portionNum <= 0)) {
      setLocalError('Portion size must be a positive number')
      return
    }

    const result = await createDish({
      name: name.trim(),
      product_code: productCode.trim().toUpperCase(),
      // Prefer L2 if chosen, else L1
      category_id: subcategoryId ?? categoryId,
      price: priceNum,
      portion_size: portionNum,
      portion_unit: portionNum !== null ? portionUnit : null,
      is_available: isAvailable,
      is_featured: isFeatured,
    })

    if (!result.ok) {
      setLocalError(result.error ?? 'Failed to create dish')
      return
    }

    onCreated(result.id!)
    onClose()
  }

  if (!open) return null

  const displayError = localError ?? hookError

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm sm:p-8"
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15">
              <ChefHat className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">New dish</h2>
              <p className="text-[10px] text-slate-500">
                Creates a SALE-item. Add ingredients later by expanding the row.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Name <span className="text-rose-400">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="Borsch Bio-Active"
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Product code (auto-generated, editable) */}
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Product code <span className="text-rose-400">*</span>
              <span className="ml-2 text-[9px] font-normal text-slate-600">
                auto from name, editable
              </span>
            </label>
            <input
              value={productCode}
              onChange={(e) => {
                setProductCode(e.target.value.toUpperCase())
                setCodeManuallyEdited(true)
              }}
              placeholder="SALE-BORSCH_BIO_ACTIVE"
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-xs text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Category L1 + L2 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Category <span className="text-rose-400">*</span>
              </label>
              <select
                value={categoryId ?? ''}
                onChange={(e) => setCategoryId(e.target.value || null)}
                disabled={isLoadingCategories}
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
              >
                <option value="">
                  {isLoadingCategories ? 'Loading…' : '— select —'}
                </option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Subcategory
                <span className="ml-2 text-[9px] font-normal text-slate-600">
                  optional
                </span>
              </label>
              <select
                value={subcategoryId ?? ''}
                onChange={(e) => setSubcategoryId(e.target.value || null)}
                disabled={!categoryId || l2Options.length === 0}
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
              >
                <option value="">
                  {!categoryId
                    ? '—'
                    : l2Options.length === 0
                      ? 'no subcategories'
                      : '— none —'}
                </option>
                {l2Options.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Price + portion */}
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Price, ฿
                <span className="ml-2 text-[9px] font-normal text-slate-600">
                  optional
                </span>
              </label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                min={0}
                step="1"
                placeholder="290"
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Portion size
                <span className="ml-2 text-[9px] font-normal text-slate-600">
                  enables price per 100{portionUnit === 'pcs' ? '' : portionUnit}
                </span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={portionSize}
                  onChange={(e) => setPortionSize(e.target.value)}
                  min={0}
                  step="1"
                  placeholder="250"
                  className="w-24 rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                />
                <select
                  value={portionUnit}
                  onChange={(e) => setPortionUnit(e.target.value as PortionUnit)}
                  className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="pcs">pcs</option>
                </select>
              </div>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-5">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={isAvailable}
                onChange={(e) => setIsAvailable(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
              />
              Available on menu
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
              />
              Featured
            </label>
          </div>

          {/* Error */}
          {displayError && (
            <div className="rounded-lg border border-rose-800/50 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
              {displayError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isCreating}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Check className="h-3 w-3" />
                Create dish
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
