import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
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
import type { MappingMatch, BarcodeMatch } from '../../hooks/useSupplierMapping'
import { normalizeForMatch } from '../../hooks/useSupplierMapping'
import { CURRENCY_OPTIONS, PAYMENT_METHODS, formatTHB, formatTHBFull, parseWeight, formatNetWeight } from './helpers'
import { ReceiptImageViewer } from './ReceiptImageViewer'
// nomenclatureOptionText removed — not currently used
import { SearchableNomenclatureSelect } from './SearchableNomenclatureSelect'
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
  nomenclatureList: { id: string; name: string; product_code: string; category_id?: string | null }[]
  /** Product categories for category column display */
  productCategories?: { id: string; code: string; name: string; parent_id: string | null; level: number }[]
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
    purchaseUnit?: string
    conversionFactor?: number
    baseUnit?: string
  }) => Promise<void>
  /** Phase 6.3: Create new nomenclature item and return its ID */
  onCreateNomenclature?: (params: {
    name: string
    baseUnit: string
  }) => Promise<string>
  /** Phase 6.5: Lookup all mappings for a supplier → Map of MappingMatch */
  onLookupMappings?: (supplierId: string) => Promise<Map<string, MappingMatch>>
  /** Phase 6.6: Global barcode lookup against SKU table */
  onLookupBarcodes?: (barcodes: string[]) => Promise<Map<string, BarcodeMatch>>
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
/** Number input: no spinner arrows, proper text handling */
const numInputCls =
  'h-8 w-full rounded-lg border border-slate-700/60 bg-slate-800/80 px-2.5 text-xs text-slate-100 outline-none transition-all duration-200 focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 placeholder:text-slate-600 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
const selectCls =
  'h-8 w-full rounded-lg border border-slate-700/60 bg-slate-800/80 px-1.5 text-xs text-slate-100 outline-none transition-all duration-200 focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20'
const labelCls = 'mb-1.5 block text-[11px] font-medium tracking-wide text-slate-400/80 uppercase'

/** Handle numeric input: use text mode to prevent leading-zero bug.
 *  Returns string value for controlled input, with parseFloat for state update. */
function handleNumericChange(value: string): number {
  if (value === '' || value === '-') return 0
  const parsed = parseFloat(value)
  return isNaN(parsed) ? 0 : parsed
}

/** Normalize OCR package_weight to consistent metric format.
 *  "100กรัม" → "100 g", "1 กก." → "1 kg", "500 มล" → "500 ml", "5 ลิตร" → "5 L" */
function normalizeWeight(raw: string | undefined | null): string {
  if (!raw) return ''
  let s = raw.trim()
  // Thai → metric
  s = s.replace(/กิโลกรัม|กก\.?/g, 'kg')
  s = s.replace(/กรัม/g, 'g')
  s = s.replace(/มิลลิลิตร|มล\.?/g, 'ml')
  s = s.replace(/ลิตร/g, 'L')
  s = s.replace(/ชิ้น/g, 'pcs')
  s = s.replace(/ฟอง/g, 'pcs')
  s = s.replace(/ลูก/g, 'pcs')
  s = s.replace(/แพค|แพ็ค/g, 'pack')
  s = s.replace(/ถุง/g, 'bag')
  // CC → ml (Thai receipts often use CC for ml)
  s = s.replace(/\bCC\b/gi, 'ml')
  // Ensure space between number and unit: "100g" → "100 g"
  s = s.replace(/(\d)\s*(g|kg|ml|L|pcs|pack|bag)\b/gi, '$1 $2')
  // Capitalize L (liter), lowercase others
  s = s.replace(/\bl\b/g, 'L')
  return s
}

/* ────────────────────────── Component ────────────────────────── */

export function StagingArea({
  receipt,
  receiptUrls,
  imageUrls,
  nomenclatureList,
  productCategories = [],
  suppliersList,
  categories,
  subCategories,
  onApprove,
  onCancel,
  onSaveMapping,
  onCreateNomenclature,
  onLookupMappings,
  onLookupBarcodes,
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
  const isCOGSSupplier = supplierCat ? supplierCat >= 4000 && supplierCat < 5000 : false
  const [flowType, setFlowType] = useState<'OpEx' | 'CapEx' | 'COGS'>(() =>
    isCOGSSupplier ? 'COGS' : isCapExSupplier ? 'CapEx' : 'OpEx',
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
    () => receipt.food_items.map((f) => ({
      ...f,
      package_weight: normalizeWeight(f.package_weight),
    })),
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

  // Phase 6.6: Mapping status tracking (auto/manual/unmapped)
  const [mappingStatus, setMappingStatus] = useState<Map<number, 'auto' | 'manual' | 'unmapped'>>(new Map())

  // Verified checkbox per row (for physical reconciliation)
  const [verifiedFood, setVerifiedFood] = useState<Set<number>>(new Set())
  const [verifiedOpex, setVerifiedOpex] = useState<Set<number>>(new Set())
  const toggleVerifiedFood = (i: number) =>
    setVerifiedFood((prev) => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next })
  const toggleVerifiedOpex = (i: number) =>
    setVerifiedOpex((prev) => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next })

  // Category lookup: categoryId → { cat: L2 name, sub: L3 name }
  const categoryLookup = useMemo(() => {
    const map = new Map<string, { cat: string; sub: string }>()
    for (const cat of productCategories) {
      if (cat.level === 3) {
        const parent = cat.parent_id
          ? productCategories.find((c) => c.id === cat.parent_id)
          : null
        map.set(cat.id, { cat: parent?.name || '—', sub: cat.name })
      } else if (cat.level === 2) {
        map.set(cat.id, { cat: cat.name, sub: '—' })
      } else {
        map.set(cat.id, { cat: cat.name, sub: '' })
      }
    }
    return map
  }, [productCategories])

  // Load mapping data on mount (if supplier is resolved) + auto-map food items
  useEffect(() => {
    if (!onLookupMappings) return
    if (!supplierId) {
      // No supplier — only try global barcode lookup
      if (onLookupBarcodes) {
        const barcodes = foodItems
          .filter((f) => !f.nomenclature_id && f.supplier_sku)
          .map((f) => f.supplier_sku!)
        if (barcodes.length > 0) {
          onLookupBarcodes(barcodes).then((barcodeMap) => {
            if (barcodeMap.size === 0) return
            const newStatus = new Map(mappingStatus)
            setFoodItems((prev) =>
              prev.map((item, i) => {
                if (item.nomenclature_id || newStatus.get(i) === 'manual') return item
                if (item.supplier_sku) {
                  const bc = barcodeMap.get(item.supplier_sku)
                  if (bc) {
                    newStatus.set(i, 'auto')
                    return { ...item, nomenclature_id: bc.nomenclatureId, sku_id: bc.skuId, brand: bc.brandName || item.brand }
                  }
                }
                newStatus.set(i, 'unmapped')
                return item
              }),
            )
            setMappingStatus(newStatus)
          })
        }
      }
      return
    }

    onLookupMappings(supplierId).then(async (mappings) => {
      setUomMap(mappings)

      // Collect barcodes from items not matched by supplier_catalog
      const unmatchedBarcodes: string[] = []
      const preMatched = new Map<number, MappingMatch>()

      foodItems.forEach((item, i) => {
        if (item.nomenclature_id || mappingStatus.get(i) === 'manual') return
        // Try SKU match
        if (item.supplier_sku) {
          const skuMatch = mappings.get(`sku:${item.supplier_sku}`)
          if (skuMatch) { preMatched.set(i, skuMatch); return }
        }
        // Try name match (normalized)
        if (item.original_name) {
          const nameMatch = mappings.get(`name:${normalizeForMatch(item.original_name)}`)
          if (nameMatch) { preMatched.set(i, nameMatch); return }
        }
        // Collect barcode for fallback
        if (item.supplier_sku) unmatchedBarcodes.push(item.supplier_sku)
      })

      // Global barcode lookup (fallback)
      let barcodeMap = new Map<string, BarcodeMatch>()
      if (unmatchedBarcodes.length > 0 && onLookupBarcodes) {
        barcodeMap = await onLookupBarcodes(unmatchedBarcodes)
      }

      // Apply auto-mappings
      const newStatus = new Map(mappingStatus)
      setFoodItems((prev) =>
        prev.map((item, i) => {
          if (item.nomenclature_id || newStatus.get(i) === 'manual') {
            if (!newStatus.has(i)) newStatus.set(i, item.nomenclature_id ? 'auto' : 'unmapped')
            return item
          }
          // Priority 1: supplier_catalog match
          const match = preMatched.get(i)
          if (match) {
            newStatus.set(i, 'auto')
            return {
              ...item,
              nomenclature_id: match.nomenclatureId,
              sku_id: match.skuId,
              brand: match.brandName || item.brand,
            }
          }
          // Priority 2: global barcode
          if (item.supplier_sku) {
            const bc = barcodeMap.get(item.supplier_sku)
            if (bc) {
              newStatus.set(i, 'auto')
              return {
                ...item,
                nomenclature_id: bc.nomenclatureId,
                sku_id: bc.skuId,
                brand: bc.brandName || item.brand,
              }
            }
          }
          newStatus.set(i, 'unmapped')
          return item
        }),
      )
      setMappingStatus(newStatus)
    })
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
        const nameMatch = uomMap.get(`name:${normalizeForMatch(item.original_name)}`)
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

    // Track manual mapping status when user changes nomenclature_id
    if (patch.nomenclature_id !== undefined) {
      setMappingStatus((prev) => {
        const next = new Map(prev)
        if (patch.nomenclature_id && patch.nomenclature_id !== '' && patch.nomenclature_id !== '__NEW__') {
          next.set(i, 'manual')
        } else {
          next.set(i, 'unmapped')
        }
        return next
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
      // Phase 6.6: Save manual mappings to supplier_catalog (self-learning)
      if (supplierId && onSaveMapping) {
        const manualItems = foodItems.filter((item, i) =>
          mappingStatus.get(i) === 'manual' &&
          item.nomenclature_id &&
          item.nomenclature_id !== '' &&
          item.nomenclature_id !== '__NEW__',
        )
        if (manualItems.length > 0) {
          try {
            await Promise.all(
              manualItems.map((item) => {
                const uom = getUomForItem(item)
                return onSaveMapping({
                  supplierId,
                  supplierSku: item.supplier_sku ?? null,
                  originalName: item.original_name ?? item.name,
                  nomenclatureId: item.nomenclature_id!,
                  purchaseUnit: uom?.purchaseUnit || item.unit || undefined,
                  conversionFactor: uom?.conversionFactor ?? undefined,
                  baseUnit: uom?.baseUnit || undefined,
                })
              }),
            )
          } catch (e) {
            console.warn('[StagingArea] Failed to save manual mappings (non-blocking):', e)
          }
        }
      }

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
        // Propagate barcode: Gemini puts it in supplier_sku, RPC reads from barcode field
        food_items: foodItems.map((f) => ({
          ...f,
          nomenclature_id: f.nomenclature_id === '__NEW__' ? null : f.nomenclature_id,
          barcode: f.barcode || f.supplier_sku || null,
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
    <section className="animate-fade-in-up rounded-2xl border border-indigo-500/30 bg-gradient-to-b from-slate-900/90 to-slate-950/90 shadow-xl shadow-indigo-500/[0.04]">
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

      {/* ═══ Top: Image + Reconciliation + Form side-by-side ═══ */}
      <div className="px-5 py-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.35fr)_minmax(0,0.65fr)]">
          {/* Left column: Image viewer */}
          <div className="space-y-4">
            {imageUrls.length > 0 && (
              <ReceiptImageViewer imageUrls={imageUrls} />
            )}
          </div>

          {/* Right column: Reconciliation + Form fields */}
          <div className="space-y-4">
        {/* Phase 6.6c: Reconciliation Panel */}
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
                {(['OpEx', 'CapEx', 'COGS'] as const).map((ft) => (
                  <button
                    key={ft}
                    type="button"
                    onClick={() => setFlowType(ft)}
                    className={`h-8 flex-1 rounded-lg border text-xs font-medium tracking-wide transition-all duration-200 ${
                      flowType === ft
                        ? ft === 'OpEx'
                          ? 'border-emerald-500/50 bg-emerald-500/[0.12] text-emerald-300 shadow-sm shadow-emerald-500/10'
                          : ft === 'CapEx'
                            ? 'border-amber-500/50 bg-amber-500/[0.12] text-amber-300 shadow-sm shadow-amber-500/10'
                            : 'border-blue-500/50 bg-blue-500/[0.12] text-blue-300 shadow-sm shadow-blue-500/10'
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

        </div>{/* end stagger-children inside right column */}
          </div>{/* end right column */}
        </div>{/* end 2-col grid */}

        <div className="space-y-5 mt-5">
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

          {/* ═══ Food Items (Spoke 1) — Redesigned Table ═══ */}
          <ItemSection
            title="Food Items"
            icon={<ShoppingCart className="h-3.5 w-3.5" />}
            count={foodItems.length}
            total={foodTotal}
            open={foodOpen}
            onToggle={() => setFoodOpen(!foodOpen)}
            color="emerald"
            badge={(() => {
              const autoCount = Array.from(mappingStatus.values()).filter((v) => v === 'auto').length
              const manualCount = Array.from(mappingStatus.values()).filter((v) => v === 'manual').length
              const unmappedCount = foodItems.length - autoCount - manualCount
              if (foodItems.length === 0) return undefined
              return `${autoCount} auto · ${manualCount} manual · ${unmappedCount} unmapped`
            })()}
            headers={['', '#', 'SKU', 'Item', 'Mapping', 'Cat', 'Sub', 'Pkg', 'Qty', 'Unit', 'Price', 'Total', '']}
            colWidths={['w-8', 'w-9', 'w-32', 'min-w-[140px]', 'min-w-[170px]', 'w-28', 'w-28', 'w-32', 'w-16', 'w-14', 'w-20', 'w-20', 'w-9']}
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
              // Math validation — qty × unit_price ≈ total_price
              const expectedTotal = Math.round(item.quantity * item.unit_price * 100) / 100
              const hasMathError = item.quantity > 0 && item.unit_price > 0 && item.total_price > 0
                && Math.abs(expectedTotal - item.total_price) > 2
              // Mapping status
              const isMapped = !!item.nomenclature_id && item.nomenclature_id !== '' && item.nomenclature_id !== '__NEW__'
              const mappedNom = isMapped ? nomenclatureList.find(n => n.id === item.nomenclature_id) : null

              return (
              <tr
                key={i}
                className={`group/row border-b border-slate-800/30 transition-colors duration-150 hover:bg-slate-800/20 ${confidenceBorder} ${isUnreadable ? 'bg-slate-800/40' : ''}`}
                title={warning || undefined}
              >
                {/* ── Verified checkbox ── */}
                <td className="w-8 px-1 py-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => toggleVerifiedFood(i)}
                    className={`inline-flex h-5 w-5 items-center justify-center rounded border transition-all duration-150 ${
                      verifiedFood.has(i)
                        ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-400'
                        : 'border-slate-700/60 bg-slate-800/40 text-transparent hover:border-slate-600 hover:text-slate-700'
                    }`}
                  >
                    <Check className="h-3 w-3" />
                  </button>
                </td>

                {/* ── # (line number) ── */}
                <td className="w-9 px-2 py-1.5 text-center">
                  <span className="font-mono text-[10px] text-slate-600">
                    {lineNumber || i + 1}
                  </span>
                </td>

                {/* ── SKU (editable) ── */}
                <td className="w-32 px-2 py-1.5">
                  <input
                    type="text"
                    value={item.supplier_sku || ''}
                    onChange={(e) => updateFood(i, { supplier_sku: e.target.value || null })}
                    placeholder="—"
                    className={`${inputCls} font-mono text-[11px]`}
                    title="Supplier SKU / barcode"
                  />
                </td>

                {/* ── Item name + original Thai ── */}
                <td className="min-w-[140px] px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateFood(i, { name: e.target.value })}
                      className={`${inputCls} flex-1 ${isUnreadable ? 'italic text-slate-500' : ''}`}
                      title={item.full_title || ''}
                    />
                    {item.makro_name && (
                      <span className="shrink-0 text-[9px] text-emerald-400" title={item.full_title ? `Makro: ${item.full_title}` : `Verified: ${item.makro_name}`}>
                        ✓
                      </span>
                    )}
                  </div>
                  {item.original_name && (
                    <p className="mt-0.5 truncate text-[9px] text-slate-500" title={item.original_name}>
                      {item.original_name}
                    </p>
                  )}
                  {warning && (
                    <p className="mt-0.5 text-[9px] text-rose-400/70">{warning}</p>
                  )}
                </td>

                {/* ── Mapping (nomenclature + status indicator) ── */}
                <td className="min-w-[170px] px-2 py-1.5">
                  {/* Status indicator dot + label */}
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const status = mappingStatus.get(i)
                      if (status === 'auto') return (
                        <span className="flex items-center gap-1" title="Auto-mapped from supplier catalog">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                          <span className="text-[8px] font-medium tracking-wide text-emerald-400/70 uppercase">Auto</span>
                        </span>
                      )
                      if (status === 'manual' && isMapped) return (
                        <span className="flex items-center gap-1" title="Manually mapped by user">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-blue-400 shadow-sm shadow-blue-400/50" />
                        </span>
                      )
                      if (isMapped) return (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" title={`Mapped: ${mappedNom?.name || 'linked'}`} />
                      )
                      return (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 animate-pulse shadow-sm shadow-amber-400/50" title="Not mapped — select from DB" />
                      )
                    })()}
                    <SearchableNomenclatureSelect
                      value={item.nomenclature_id}
                      options={nomenclatureList}
                      itemName={item.name}
                      isMapped={isMapped}
                      onChange={(val) => {
                        if (val === '__CREATE__') {
                          setCreateModalIndex(i)
                          setCreateName(item.name || '')
                          setCreateUnit('kg')
                        } else {
                          updateFood(i, { nomenclature_id: val })
                        }
                      }}
                    />
                    {/* Unlink button — clear erroneous mapping */}
                    {isMapped && (
                      <button
                        type="button"
                        title="Clear mapping"
                        onClick={() => updateFood(i, { nomenclature_id: null, sku_id: null })}
                        className="shrink-0 rounded p-0.5 text-slate-600 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {/* If unmapped — show AI translation as hint */}
                  {!isMapped && item.name && item.original_name && item.name !== item.original_name && (
                    <p className="mt-0.5 ml-3.5 text-[9px] text-indigo-400/70" title="AI translation">
                      AI: {item.name}
                    </p>
                  )}
                  {/* UoM Badge + Inline Editor */}
                  {isMapped && (() => {
                    const uom = getUomForItem(item)
                    const hasUom = uom?.conversionFactor != null && uom.conversionFactor > 0

                    if (uomEditIdx === i) {
                      return (
                        <div className="mt-1 ml-3.5 flex items-center gap-1 rounded-md border border-indigo-500/30 bg-slate-800/60 px-1.5 py-1">
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

                    return (
                      <button
                        type="button"
                        onClick={() => {
                          setUomEditIdx(i)
                          setUomPurchaseUnit(uom?.purchaseUnit || item.unit || '')
                          setUomFactor(uom?.conversionFactor?.toString() || '1')
                          setUomBaseUnit((uom?.baseUnit as 'kg' | 'L' | 'pcs') || 'kg')
                        }}
                        className={`mt-1 ml-3.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] transition-colors ${
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

                {/* ── Cat (L2 — derived from nomenclature mapping) ── */}
                <td className="w-28 px-1.5 py-1.5">
                  {(() => {
                    const nomEntry = isMapped ? nomenclatureList.find((n) => n.id === item.nomenclature_id) : null
                    const catInfo = nomEntry?.category_id ? categoryLookup.get(nomEntry.category_id) : null
                    return catInfo ? (
                      <span className="inline-block max-w-full truncate rounded-md bg-teal-500/10 px-1.5 py-0.5 text-[9px] text-teal-400/80 ring-1 ring-teal-500/20" title={catInfo.cat}>
                        {catInfo.cat}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-700">—</span>
                    )
                  })()}
                </td>

                {/* ── Sub (L3 — derived from nomenclature mapping) ── */}
                <td className="w-28 px-1.5 py-1.5">
                  {(() => {
                    const nomEntry = isMapped ? nomenclatureList.find((n) => n.id === item.nomenclature_id) : null
                    const catInfo = nomEntry?.category_id ? categoryLookup.get(nomEntry.category_id) : null
                    return catInfo && catInfo.sub !== '—' ? (
                      <span className="inline-block max-w-full truncate rounded-md bg-slate-800/60 px-1.5 py-0.5 text-[9px] text-teal-300/60 ring-1 ring-slate-700/30" title={catInfo.sub}>
                        {catInfo.sub}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-700">—</span>
                    )
                  })()}
                </td>

                {/* ── Packaging (brand + weight — inline) ── */}
                <td className="w-32 px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={item.brand || ''}
                      onChange={(e) => updateFood(i, { brand: e.target.value || undefined })}
                      placeholder="brand"
                      className={`${inputCls} h-6 w-16 text-[10px] !px-1.5 text-purple-400 placeholder:text-slate-700`}
                    />
                    <input
                      type="text"
                      value={item.package_weight || ''}
                      onChange={(e) => updateFood(i, { package_weight: e.target.value || undefined })}
                      placeholder="wt"
                      className={`${inputCls} h-6 w-14 text-[10px] !px-1.5 text-orange-400/90 placeholder:text-slate-700`}
                    />
                  </div>
                  {/* Net weight: qty × package_weight */}
                  {(() => {
                    const pw = parseWeight(item.package_weight)
                    if (!pw || !item.quantity || item.quantity <= 0) return null
                    const total = item.quantity * pw.value
                    return (
                      <span className="mt-0.5 block text-[9px] tabular-nums text-orange-400/50">
                        Σ {formatNetWeight(total, pw.unit)}
                      </span>
                    )
                  })()}
                </td>

                {/* ── Qty ── */}
                <td className="w-16 px-2 py-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.quantity || ''}
                    onChange={(e) => updateFood(i, { quantity: handleNumericChange(e.target.value) })}
                    onFocus={(e) => e.target.select()}
                    className={`${numInputCls} font-mono text-right tabular-nums`}
                    placeholder="0"
                  />
                </td>

                {/* ── Unit ── */}
                <td className="w-14 px-2 py-1.5">
                  <input
                    type="text"
                    value={item.unit}
                    onChange={(e) => updateFood(i, { unit: e.target.value })}
                    className={`${inputCls} text-center text-[11px]`}
                  />
                </td>

                {/* ── Unit Price ── */}
                <td className="w-20 px-2 py-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.unit_price || ''}
                    onChange={(e) => updateFood(i, { unit_price: handleNumericChange(e.target.value) })}
                    onFocus={(e) => e.target.select()}
                    className={`${numInputCls} font-mono text-right tabular-nums ${hasMathError ? '!text-rose-400 !border-rose-500/50' : ''}`}
                    placeholder="0"
                  />
                </td>

                {/* ── Total ── */}
                <td className="w-20 px-2 py-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.total_price || ''}
                    onChange={(e) => updateFood(i, { total_price: handleNumericChange(e.target.value) })}
                    onFocus={(e) => e.target.select()}
                    className={`${numInputCls} font-mono text-right tabular-nums ${hasMathError ? '!text-rose-400 !border-rose-500/50' : ''}`}
                    placeholder="0"
                  />
                  {hasMathError && (
                    <p className="mt-0.5 flex items-center justify-end gap-0.5 text-[8px] text-rose-400/80">
                      <AlertTriangle className="h-2 w-2" />
                      {item.quantity}&times;{item.unit_price}={expectedTotal}
                    </p>
                  )}
                </td>

                {/* ── Actions ── */}
                <td className="w-9 px-2 py-1.5">
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
              <td colSpan={13} className="px-1.5 py-2">
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

          {/* ═══ OpEx Items (Spoke 3) — mirrors Food Items layout ═══ */}
          <ItemSection
            title="OpEx Items"
            icon={<Package className="h-3.5 w-3.5" />}
            count={opexItems.length}
            total={opexTotal}
            open={opexOpen}
            onToggle={() => setOpexOpen(!opexOpen)}
            color="cyan"
            headers={['', '#', 'SKU', 'Description', '', 'Cat', 'Sub', '', 'Qty', 'Unit', 'Price', 'Total', '', '']}
            colWidths={['w-8', 'w-9', 'w-32', 'min-w-[140px]', 'min-w-[170px]', 'w-28', 'w-28', 'w-32', 'w-16', 'w-14', 'w-20', 'w-20', 'w-9', 'w-9']}
          >
            {opexItems.map((item, i) => (
              <tr
                key={i}
                className="group/row border-b border-slate-800/30 transition-colors duration-150 hover:bg-slate-800/20"
              >
                {/* ── Verified checkbox ── */}
                <td className="w-8 px-1 py-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => toggleVerifiedOpex(i)}
                    className={`inline-flex h-5 w-5 items-center justify-center rounded border transition-all duration-150 ${
                      verifiedOpex.has(i)
                        ? 'border-cyan-500/60 bg-cyan-500/20 text-cyan-400'
                        : 'border-slate-700/60 bg-slate-800/40 text-transparent hover:border-slate-600 hover:text-slate-700'
                    }`}
                  >
                    <Check className="h-3 w-3" />
                  </button>
                </td>
                {/* ── # ── */}
                <td className="w-9 px-2 py-1.5 text-center">
                  <span className="font-mono text-[10px] text-slate-600">{i + 1}</span>
                </td>
                {/* ── SKU ── */}
                <td className="w-32 px-2 py-1.5">
                  <input
                    type="text"
                    value={item.supplier_sku || ''}
                    onChange={(e) => updateOpex(i, { supplier_sku: e.target.value || null })}
                    placeholder="—"
                    className={`${inputCls} font-mono text-[11px]`}
                    title="Supplier SKU / barcode"
                  />
                </td>
                {/* ── Description ── */}
                <td className="min-w-[140px] px-2 py-1.5">
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateOpex(i, { description: e.target.value })}
                    className={inputCls}
                  />
                </td>
                {/* ── Spacer (aligned with Mapping) ── */}
                <td className="min-w-[170px]" />
                {/* ── Cat (L2 product_category — manual dropdown) ── */}
                <td className="w-28 px-1.5 py-1.5">
                  <select
                    value={item.category_id ?? ''}
                    onChange={(e) => {
                      updateOpex(i, { category_id: e.target.value || null, sub_category_id: null })
                    }}
                    className={`${selectCls} !h-7 !text-[9px]`}
                  >
                    <option value="">—</option>
                    {productCategories
                      .filter((c) => c.level === 2)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </select>
                </td>
                {/* ── Sub (L3 product_category — filtered by L2 parent) ── */}
                <td className="w-28 px-1.5 py-1.5">
                  <select
                    value={item.sub_category_id ?? ''}
                    onChange={(e) => updateOpex(i, { sub_category_id: e.target.value || null })}
                    disabled={!item.category_id}
                    className={`${selectCls} !h-7 !text-[9px] disabled:opacity-30`}
                  >
                    <option value="">—</option>
                    {productCategories
                      .filter((c) => c.level === 3 && c.parent_id === item.category_id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </select>
                </td>
                {/* ── Spacer (aligned with Pkg) ── */}
                <td className="w-32" />
                {/* ── Qty ── */}
                <td className="w-16 px-2 py-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.quantity || ''}
                    onChange={(e) => updateOpex(i, { quantity: handleNumericChange(e.target.value) })}
                    onFocus={(e) => e.target.select()}
                    className={`${numInputCls} font-mono text-right tabular-nums`}
                    placeholder="0"
                  />
                </td>
                {/* ── Unit ── */}
                <td className="w-14 px-2 py-1.5">
                  <input
                    type="text"
                    value={item.unit}
                    onChange={(e) => updateOpex(i, { unit: e.target.value })}
                    className={`${inputCls} text-center text-[11px]`}
                  />
                </td>
                {/* ── Price ── */}
                <td className="w-20 px-2 py-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.unit_price || ''}
                    onChange={(e) => updateOpex(i, { unit_price: handleNumericChange(e.target.value) })}
                    onFocus={(e) => e.target.select()}
                    className={`${numInputCls} font-mono text-right tabular-nums`}
                    placeholder="0"
                  />
                </td>
                {/* ── Total ── */}
                <td className="w-20 px-2 py-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.total_price || ''}
                    onChange={(e) => updateOpex(i, { total_price: handleNumericChange(e.target.value) })}
                    onFocus={(e) => e.target.select()}
                    className={`${numInputCls} font-mono text-right tabular-nums`}
                    placeholder="0"
                  />
                </td>
                {/* ── Move to Food ── */}
                <td className="w-9 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => moveOpexToFood(i)}
                    title="Move to Food items"
                    className="rounded-lg p-1 text-slate-600 opacity-0 transition-all duration-150 hover:bg-emerald-500/10 hover:text-emerald-400 group-hover/row:opacity-100"
                  >
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                </td>
                {/* ── Delete ── */}
                <td className="w-9 px-2 py-1.5">
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
              <td colSpan={14} className="px-1.5 py-2">
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
                    type="text"
                    inputMode="numeric"
                    value={item.quantity || ''}
                    onChange={(e) => updateCapex(i, { quantity: handleNumericChange(e.target.value) })}
                    onFocus={(e) => e.target.select()}
                    className={`${numInputCls} font-mono`}
                  />
                </td>
                <td className="w-20 px-1.5 py-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.unit_price || ''}
                    onChange={(e) => updateCapex(i, { unit_price: handleNumericChange(e.target.value) })}
                    onFocus={(e) => e.target.select()}
                    className={`${numInputCls} font-mono`}
                  />
                </td>
                <td className="w-20 px-1.5 py-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.total_price || ''}
                    onChange={(e) => updateCapex(i, { total_price: handleNumericChange(e.target.value) })}
                    onFocus={(e) => e.target.select()}
                    className={`${numInputCls} font-mono`}
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

          {/* ═══ Sticky Totals Bar ═══ */}
          <div className="sticky bottom-0 z-20 rounded-xl border border-slate-700/40 bg-slate-900/95 shadow-lg shadow-black/30 backdrop-blur-sm">
            <div className="flex items-center divide-x divide-slate-700/30">
              {[
                { label: 'Food', value: foodTotal, color: 'text-emerald-400' },
                { label: 'OpEx', value: opexTotal, color: 'text-cyan-400' },
                { label: 'CapEx', value: capexTotal, color: 'text-amber-400' },
              ].map((item) => (
                <div key={item.label} className="flex-1 px-3 py-2 text-center">
                  <p className="text-[10px] tracking-wider text-slate-500 uppercase">
                    {item.label}
                  </p>
                  <p className={`font-mono text-xs tabular-nums font-medium ${item.color}`}>
                    {formatTHBFull(item.value)}
                  </p>
                </div>
              ))}
              <div className="flex-1 px-4 py-2 text-center">
                <p className="text-[10px] tracking-wider text-slate-400 uppercase font-semibold">
                  Items Total
                </p>
                <p className="font-mono text-sm tabular-nums font-bold text-slate-100">
                  {formatTHBFull(computedTotal)}
                </p>
              </div>
            </div>

            {!allFoodMapped && foodItems.length > 0 && (
              <div className="border-t border-slate-700/30 px-4 py-2">
                <div className="flex items-center gap-2 text-[11px] text-amber-300/80">
                  <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400/80" />
                  All food items must be mapped before approval
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
  badge,
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
  /** Optional mapping stats badge, e.g., "18 auto · 3 manual · 4 unmapped" */
  badge?: string
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
    <div className={`rounded-xl border border-slate-800/60 bg-slate-900/40 ${open ? c.border : ''}`}>
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
        {badge && (
          <span className="rounded-md bg-slate-800/60 px-2 py-0.5 text-[9px] text-slate-400/80 ring-1 ring-slate-700/40">
            {badge}
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] tabular-nums text-slate-500">
          {formatTHB(total)}
        </span>
      </button>

      {open && (
        <div className="max-h-[60vh] overflow-auto border-t border-slate-800/40">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm">
              <tr className="border-b border-slate-800/30">
                {headers.map((h, i) => (
                  <th
                    key={i}
                    className={`px-2 py-2 text-left text-[10px] font-medium tracking-wider text-slate-500/70 uppercase ${colWidths[i] || ''}`}
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
  onVatChange: _onVatChange,
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
  // Thai receipts: VAT-inclusive pricing. VAT is already included in item prices/subtotal.
  // Formula: subtotal + discount + delivery = grand_total (VAT is informational only)
  const grandTotal = itemsSum + discountTotal + deliveryFee
  const declaredTotal = footer.grand_total
  // OCR tolerance: per-item discounts (DISC column on Makro) and rounding
  // can cause diffs between computed and declared totals
  const isBalanced = Math.abs(grandTotal - declaredTotal) <= 100

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

          {/* ── VAT row (informational — already included in prices) ── */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500">VAT <span className="text-[9px] text-slate-600">(included)</span></span>
            <span className="font-mono text-xs text-slate-500">{formatTHB(vatAmount)}</span>
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
