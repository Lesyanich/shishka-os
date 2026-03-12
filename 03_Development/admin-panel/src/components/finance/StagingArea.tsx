import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Package,
  Pencil,
  Plus,
  Save,
  ShoppingCart,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import type { MappingMatch } from '../../hooks/useSupplierMapping'
import { CURRENCY_OPTIONS, PAYMENT_METHODS, formatTHB } from './helpers'
import { ReceiptImageViewer } from './ReceiptImageViewer'
import { nomenclatureOptionText } from './NomenclatureLabel'
import type {
  ParsedReceipt,
  ReceiptFooter,
  Reconciliation,
  FoodItem,
  CapexItem,
  OpexItem,
  ReceiptUrls,
  ApprovePayload,
} from '../../types/receipt'

/* ────────────────────────── Types ────────────────────────── */

export interface StagingAreaProps {
  receipt: ParsedReceipt
  receiptUrls: ReceiptUrls
  /** All uploaded image URLs for split-screen viewer (Phase 4.6) */
  imageUrls: string[]
  nomenclatureList: { id: string; name: string; product_code: string }[]
  suppliersList: { id: string; name: string; category_code?: number | null }[]
  categories: { code: number; name: string }[]
  subCategories: { sub_code: number; category_code: number; name: string }[]
  onApprove: (payload: ApprovePayload) => Promise<void>
  onCancel: () => void
  /** Save supplier→nomenclature mapping when user manually maps (Phase 4.6) */
  onSaveMapping?: (params: {
    supplierId: string
    supplierSku: string | null
    originalName: string
    nomenclatureId: string
  }) => Promise<void>
  /** Phase 6.3: Create new nomenclature item and return its ID */
  onCreateNomenclature?: (params: {
    name: string
    baseUnit: string
  }) => Promise<string>
  /** Phase 6.5: Lookup all mappings for a supplier → Map of MappingMatch */
  onLookupMappings?: (supplierId: string) => Promise<Map<string, MappingMatch>>
  /** Phase 6.5: Update conversion_factor for a supplier+nomenclature pair */
  onUpdateConversion?: (params: {
    supplierId: string
    nomenclatureId: string
    originalName: string
    supplierSku?: string | null
    purchaseUnit: string
    conversionFactor: number
    baseUnit: string
  }) => Promise<void>
}

/* ────────────────────────── Helpers ────────────────────────── */

function fuzzyMatchSupplier(
  aiName: string,
  suppliers: { id: string; name: string }[],
): string {
  if (!aiName) return ''
  const lower = aiName.toLowerCase()
  const exact = suppliers.find((s) => s.name.toLowerCase() === lower)
  if (exact) return exact.id
  const partial = suppliers.find(
    (s) =>
      s.name.toLowerCase().includes(lower) ||
      lower.includes(s.name.toLowerCase()),
  )
  return partial?.id ?? ''
}

/* Shared field styles */
const inputCls =
  'h-8 w-full rounded-lg border border-slate-700/60 bg-slate-800/80 px-2.5 text-xs text-slate-100 outline-none transition-all duration-200 focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 placeholder:text-slate-600'
const selectCls =
  'h-8 w-full rounded-lg border border-slate-700/60 bg-slate-800/80 px-1.5 text-xs text-slate-100 outline-none transition-all duration-200 focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20'
const labelCls = 'mb-1.5 block text-[11px] font-medium tracking-wide text-slate-400/80 uppercase'

/* ────────────────────────── Component ────────────────────────── */

export function StagingArea({
  receipt,
  receiptUrls,
  imageUrls,
  nomenclatureList,
  suppliersList,
  categories,
  subCategories,
  onApprove,
  onCancel,
  onSaveMapping,
  onCreateNomenclature,
  onLookupMappings,
  onUpdateConversion,
}: StagingAreaProps) {
  // ── Header state (editable) ──
  const [supplierId, setSupplierId] = useState(
    () => fuzzyMatchSupplier(receipt.supplier_name, suppliersList),
  )
  const [txDate, setTxDate] = useState(
    receipt.transaction_date || new Date().toISOString().split('T')[0],
  )
  const [invoiceNumber, setInvoiceNumber] = useState(
    receipt.invoice_number ?? '',
  )
  const [totalAmount, setTotalAmount] = useState(receipt.total_amount)
  const [currency, setCurrency] = useState(receipt.currency || 'THB')
  const [exchangeRate, setExchangeRate] = useState(currency === 'THB' ? 1 : 1)
  // Auto-detect flowType & category from supplier's default category
  const matchedSupplier = suppliersList.find((s) => s.id === supplierId)
  const supplierCat = matchedSupplier?.category_code
  const isCapExSupplier = supplierCat ? supplierCat >= 1000 && supplierCat < 2000 : false
  const [flowType, setFlowType] = useState<'OpEx' | 'CapEx'>(() =>
    isCapExSupplier ? 'CapEx' : 'OpEx',
  )
  const [categoryCode, setCategoryCode] = useState<number | ''>(() =>
    supplierCat ?? '',
  )
  const [subCategoryCode, setSubCategoryCode] = useState<number | ''>('')
  const [details, setDetails] = useState(
    `Receipt from ${receipt.supplier_name || 'supplier'}`,
  )
  const [paidBy, setPaidBy] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')

  // Phase 6.1: Reconciliation state (editable discount & VAT)
  const [discountTotal, setDiscountTotal] = useState(
    receipt.footer?.discount_total ?? 0,
  )
  const [vatAmount, setVatAmount] = useState(
    receipt.footer?.vat_amount ?? 0,
  )
  // Phase 6.6: Delivery fee state
  const [deliveryFee, setDeliveryFee] = useState(
    receipt.footer?.delivery_fee ?? 0,
  )

  // ── Auto-fill category from supplier on initial match ──
  useEffect(() => {
    if (supplierId && categoryCode === '') {
      const sup = suppliersList.find((s) => s.id === supplierId)
      if (sup?.category_code) setCategoryCode(sup.category_code)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- only on mount

  // ── Line items state (editable) ──
  const [foodItems, setFoodItems] = useState<FoodItem[]>(
    () => receipt.food_items.map((f) => ({ ...f })),
  )
  const [capexItems, setCapexItems] = useState<CapexItem[]>(
    () => receipt.capex_items.map((c) => ({ ...c })),
  )
  const [opexItems, setOpexItems] = useState<OpexItem[]>(
    () => receipt.opex_items.map((o) => ({ ...o })),
  )

  // ── Collapse state ──
  const [foodOpen, setFoodOpen] = useState(foodItems.length > 0)
  const [capexOpen, setCapexOpen] = useState(capexItems.length > 0)
  const [opexOpen, setOpexOpen] = useState(opexItems.length > 0)

  // ── UI state ──
  const [isApproving, setIsApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Phase 6.3: Create New Item modal state
  const [createModalIndex, setCreateModalIndex] = useState<number | null>(null)
  const [createName, setCreateName] = useState('')
  const [createUnit, setCreateUnit] = useState<'kg' | 'L' | 'pcs'>('kg')

  // Phase 6.5: UoM mapping data (loaded from supplier_item_mapping)
  const [uomMap, setUomMap] = useState<Map<string, MappingMatch>>(new Map())
  // Track which food item index is being UoM-edited (inline editor)
  const [uomEditIdx, setUomEditIdx] = useState<number | null>(null)
  const [uomPurchaseUnit, setUomPurchaseUnit] = useState('')
  const [uomFactor, setUomFactor] = useState('')
  const [uomBaseUnit, setUomBaseUnit] = useState<'kg' | 'L' | 'pcs'>('kg')

  // Load mapping data on mount (if supplier is resolved)
  useEffect(() => {
    if (supplierId && onLookupMappings) {
      onLookupMappings(supplierId).then(setUomMap)
    }
  }, [supplierId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Helper: find UoM data for a food item
  const getUomForItem = useCallback(
    (item: FoodItem): MappingMatch | null => {
      if (uomMap.size === 0) return null
      if (item.supplier_sku) {
        const skuMatch = uomMap.get(`sku:${item.supplier_sku}`)
        if (skuMatch) return skuMatch
      }
      if (item.original_name) {
        const nameMatch = uomMap.get(`name:${item.original_name.toLowerCase()}`)
        if (nameMatch) return nameMatch
      }
      return null
    },
    [uomMap],
  )

  // ── Sub-category filtering ──
  const filteredSubCats = useMemo(
    () =>
      categoryCode !== ''
        ? subCategories.filter((sc) => sc.category_code === categoryCode)
        : [],
    [categoryCode, subCategories],
  )

  // ── Computed totals ──
  const foodTotal = foodItems.reduce((s, f) => s + (f.total_price || 0), 0)
  const capexTotal = capexItems.reduce((s, c) => s + (c.total_price || 0), 0)
  const opexTotal = opexItems.reduce((s, o) => s + (o.total_price || 0), 0)
  const computedTotal = foodTotal + capexTotal + opexTotal

  // ── Validation: all food items must have nomenclature_id ──
  const allFoodMapped =
    foodItems.length === 0 ||
    foodItems.every((f) => f.nomenclature_id && f.nomenclature_id !== '')

  const canApprove = totalAmount > 0 && allFoodMapped && !isApproving

  // ── Handlers ──
  const updateFood = (i: number, patch: Partial<FoodItem>) => {
    setFoodItems((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))

    // Phase 4.6: Save mapping when user manually maps nomenclature
    if (
      patch.nomenclature_id &&
      patch.nomenclature_id !== '' &&
      patch.nomenclature_id !== '__NEW__' &&
      supplierId &&
      onSaveMapping
    ) {
      const item = foodItems[i]
      onSaveMapping({
        supplierId,
        supplierSku: item.supplier_sku ?? null,
        originalName: item.original_name ?? item.name,
        nomenclatureId: patch.nomenclature_id,
      })
    }
  }

  const updateCapex = (i: number, patch: Partial<CapexItem>) =>
    setCapexItems((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  const updateOpex = (i: number, patch: Partial<OpexItem>) =>
    setOpexItems((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)))

  const removeFood = (i: number) => setFoodItems((prev) => prev.filter((_, idx) => idx !== i))
  const removeCapex = (i: number) => setCapexItems((prev) => prev.filter((_, idx) => idx !== i))
  const removeOpex = (i: number) => setOpexItems((prev) => prev.filter((_, idx) => idx !== i))

  const addFood = () =>
    setFoodItems((prev) => [
      ...prev,
      { name: '', quantity: 1, unit: 'kg', unit_price: 0, total_price: 0, original_name: '' },
    ])
  const addCapex = () =>
    setCapexItems((prev) => [
      ...prev,
      { name: '', quantity: 1, unit_price: 0, total_price: 0 },
    ])
  const addOpex = () =>
    setOpexItems((prev) => [
      ...prev,
      { description: '', quantity: 1, unit: 'pcs', unit_price: 0, total_price: 0 },
    ])

  // Phase 4.7: Move opex/uncategorized item → food items
  const moveOpexToFood = (i: number) => {
    const item = opexItems[i]
    setOpexItems((prev) => prev.filter((_, idx) => idx !== i))
    setFoodItems((prev) => [
      ...prev,
      {
        name: item.description,
        quantity: item.quantity,
        unit: item.unit || 'pcs',
        unit_price: item.unit_price,
        total_price: item.total_price,
      },
    ])
    if (!foodOpen) setFoodOpen(true)
  }

  const handleApprove = async () => {
    setIsApproving(true)
    setError(null)

    try {
      const payload: ApprovePayload = {
        transaction_date: txDate,
        flow_type: flowType,
        category_code: categoryCode !== '' ? categoryCode : null,
        sub_category_code: subCategoryCode !== '' ? subCategoryCode : null,
        supplier_id: supplierId || null,
        details: details.trim(),
        comments: null,
        invoice_number: invoiceNumber.trim() || null,
        amount_original: totalAmount,
        currency,
        exchange_rate: currency === 'THB' ? 1 : exchangeRate,
        discount_total: discountTotal,
        vat_amount: vatAmount,
        delivery_fee: deliveryFee,
        paid_by: paidBy.trim(),
        payment_method: paymentMethod,
        status: 'paid',
        has_tax_invoice: !!receiptUrls.tax,
        receipt_supplier_url: receiptUrls.supplier ?? null,
        receipt_bank_url: receiptUrls.bank ?? null,
        tax_invoice_url: receiptUrls.tax ?? null,
        // Transform __NEW__ sentinel → null so RPC auto-creates nomenclature
        food_items: foodItems.map((f) => ({
          ...f,
          nomenclature_id: f.nomenclature_id === '__NEW__' ? null : f.nomenclature_id,
        })),
        capex_items: capexItems,
        opex_items: opexItems,
      }

      await onApprove(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsApproving(false)
    }
  }

  const totalItems = foodItems.length + capexItems.length + opexItems.length

  return (
    <section className="animate-fade-in-up overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-b from-slate-900/90 to-slate-950/90 shadow-xl shadow-indigo-500/[0.04]">
      {/* ═══ Header ═══ */}
      <header className="relative border-b border-slate-800/60 px-5 py-4">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-indigo-500/[0.04] via-transparent to-violet-500/[0.04]" />

        <div className="relative flex items-center gap-3">
          <div className="rounded-xl bg-indigo-500/10 p-2 shadow-sm shadow-indigo-500/10">
            <Sparkles className="h-4.5 w-4.5 text-indigo-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold tracking-wide text-slate-100">
              AI Receipt Preview
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {totalItems} item{totalItems !== 1 ? 's' : ''} extracted &middot; Review before saving
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-slate-500 transition-all duration-200 hover:bg-slate-800 hover:text-slate-300"
            title="Cancel & return to manual form"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ═══ Split-Screen: Image Viewer (top) + Data (bottom) ═══ */}
      <div className="px-5 py-5">
        {/* Phase 4.6: Receipt Image Viewer */}
        {imageUrls.length > 0 && (
          <div className="mb-5">
            <ReceiptImageViewer imageUrls={imageUrls} />
          </div>
        )}

        {/* Phase 6.6c: Reconciliation Panel — ALWAYS rendered (footer fallback if GAS didn't send one) */}
        <ReconciliationPanel
          footer={receipt.footer ?? {
            subtotal: 0,
            discount_total: 0,
            vat_amount: 0,
            delivery_fee: 0,
            grand_total: receipt.total_amount || 0,
          }}
          reconciliation={receipt._reconciliation}
          itemsSum={computedTotal}
          discountTotal={discountTotal}
          vatAmount={vatAmount}
          deliveryFee={deliveryFee}
          onDiscountChange={setDiscountTotal}
          onVatChange={setVatAmount}
          onDeliveryFeeChange={setDeliveryFee}
        />

        {/* Phase 6.2: AI warnings banner */}
        {receipt._warnings && receipt._warnings.length > 0 && (
          <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3">
            <p className="text-[11px] font-medium text-rose-300">AI Warnings:</p>
            <ul className="mt-1 space-y-0.5">
              {receipt._warnings.map((w, i) => (
                <li key={i} className="text-[10px] text-rose-300/70">{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="stagger-children space-y-5">
          {/* ── Error ── */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
              <p className="text-xs leading-relaxed text-red-300/90">{error}</p>
            </div>
          )}

          {/* ═══ SECTION: Supplier + Date + Invoice ═══ */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Supplier</label>
              <select
                value={supplierId}
                onChange={(e) => {
                  const newId = e.target.value
                  setSupplierId(newId)
                  // Auto-fill category from supplier's default category_code
                  if (newId) {
                    const sup = suppliersList.find((s) => s.id === newId)
                    if (sup?.category_code && categoryCode === '') {
                      setCategoryCode(sup.category_code)
                    }
                  }
                }}
                className={selectCls}
              >
                <option value="">Select supplier...</option>
                {suppliersList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {receipt.supplier_name && !supplierId && (
                <p className="mt-1 flex items-center gap-1 text-[10px] text-amber-400/80">
                  <span className="inline-block h-1 w-1 rounded-full bg-amber-400" />
                  AI detected: &quot;{receipt.supplier_name}&quot;
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input
                type="date"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Invoice #</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-..."
                className={inputCls}
              />
            </div>
          </div>

          {/* ═══ SECTION: Amount + Currency + Exchange Rate ═══ */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Total Amount</label>
              <input
                type="number"
                step="0.01"
                value={totalAmount}
                onChange={(e) => setTotalAmount(Number(e.target.value))}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className={labelCls}>Currency</label>
              <select
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value)
                  if (e.target.value === 'THB') setExchangeRate(1)
                }}
                className={selectCls}
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>
                {currency === 'THB' ? 'Rate (1.00)' : `Rate ${currency} \u2192 THB`}
              </label>
              <input
                type="number"
                step="0.0001"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(Number(e.target.value))}
                disabled={currency === 'THB'}
                className={`${inputCls} font-mono disabled:opacity-30`}
              />
            </div>
          </div>

          {/* ═══ SECTION: Flow Type + Category + Sub-category ═══ */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Type</label>
              <div className="flex gap-2">
                {(['OpEx', 'CapEx'] as const).map((ft) => (
                  <button
                    key={ft}
                    type="button"
                    onClick={() => setFlowType(ft)}
                    className={`h-8 flex-1 rounded-lg border text-xs font-medium tracking-wide transition-all duration-200 ${
                      flowType === ft
                        ? ft === 'OpEx'
                          ? 'border-emerald-500/50 bg-emerald-500/[0.12] text-emerald-300 shadow-sm shadow-emerald-500/10'
                          : 'border-amber-500/50 bg-amber-500/[0.12] text-amber-300 shadow-sm shadow-amber-500/10'
                        : 'border-slate-700/60 bg-slate-800/60 text-slate-500 hover:border-slate-600 hover:text-slate-400'
                    }`}
                  >
                    {ft}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <select
                value={categoryCode}
                onChange={(e) => {
                  const v = e.target.value === '' ? '' : Number(e.target.value)
                  setCategoryCode(v as number | '')
                  setSubCategoryCode('')
                }}
                className={selectCls}
              >
                <option value="">Select...</option>
                {categories.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} &mdash; {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Sub-category</label>
              <select
                value={subCategoryCode}
                onChange={(e) =>
                  setSubCategoryCode(e.target.value === '' ? '' : Number(e.target.value))
                }
                disabled={filteredSubCats.length === 0}
                className={`${selectCls} disabled:opacity-30`}
              >
                <option value="">
                  {filteredSubCats.length === 0 ? 'Pick category first' : 'Select...'}
                </option>
                {filteredSubCats.map((sc) => (
                  <option key={sc.sub_code} value={sc.sub_code}>
                    {sc.sub_code} &mdash; {sc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ═══ SECTION: Details + Payment ═══ */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Details</label>
              <input
                type="text"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Paid by</label>
              <input
                type="text"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                placeholder="Name..."
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Payment</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className={selectCls}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Document classification banner */}
          {receipt.documents && (
            <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-700/40 bg-slate-800/30 px-4 py-2.5">
              <Sparkles className="h-3.5 w-3.5 text-indigo-400/70" />
              <span className="text-[11px] font-medium text-slate-500">Documents:</span>
              {receipt.documents.supplier_receipt_index != null && (
                <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-500/20">
                  Image {receipt.documents.supplier_receipt_index + 1} = Supplier Receipt
                </span>
              )}
              {receipt.documents.tax_invoice_index != null && (
                <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-amber-500/20">
                  Image {receipt.documents.tax_invoice_index + 1} = Tax Invoice
                </span>
              )}
              {receipt.documents.bank_slip_index != null && (
                <span className="rounded-md bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300 ring-1 ring-cyan-500/20">
                  Image {receipt.documents.bank_slip_index + 1} = Bank Slip
                </span>
              )}
              {receipt.documents.supplier_receipt_index === receipt.documents.tax_invoice_index &&
                receipt.documents.supplier_receipt_index != null && (
                <span className="text-[10px] italic text-slate-500">
                  (same document)
                </span>
              )}
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-700/50 to-transparent" />
            <span className="text-[10px] font-medium tracking-widest text-slate-600 uppercase">
              Line Items
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-700/50 to-transparent" />
          </div>

          {/* ═══ Food Items (Spoke 1) ═══ */}
          <ItemSection
            title="Food Items"
            icon={<ShoppingCart className="h-3.5 w-3.5" />}
            count={foodItems.length}
            total={foodTotal}
            open={foodOpen}
            onToggle={() => setFoodOpen(!foodOpen)}
            color="emerald"
            headers={['Item', 'Brand', 'Wt', 'Qty', 'Unit', 'Price', 'Total', 'Nomenclature', '']}
            colWidths={['', 'w-20', 'w-16', 'w-14', 'w-14', 'w-18', 'w-18', 'w-36', 'w-8']}
          >
            {foodItems.map((item, i) => {
              // Phase 6.2: Find matching line_item for confidence/warning data
              const lineItem = receipt.line_items?.find(
                (li) =>
                  (li.supplier_sku && li.supplier_sku === item.supplier_sku) ||
                  (li.original_name && li.original_name === item.original_name),
              )
              const confidence = lineItem?.confidence ?? 'high'
              const warning = lineItem?._warning
              const lineNumber = lineItem?.line_number
              const confidenceBorder =
                confidence === 'low'
                  ? 'border-l-2 border-l-rose-500'
                  : confidence === 'medium'
                    ? 'border-l-2 border-l-amber-500'
                    : ''
              const isUnreadable = item.name === '[UNREADABLE]'
              // Phase 6.6: Math validation — qty × unit_price ≈ total_price
              const expectedTotal = Math.round(item.quantity * item.unit_price * 100) / 100
              const hasMathError = item.quantity > 0 && item.unit_price > 0 && item.total_price > 0
                && Math.abs(expectedTotal - item.total_price) > 2

              return (
              <tr
                key={i}
                className={`group/row border-b border-slate-800/30 transition-colors duration-150 hover:bg-slate-800/20 ${confidenceBorder} ${isUnreadable ? 'bg-slate-800/40' : ''}`}
                title={warning || undefined}
              >
                <td className="px-1.5 py-1.5">
                  {/* Line number + editable name */}
                  <div className="flex items-center gap-1.5">
                    {lineNumber && (
                      <span className="shrink-0 rounded bg-slate-700/60 px-1 py-0.5 font-mono text-[9px] text-slate-500">
                        #{lineNumber}
                      </span>
                    )}
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateFood(i, { name: e.target.value })}
                      className={`${inputCls} flex-1 ${isUnreadable ? 'italic text-slate-500' : ''}`}
                    />
                    {/* Phase 6.7: Makro verification badge */}
                    {item.makro_name && (
                      <span className="ml-1 shrink-0 text-[9px] text-emerald-400" title={`Verified by Makro: ${item.makro_name}`}>
                        ✓
                      </span>
                    )}
                  </div>
                  {/* Metadata chips row — UNDER the name */}
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {/* Thai original (always show for CEO verification) */}
                    {item.original_name && (
                      <span
                        className="truncate rounded bg-slate-700/40 px-1 py-0.5 text-[9px] text-slate-500 max-w-[180px]"
                        title={item.original_name}
                      >
                        {item.original_name}
                      </span>
                    )}
                    {/* SKU chip */}
                    {item.supplier_sku && (
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(item.supplier_sku!)}
                        title={`Copy SKU: ${item.supplier_sku}`}
                        className="shrink-0 rounded bg-slate-600/30 px-1 py-0.5 font-mono text-[9px] text-slate-400 hover:bg-slate-600/50"
                      >
                        SKU:{item.supplier_sku}
                      </button>
                    )}
                  </div>
                  {/* Warning tooltip */}
                  {warning && (
                    <p className="mt-0.5 text-[9px] text-rose-400/70">{warning}</p>
                  )}
                </td>
                {/* Phase 6.7: Brand column */}
                <td className="w-20 px-1 py-1.5">
                  {item.brand && (
                    <span className="text-xs text-purple-400">{item.brand}</span>
                  )}
                </td>
                {/* Phase 6.7: Weight column */}
                <td className="w-16 px-1 py-1.5">
                  {item.package_weight && (
                    <span className="text-xs text-orange-400">{item.package_weight}</span>
                  )}
                </td>
                <td className="w-14 px-1.5 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) => updateFood(i, { quantity: Number(e.target.value) })}
                    className={`${inputCls} font-mono`}
                  />
                </td>
                <td className="w-14 px-1.5 py-1.5">
                  <input
                    type="text"
                    value={item.unit}
                    onChange={(e) => updateFood(i, { unit: e.target.value })}
                    className={inputCls}
                  />
                </td>
                <td className="w-18 px-1.5 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    value={item.unit_price}
                    onChange={(e) => updateFood(i, { unit_price: Number(e.target.value) })}
                    className={`${inputCls} font-mono ${hasMathError ? 'text-rose-400 border-rose-500/50' : ''}`}
                  />
                </td>
                <td className="w-18 px-1.5 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    value={item.total_price}
                    onChange={(e) => updateFood(i, { total_price: Number(e.target.value) })}
                    className={`${inputCls} font-mono ${hasMathError ? 'text-rose-400 border-rose-500/50' : ''}`}
                  />
                  {hasMathError && (
                    <p className="mt-0.5 flex items-center gap-0.5 text-[9px] text-rose-400">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      Math: {item.quantity}&times;{item.unit_price}={expectedTotal}
                    </p>
                  )}
                </td>
                <td className="w-36 px-1.5 py-1.5">
                  <select
                    value={item.nomenclature_id || ''}
                    onChange={(e) => {
                      if (e.target.value === '__CREATE__') {
                        setCreateModalIndex(i)
                        setCreateName(item.name || '')
                        setCreateUnit('kg')
                      } else {
                        updateFood(i, { nomenclature_id: e.target.value })
                      }
                    }}
                    className={`${selectCls} ${
                      !item.nomenclature_id
                        ? 'border-amber-500/40 ring-1 ring-amber-500/10'
                        : 'border-emerald-500/30'
                    }`}
                  >
                    <option value="">Map to item...</option>
                    {item.name && (
                      <option value="__CREATE__">
                        + Create new: &quot;{item.name}&quot;
                      </option>
                    )}
                    {nomenclatureList.map((n) => (
                      <option key={n.id} value={n.id}>
                        {nomenclatureOptionText(n.product_code, n.name)}
                      </option>
                    ))}
                  </select>
                  {/* ── Phase 6.5: UoM Badge + Inline Editor ── */}
                  {item.nomenclature_id && item.nomenclature_id !== '' && item.nomenclature_id !== '__NEW__' && (() => {
                    const uom = getUomForItem(item)
                    const hasUom = uom?.conversionFactor != null && uom.conversionFactor > 0

                    if (uomEditIdx === i) {
                      // Inline UoM editor
                      return (
                        <div className="mt-1 flex items-center gap-1 rounded-md border border-indigo-500/30 bg-slate-800/60 px-1.5 py-1">
                          <input
                            type="text"
                            value={uomPurchaseUnit}
                            onChange={(e) => setUomPurchaseUnit(e.target.value)}
                            placeholder="unit"
                            className="h-5 w-12 rounded border border-slate-700 bg-slate-900/60 px-1 text-[10px] text-slate-200 outline-none focus:border-indigo-500/50"
                          />
                          <span className="text-[10px] text-slate-500">&times;</span>
                          <input
                            type="number"
                            step="0.001"
                            value={uomFactor}
                            onChange={(e) => setUomFactor(e.target.value)}
                            placeholder="factor"
                            className="h-5 w-14 rounded border border-slate-700 bg-slate-900/60 px-1 font-mono text-[10px] text-slate-200 outline-none focus:border-indigo-500/50"
                          />
                          <select
                            value={uomBaseUnit}
                            onChange={(e) => setUomBaseUnit(e.target.value as 'kg' | 'L' | 'pcs')}
                            className="h-5 rounded border border-slate-700 bg-slate-900/60 px-0.5 text-[10px] text-slate-200 outline-none focus:border-indigo-500/50"
                          >
                            <option value="kg">kg</option>
                            <option value="L">L</option>
                            <option value="pcs">pcs</option>
                          </select>
                          <button
                            type="button"
                            title="Save UoM"
                            onClick={async () => {
                              const factor = parseFloat(uomFactor)
                              if (onUpdateConversion && factor > 0 && supplierId) {
                                await onUpdateConversion({
                                  supplierId,
                                  nomenclatureId: item.nomenclature_id!,
                                  originalName: item.original_name ?? item.name,
                                  supplierSku: item.supplier_sku,
                                  purchaseUnit: uomPurchaseUnit,
                                  conversionFactor: factor,
                                  baseUnit: uomBaseUnit,
                                })
                                // Refresh mapping data
                                if (onLookupMappings) {
                                  const fresh = await onLookupMappings(supplierId)
                                  setUomMap(fresh)
                                }
                              }
                              setUomEditIdx(null)
                            }}
                            className="rounded p-0.5 text-emerald-400 hover:bg-emerald-500/20"
                          >
                            <Save className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            title="Cancel"
                            onClick={() => setUomEditIdx(null)}
                            className="rounded p-0.5 text-slate-500 hover:bg-slate-500/20"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      )
                    }

                    // UoM display badge (clickable to edit)
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          setUomEditIdx(i)
                          setUomPurchaseUnit(uom?.purchaseUnit || item.unit || '')
                          setUomFactor(uom?.conversionFactor?.toString() || '1')
                          setUomBaseUnit((uom?.baseUnit as 'kg' | 'L' | 'pcs') || 'kg')
                        }}
                        className={`mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] transition-colors ${
                          hasUom
                            ? 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20'
                            : 'bg-slate-700/30 text-slate-500 hover:bg-slate-700/50'
                        }`}
                        title={hasUom ? 'Edit UoM conversion' : 'Set UoM conversion'}
                      >
                        {hasUom ? (
                          <>
                            1 {uom!.purchaseUnit} &rarr; {uom!.conversionFactor} {uom!.baseUnit}
                            <Pencil className="ml-0.5 h-2.5 w-2.5" />
                          </>
                        ) : (
                          <>
                            <Plus className="h-2.5 w-2.5" /> UoM
                          </>
                        )}
                      </button>
                    )
                  })()}
                </td>
                <td className="w-8 px-1.5 py-1.5">
                  <button
                    type="button"
                    onClick={() => removeFood(i)}
                    className="rounded-lg p-1 text-slate-600 opacity-0 transition-all duration-150 hover:bg-red-500/10 hover:text-red-400 group-hover/row:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </td>
              </tr>
              )
            })}
            <tr>
              <td colSpan={7} className="px-1.5 py-2">
                <button
                  type="button"
                  onClick={addFood}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-emerald-400/80 transition-all duration-200 hover:bg-emerald-500/10 hover:text-emerald-300"
                >
                  <Plus className="h-3 w-3" /> Add food item
                </button>
              </td>
            </tr>
          </ItemSection>

          {/* ═══ CapEx Items (Spoke 2) ═══ */}
          <ItemSection
            title="CapEx Items"
            icon={<Wrench className="h-3.5 w-3.5" />}
            count={capexItems.length}
            total={capexTotal}
            open={capexOpen}
            onToggle={() => setCapexOpen(!capexOpen)}
            color="amber"
            headers={['Item', 'Qty', 'Price', 'Total', '']}
            colWidths={['', 'w-16', 'w-20', 'w-20', 'w-8']}
          >
            {capexItems.map((item, i) => (
              <tr
                key={i}
                className="group/row border-b border-slate-800/30 transition-colors duration-150 hover:bg-slate-800/20"
              >
                <td className="px-1.5 py-1.5">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updateCapex(i, { name: e.target.value })}
                    className={inputCls}
                  />
                </td>
                <td className="w-16 px-1.5 py-1.5">
                  <input
                    type="number"
                    step="1"
                    value={item.quantity}
                    onChange={(e) => updateCapex(i, { quantity: Number(e.target.value) })}
                    className={`${inputCls} font-mono`}
                  />
                </td>
                <td className="w-20 px-1.5 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    value={item.unit_price}
                    onChange={(e) => updateCapex(i, { unit_price: Number(e.target.value) })}
                    className={`${inputCls} font-mono`}
                  />
                </td>
                <td className="w-20 px-1.5 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    value={item.total_price}
                    onChange={(e) => updateCapex(i, { total_price: Number(e.target.value) })}
                    className={`${inputCls} font-mono`}
                  />
                </td>
                <td className="w-8 px-1.5 py-1.5">
                  <button
                    type="button"
                    onClick={() => removeCapex(i)}
                    className="rounded-lg p-1 text-slate-600 opacity-0 transition-all duration-150 hover:bg-red-500/10 hover:text-red-400 group-hover/row:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={5} className="px-1.5 py-2">
                <button
                  type="button"
                  onClick={addCapex}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-amber-400/80 transition-all duration-200 hover:bg-amber-500/10 hover:text-amber-300"
                >
                  <Plus className="h-3 w-3" /> Add capex item
                </button>
              </td>
            </tr>
          </ItemSection>

          {/* ═══ OpEx Items (Spoke 3) ═══ */}
          <ItemSection
            title="OpEx Items"
            icon={<Package className="h-3.5 w-3.5" />}
            count={opexItems.length}
            total={opexTotal}
            open={opexOpen}
            onToggle={() => setOpexOpen(!opexOpen)}
            color="cyan"
            headers={['Description', 'Qty', 'Unit', 'Price', 'Total', '', '']}
            colWidths={['', 'w-16', 'w-16', 'w-20', 'w-20', 'w-8', 'w-8']}
          >
            {opexItems.map((item, i) => (
              <tr
                key={i}
                className="group/row border-b border-slate-800/30 transition-colors duration-150 hover:bg-slate-800/20"
              >
                <td className="px-1.5 py-1.5">
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateOpex(i, { description: e.target.value })}
                    className={inputCls}
                  />
                </td>
                <td className="w-16 px-1.5 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) => updateOpex(i, { quantity: Number(e.target.value) })}
                    className={`${inputCls} font-mono`}
                  />
                </td>
                <td className="w-16 px-1.5 py-1.5">
                  <input
                    type="text"
                    value={item.unit}
                    onChange={(e) => updateOpex(i, { unit: e.target.value })}
                    className={inputCls}
                  />
                </td>
                <td className="w-20 px-1.5 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    value={item.unit_price}
                    onChange={(e) => updateOpex(i, { unit_price: Number(e.target.value) })}
                    className={`${inputCls} font-mono`}
                  />
                </td>
                <td className="w-20 px-1.5 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    value={item.total_price}
                    onChange={(e) => updateOpex(i, { total_price: Number(e.target.value) })}
                    className={`${inputCls} font-mono`}
                  />
                </td>
                <td className="w-8 px-1.5 py-1.5">
                  <button
                    type="button"
                    onClick={() => moveOpexToFood(i)}
                    title="Move to Food items"
                    className="rounded-lg p-1 text-slate-600 opacity-0 transition-all duration-150 hover:bg-emerald-500/10 hover:text-emerald-400 group-hover/row:opacity-100"
                  >
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                </td>
                <td className="w-8 px-1.5 py-1.5">
                  <button
                    type="button"
                    onClick={() => removeOpex(i)}
                    className="rounded-lg p-1 text-slate-600 opacity-0 transition-all duration-150 hover:bg-red-500/10 hover:text-red-400 group-hover/row:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={7} className="px-1.5 py-2">
                <button
                  type="button"
                  onClick={addOpex}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-cyan-400/80 transition-all duration-200 hover:bg-cyan-500/10 hover:text-cyan-300"
                >
                  <Plus className="h-3 w-3" /> Add opex item
                </button>
              </td>
            </tr>
          </ItemSection>

          {/* ═══ Category Breakdown + Warnings ═══ */}
          <div className="overflow-hidden rounded-xl border border-slate-700/40 bg-slate-800/30">
            <div className="flex divide-x divide-slate-700/30">
              {[
                { label: 'Food', value: foodTotal, color: 'text-emerald-400' },
                { label: 'CapEx', value: capexTotal, color: 'text-amber-400' },
                { label: 'OpEx', value: opexTotal, color: 'text-cyan-400' },
              ].map((item) => (
                <div key={item.label} className="flex-1 px-3 py-2 text-center">
                  <p className="text-[10px] tracking-wider text-slate-500 uppercase">
                    {item.label}
                  </p>
                  <p className={`font-mono text-xs font-medium ${item.color}`}>
                    {formatTHB(item.value)}
                  </p>
                </div>
              ))}
            </div>

            {!allFoodMapped && foodItems.length > 0 && (
              <div className="border-t border-slate-700/30 px-4 py-3">
                <div className="flex items-start gap-2 rounded-lg bg-amber-500/[0.06] px-3 py-2">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/80" />
                  <p className="text-[11px] leading-relaxed text-amber-300/80">
                    All food items must be mapped to nomenclature or marked &quot;Create new&quot; before approval
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ═══ Phase 6.3: Create New Item Modal ═══ */}
          {createModalIndex !== null && (
            <div className="overflow-hidden rounded-xl border border-violet-500/30 bg-violet-500/[0.06]">
              <div className="px-4 py-3">
                <p className="text-xs font-medium text-violet-300">Create New Inventory Item</p>
                <div className="mt-3 grid grid-cols-[1fr_auto] gap-3">
                  <div>
                    <label className={labelCls}>Name</label>
                    <input
                      type="text"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      className={inputCls}
                      autoFocus
                    />
                    {/* Fuzzy match: suggest existing items */}
                    {createName.length >= 2 && (() => {
                      const lower = createName.toLowerCase()
                      const matches = nomenclatureList.filter(
                        (n) => n.name.toLowerCase().includes(lower) || lower.includes(n.name.toLowerCase()),
                      ).slice(0, 3)
                      if (matches.length === 0) return null
                      return (
                        <div className="mt-1.5 space-y-1">
                          <p className="text-[9px] text-slate-500">Did you mean?</p>
                          {matches.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                updateFood(createModalIndex, { nomenclature_id: m.id })
                                setCreateModalIndex(null)
                              }}
                              className="block w-full rounded-lg border border-slate-700/40 bg-slate-800/40 px-2.5 py-1.5 text-left text-[10px] text-slate-300 transition-colors hover:border-indigo-500/30 hover:bg-indigo-500/[0.06]"
                            >
                              <span className="font-mono text-indigo-400">{m.product_code}</span>{' '}
                              {m.name}
                            </button>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                  <div>
                    <label className={labelCls}>Base unit</label>
                    <div className="flex gap-1">
                      {(['kg', 'L', 'pcs'] as const).map((u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setCreateUnit(u)}
                          className={`h-8 rounded-lg border px-3 text-xs font-medium transition-all ${
                            createUnit === u
                              ? 'border-violet-500/50 bg-violet-500/[0.15] text-violet-300'
                              : 'border-slate-700/60 bg-slate-800/60 text-slate-500 hover:text-slate-400'
                          }`}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateModalIndex(null)}
                    className="h-8 rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!createName.trim() || !onCreateNomenclature}
                    onClick={async () => {
                      if (!onCreateNomenclature || createModalIndex === null) return
                      try {
                        const newId = await onCreateNomenclature({
                          name: createName.trim(),
                          baseUnit: createUnit,
                        })
                        updateFood(createModalIndex, { nomenclature_id: newId })
                        setCreateModalIndex(null)
                      } catch (err) {
                        setError(err instanceof Error ? err.message : String(err))
                      }
                    }}
                    className="h-8 rounded-lg border border-violet-500/40 bg-violet-500/[0.12] px-4 text-xs font-medium text-violet-200 transition-all hover:bg-violet-500/20 disabled:opacity-40"
                  >
                    Create & Map
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Action Buttons ═══ */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="h-10 flex-1 rounded-xl border border-slate-700/50 bg-slate-800/50 text-xs font-medium tracking-wide text-slate-400 transition-all duration-200 hover:border-slate-600 hover:bg-slate-800 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={!canApprove}
              className={`group/approve relative h-10 flex-1 overflow-hidden rounded-xl border text-sm font-medium tracking-wide transition-all duration-300 disabled:opacity-40 ${
                canApprove
                  ? 'border-indigo-500/40 bg-indigo-500/[0.12] text-indigo-200 shadow-sm shadow-indigo-500/10 hover:border-indigo-400/50 hover:bg-indigo-500/20 hover:shadow-md hover:shadow-indigo-500/15'
                  : 'border-slate-700/40 bg-slate-800/50 text-slate-500'
              }`}
            >
              {canApprove && (
                <div className="absolute inset-0 translate-x-[-200%] bg-gradient-to-r from-transparent via-white/[0.03] to-transparent transition-transform duration-700 group-hover/approve:translate-x-[200%]" />
              )}
              <span className="relative inline-flex items-center gap-2">
                {isApproving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {isApproving ? 'Saving...' : 'Approve & Save'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ────────────────────────── Sub-component: Section ────────────────────────── */

function ItemSection({
  title,
  icon,
  count,
  total,
  open,
  onToggle,
  color,
  headers,
  colWidths,
  children,
}: {
  title: string
  icon: React.ReactNode
  count: number
  total: number
  open: boolean
  onToggle: () => void
  color: 'emerald' | 'amber' | 'cyan'
  headers: string[]
  colWidths: string[]
  children: React.ReactNode
}) {
  const colorMap = {
    emerald: {
      badge: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
      icon: 'text-emerald-400/70',
      border: 'border-emerald-500/10',
      header: 'from-emerald-500/[0.03]',
    },
    amber: {
      badge: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20',
      icon: 'text-amber-400/70',
      border: 'border-amber-500/10',
      header: 'from-amber-500/[0.03]',
    },
    cyan: {
      badge: 'bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/20',
      icon: 'text-cyan-400/70',
      border: 'border-cyan-500/10',
      header: 'from-cyan-500/[0.03]',
    },
  }

  const c = colorMap[color]

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-800/60 bg-slate-900/40 ${open ? c.border : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors duration-200 hover:bg-slate-800/30 ${
          open ? `bg-gradient-to-r ${c.header} to-transparent` : ''
        }`}
      >
        <span className={c.icon}>
          {icon}
        </span>
        {open ? (
          <ChevronDown className="h-3 w-3 text-slate-500" />
        ) : (
          <ChevronRight className="h-3 w-3 text-slate-500" />
        )}
        <span className="text-xs font-medium tracking-wide text-slate-200">{title}</span>
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${c.badge}`}>
          {count}
        </span>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-slate-500">
          {formatTHB(total)}
        </span>
      </button>

      {open && (
        <div className="animate-expand overflow-x-auto border-t border-slate-800/40">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800/30">
                {headers.map((h, i) => (
                  <th
                    key={i}
                    className={`px-1.5 py-2 text-left text-[10px] font-medium tracking-wider text-slate-500/70 uppercase ${colWidths[i] || ''}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ────────────────────────── Sub-component: Reconciliation Panel ────────────────────────── */

function ReconciliationPanel({
  footer,
  itemsSum,
  discountTotal,
  vatAmount,
  deliveryFee,
  onDiscountChange,
  onVatChange,
  onDeliveryFeeChange,
}: {
  footer: ReceiptFooter
  reconciliation?: Reconciliation
  itemsSum: number
  discountTotal: number
  vatAmount: number
  deliveryFee: number
  onDiscountChange: (v: number) => void
  onVatChange: (v: number) => void
  onDeliveryFeeChange: (v: number) => void
}) {
  const grandTotal = itemsSum + discountTotal + vatAmount + deliveryFee
  const declaredTotal = footer.grand_total
  const isBalanced = Math.abs(grandTotal - declaredTotal) <= 2

  return (
    <div
      className={`mb-4 overflow-hidden rounded-xl border ${
        isBalanced
          ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
          : 'border-amber-500/30 bg-amber-500/[0.06]'
      }`}
    >
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2.5">
          {isBalanced ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          )}
          <span className={`text-[11px] font-medium ${isBalanced ? 'text-emerald-300' : 'text-amber-300'}`}>
            {isBalanced ? 'Receipt balanced' : 'Receipt not balanced — adjust discount/VAT'}
          </span>
        </div>

        <div className="space-y-1.5">
          {/* ── Subtotal row ── */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Subtotal</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-200">{formatTHB(itemsSum)}</span>
              {footer.subtotal > 0 && Math.abs(itemsSum - footer.subtotal) > 2 && (
                <span className="font-mono text-[9px] text-amber-400" title="Receipt subtotal">
                  (receipt: {formatTHB(footer.subtotal)})
                </span>
              )}
            </div>
          </div>

          {/* ── Discount row (editable, red) ── */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-rose-400">Discount</span>
            <input
              type="number"
              step="1"
              value={discountTotal}
              onChange={(e) => onDiscountChange(Number(e.target.value))}
              className="h-6 w-24 rounded border border-rose-500/30 bg-slate-800/80 px-2 text-right font-mono text-xs text-rose-300 outline-none focus:border-rose-500/60"
            />
          </div>

          {/* ── VAT row (editable) ── */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">VAT</span>
            <input
              type="number"
              step="1"
              value={vatAmount}
              onChange={(e) => onVatChange(Number(e.target.value))}
              className="h-6 w-24 rounded border border-slate-700/60 bg-slate-800/80 px-2 text-right font-mono text-xs text-slate-300 outline-none focus:border-indigo-500/60"
            />
          </div>

          {/* ── Delivery row (editable, blue) ── */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-blue-400">Delivery</span>
            <input
              type="number"
              step="1"
              value={deliveryFee}
              onChange={(e) => onDeliveryFeeChange(Number(e.target.value))}
              className="h-6 w-24 rounded border border-blue-500/30 bg-slate-800/80 px-2 text-right font-mono text-xs text-blue-300 outline-none focus:border-blue-500/60"
            />
          </div>

          {/* ── Divider ── */}
          <div className="h-px bg-slate-700/40" />

          {/* ── Grand Total: computed vs declared ── */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-200">Grand Total</span>
            <span className={`font-mono text-xs font-bold ${isBalanced ? 'text-emerald-300' : 'text-amber-300'}`}>
              {formatTHB(grandTotal)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Receipt says</span>
            <span className="font-mono text-xs text-slate-500">{formatTHB(declaredTotal)}</span>
          </div>

          {!isBalanced && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-amber-400/80">Difference</span>
              <span className="font-mono text-xs font-semibold text-amber-300">
                {formatTHB(Math.abs(grandTotal - declaredTotal))}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
