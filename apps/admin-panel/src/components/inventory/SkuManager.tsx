// ═══════════════════════════════════════════════════════════
// Component: SkuManager
// Phase 10.2: SKU management — table, search, CRUD modal
// Pattern: SupplierManager.tsx
// ═══════════════════════════════════════════════════════════

import { useState, useMemo } from 'react'
import { Barcode, Edit3, EyeOff, Loader2, Package, Plus, Save, Search, X } from 'lucide-react'
import type { SkuRow, SkuFormData, NomenclatureOption } from '../../hooks/useSkuManager'

interface Props {
  skus: SkuRow[]
  nomenclatureOptions: NomenclatureOption[]
  isLoading: boolean
  onCreateSku: (data: SkuFormData) => Promise<{ ok: boolean; error?: string }>
  onUpdateSku: (id: string, data: Partial<SkuFormData>) => Promise<{ ok: boolean; error?: string }>
  onDeactivateSku: (id: string) => Promise<{ ok: boolean; error?: string }>
}

export function SkuManager({
  skus,
  nomenclatureOptions,
  isLoading,
  onCreateSku,
  onUpdateSku,
  onDeactivateSku,
}: Props) {
  // ─── Search & filters ───
  const [search, setSearch] = useState('')
  const [filterNom, setFilterNom] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // ─── Modal state ───
  const [showModal, setShowModal] = useState(false)
  const [editingSku, setEditingSku] = useState<SkuRow | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  // ─── Form fields ───
  const [formProductName, setFormProductName] = useState('')
  const [formProductNameTh, setFormProductNameTh] = useState('')
  const [formBarcode, setFormBarcode] = useState('')
  const [formNomId, setFormNomId] = useState('')
  const [formBrand, setFormBrand] = useState('')
  const [formPackageWeight, setFormPackageWeight] = useState('')
  const [formPackageQty, setFormPackageQty] = useState('')
  const [formPackageUnit, setFormPackageUnit] = useState('')
  const [formPackageType, setFormPackageType] = useState('')

  // ─── Filtered SKUs ───
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return skus.filter((s) => {
      if (!showInactive && !s.is_active) return false
      if (filterNom && s.nomenclature_id !== filterNom) return false
      if (!q) return true
      return (
        s.product_name.toLowerCase().includes(q) ||
        s.sku_code.toLowerCase().includes(q) ||
        (s.barcode?.includes(q) ?? false) ||
        (s.brand?.toLowerCase().includes(q) ?? false) ||
        s.nomenclature_name.toLowerCase().includes(q)
      )
    })
  }, [skus, search, filterNom, showInactive])

  // ─── Unique nomenclatures for filter dropdown ───
  const nomFilterOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const s of skus) {
      if (!seen.has(s.nomenclature_id)) {
        seen.set(s.nomenclature_id, s.nomenclature_name)
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [skus])

  // ─── Modal handlers ───
  const resetForm = () => {
    setFormProductName('')
    setFormProductNameTh('')
    setFormBarcode('')
    setFormNomId('')
    setFormBrand('')
    setFormPackageWeight('')
    setFormPackageQty('')
    setFormPackageUnit('')
    setFormPackageType('')
    setModalError(null)
  }

  const handleOpenCreate = () => {
    setEditingSku(null)
    resetForm()
    setShowModal(true)
  }

  const handleOpenEdit = (sku: SkuRow) => {
    setEditingSku(sku)
    setFormProductName(sku.product_name)
    setFormProductNameTh(sku.product_name_th ?? '')
    setFormBarcode(sku.barcode ?? '')
    setFormNomId(sku.nomenclature_id)
    setFormBrand(sku.brand ?? '')
    setFormPackageWeight(sku.package_weight ?? '')
    setFormPackageQty(sku.package_qty?.toString() ?? '')
    setFormPackageUnit(sku.package_unit ?? '')
    setFormPackageType(sku.package_type ?? '')
    setModalError(null)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formProductName.trim()) {
      setModalError('Product name is required')
      return
    }
    if (!formNomId) {
      setModalError('Nomenclature is required')
      return
    }

    setIsSaving(true)
    setModalError(null)

    try {
      const formData: SkuFormData = {
        product_name: formProductName,
        product_name_th: formProductNameTh || null,
        barcode: formBarcode || null,
        nomenclature_id: formNomId,
        brand: formBrand || null,
        package_weight: formPackageWeight || null,
        package_qty: formPackageQty ? Number(formPackageQty) : null,
        package_unit: formPackageUnit || null,
        package_type: formPackageType || null,
      }

      const result = editingSku
        ? await onUpdateSku(editingSku.id, formData)
        : await onCreateSku(formData)

      if (!result.ok) {
        setModalError(result.error ?? 'Unknown error')
      } else {
        setShowModal(false)
      }
    } catch (err) {
      setModalError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeactivate = async (id: string) => {
    await onDeactivateSku(id)
  }

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--s-1)] shadow-sm">
      {/* ─── Header ─── */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-cream">SKU Catalog</h2>
          <p className="text-xs text-cream/45">
            {filtered.length} of {skus.filter((s) => s.is_active).length} SKUs
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex h-8 items-center rounded-md border border-forest-soft/60 bg-forest-soft/10 px-3 text-[11px] font-medium text-mint-200 hover:bg-forest-soft/20"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add SKU
        </button>
      </header>

      {/* ─── Search & Filters ─── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-2.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cream/45" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, barcode, brand, SKU code..."
            className="h-8 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] pl-8 pr-3 text-xs text-cream outline-none placeholder:text-cream/30 focus:border-forest-soft/60"
          />
        </div>
        <select
          value={filterNom}
          onChange={(e) => setFilterNom(e.target.value)}
          className="h-8 rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-2 text-xs text-cream/80 outline-none focus:border-forest-soft/60"
        >
          <option value="">All nomenclatures</option>
          {nomFilterOptions.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] text-cream/45">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-3 w-3 rounded border-[var(--line-strong)] bg-[var(--s-2)]"
          />
          Show inactive
        </label>
      </div>

      {/* ─── Table ─── */}
      <div className="overflow-x-auto px-4 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-xs text-cream/45">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading SKUs...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-xs text-cream/45">
            {search || filterNom
              ? 'No SKUs match your search.'
              : 'No SKUs yet. Add your first SKU or wait for Makro parser.'}
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-cream/45">
                <th className="py-2 pr-2">Code</th>
                <th className="py-2 pr-2">Product</th>
                <th className="py-2 pr-2">Brand</th>
                <th className="py-2 pr-2">Barcode</th>
                <th className="py-2 pr-2">Nomenclature</th>
                <th className="py-2 pr-2">Package</th>
                <th className="py-2 pr-2 text-right">Stock</th>
                <th className="py-2 pr-2 text-center">Suppliers</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  className={[
                    'border-b border-[var(--line)] last:border-none',
                    !s.is_active ? 'opacity-40' : '',
                  ].join(' ')}
                >
                  <td className="py-2.5 pr-2">
                    <span className="inline-flex items-center rounded bg-[var(--s-2)] px-1.5 py-0.5 font-mono text-[10px] text-mint-200">
                      {s.sku_code}
                    </span>
                  </td>
                  <td className="py-2.5 pr-2 max-w-[200px]">
                    <div className="truncate font-medium text-cream" title={s.product_name}>
                      {s.product_name}
                    </div>
                    {s.product_name_th && (
                      <div className="truncate text-[10px] text-cream/45">{s.product_name_th}</div>
                    )}
                  </td>
                  <td className="py-2.5 pr-2 text-cream/60">{s.brand ?? '--'}</td>
                  <td className="py-2.5 pr-2">
                    {s.barcode ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-honey-300">
                        <Barcode className="h-3 w-3" />
                        {s.barcode}
                      </span>
                    ) : (
                      <span className="text-cream/30">--</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-2 text-cream/60">{s.nomenclature_name}</td>
                  <td className="py-2.5 pr-2 text-cream/45">{s.package_weight ?? '--'}</td>
                  <td className="py-2.5 pr-2 text-right tabular-nums text-cream/80">
                    {s.stock_quantity > 0 ? s.stock_quantity.toFixed(1) : '--'}
                  </td>
                  <td className="py-2.5 pr-2 text-center">
                    {s.supplier_count > 0 ? (
                      <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-forest-soft/10 px-1.5 text-[10px] font-medium text-mint-200">
                        {s.supplier_count}
                      </span>
                    ) : (
                      <span className="text-cream/30">0</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(s)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--line-strong)] text-cream/60 hover:border-forest-soft/50 hover:text-mint-200"
                        aria-label="Edit SKU"
                        title="Edit"
                      >
                        <Edit3 className="h-3 w-3" />
                      </button>
                      {s.is_active && (
                        <button
                          type="button"
                          onClick={() => handleDeactivate(s.id)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--line-strong)] text-cream/60 hover:border-amber-watch/50 hover:text-amber-watch"
                          aria-label="Deactivate SKU"
                          title="Deactivate"
                        >
                          <EyeOff className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ─── Create/Edit Modal ─── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-[var(--line-strong)] bg-[var(--s-1)] shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-cream">
                <Package className="h-4 w-4 text-mint-200" />
                {editingSku ? 'Edit SKU' : 'Add SKU'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-md p-1 text-cream/60 hover:bg-[var(--s-2)] hover:text-cream"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="space-y-4 px-5 py-4">
              {modalError && (
                <div className="rounded-md border border-brick-soft/30 bg-brick-soft/10 px-3 py-2 text-xs text-brick-bright">
                  {modalError}
                </div>
              )}

              {/* Product name */}
              <div>
                <label className="mb-1 block text-xs text-cream/60">
                  Product Name <span className="text-brick-bright">*</span>
                </label>
                <input
                  type="text"
                  value={formProductName}
                  onChange={(e) => setFormProductName(e.target.value)}
                  placeholder="e.g. ALLOWRIE Unsalted Compound Butter 2 kg"
                  className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-3 text-xs text-cream outline-none focus:border-forest-soft"
                  autoFocus
                />
              </div>

              {/* Product name TH */}
              <div>
                <label className="mb-1 block text-xs text-cream/60">Product Name (Thai)</label>
                <input
                  type="text"
                  value={formProductNameTh}
                  onChange={(e) => setFormProductNameTh(e.target.value)}
                  placeholder="Thai name (optional)"
                  className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-3 text-xs text-cream outline-none focus:border-forest-soft"
                />
              </div>

              {/* Nomenclature + Barcode row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-cream/60">
                    Nomenclature <span className="text-brick-bright">*</span>
                  </label>
                  <select
                    value={formNomId}
                    onChange={(e) => setFormNomId(e.target.value)}
                    className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-2 text-xs text-cream outline-none focus:border-forest-soft"
                  >
                    <option value="">Select...</option>
                    {nomenclatureOptions.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.product_code} — {n.name} ({n.base_unit})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-cream/60">Barcode (EAN)</label>
                  <input
                    type="text"
                    value={formBarcode}
                    onChange={(e) => setFormBarcode(e.target.value)}
                    placeholder="e.g. 8850332162240"
                    className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-3 font-mono text-xs text-cream outline-none focus:border-forest-soft"
                  />
                </div>
              </div>

              {/* Brand */}
              <div>
                <label className="mb-1 block text-xs text-cream/60">Brand</label>
                <input
                  type="text"
                  value={formBrand}
                  onChange={(e) => setFormBrand(e.target.value)}
                  placeholder="e.g. ALLOWRIE, Monini, Heinz"
                  className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-3 text-xs text-cream outline-none focus:border-forest-soft"
                />
              </div>

              {/* Package info row */}
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-cream/60">Weight</label>
                  <input
                    type="text"
                    value={formPackageWeight}
                    onChange={(e) => setFormPackageWeight(e.target.value)}
                    placeholder="2 kg"
                    className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-2 text-xs text-cream outline-none focus:border-forest-soft"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-cream/60">Qty</label>
                  <input
                    type="number"
                    value={formPackageQty}
                    onChange={(e) => setFormPackageQty(e.target.value)}
                    placeholder="1"
                    className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-2 text-xs text-cream outline-none focus:border-forest-soft"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-cream/60">Unit</label>
                  <select
                    value={formPackageUnit}
                    onChange={(e) => setFormPackageUnit(e.target.value)}
                    className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-2 text-xs text-cream outline-none focus:border-forest-soft"
                  >
                    <option value="">--</option>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="L">L</option>
                    <option value="ml">ml</option>
                    <option value="pcs">pcs</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-cream/60">Type</label>
                  <select
                    value={formPackageType}
                    onChange={(e) => setFormPackageType(e.target.value)}
                    className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-2 text-xs text-cream outline-none focus:border-forest-soft"
                  >
                    <option value="">--</option>
                    <option value="bottle">Bottle</option>
                    <option value="can">Can</option>
                    <option value="bag">Bag</option>
                    <option value="box">Box</option>
                    <option value="tub">Tub</option>
                    <option value="pouch">Pouch</option>
                    <option value="case">Case</option>
                  </select>
                </div>
              </div>

              {editingSku && (
                <div className="rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-3 py-2 text-[10px] text-cream/45">
                  SKU Code: <span className="font-mono text-mint-200">{editingSku.sku_code}</span>
                  {' · '}Auto-generated, not editable
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] px-5 py-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="h-8 rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-4 text-xs text-cream/80 hover:bg-[var(--s-3)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex h-8 items-center rounded-md border border-forest-soft/60 bg-forest-soft/15 px-4 text-xs font-medium text-mint-200 hover:bg-forest-soft/25 disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Save className="mr-1 h-3 w-3" />
                )}
                {editingSku ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
