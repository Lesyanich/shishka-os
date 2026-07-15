import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, X, Loader2, FolderOpen, Pencil, Plus, Trash2, AlertTriangle, ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import type { InboxRow } from '../../hooks/useReceiptInbox'
import { supabase } from '../../lib/supabase'
import { isPdfReceipt, useSignedReceiptUrls } from '../../lib/receiptUrls'

/* ────────────────────────── Types ────────────────────────── */

type FlowType = 'COGS' | 'OpEx' | 'CapEx'

/** Minimal duplicate-match row returned by the fn_check_expense_duplicate RPC. */
type LedgerDupe = {
  id: string
  transaction_date: string
  amount_original: number | null
  details: string | null
  invoice_number: string | null
}

interface UnifiedItem {
  name: string
  original_name?: string
  quantity: number
  unit: string
  unit_price: number
  total_price: number
  flow_type: FlowType
  nomenclature_id?: string | null
  barcode?: string | null
  supplier_sku?: string | null
  brand?: string | null
  package_weight?: string | null
  confidence?: 'high' | 'medium' | 'low'
}

/* ────────────────────────── Props ────────────────────────── */

interface Props {
  row: InboxRow
  onApprove: (inboxId: string, payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; expense_id?: string }>
  onSkip: (inboxId: string) => Promise<string | null>
  onReopen: (inboxId: string) => Promise<string | null>
  /** Collapse the panel — used on mobile where the panel renders as a full-screen sheet. */
  onClose?: () => void
}

/* ────────────────────────── Helpers ────────────────────────── */

function fmt(n: number | undefined | null): string {
  if (n == null) return '\u2014'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const FLOW_STYLES: Record<FlowType, string> = {
  COGS: 'bg-emerald-500/15 text-emerald-400',
  OpEx: 'bg-amber-500/15 text-amber-400',
  CapEx: 'bg-sky-500/15 text-sky-400',
}

function flowBadge(ft: string) {
  return FLOW_STYLES[ft as FlowType] || 'bg-slate-500/15 text-slate-400'
}

function confidenceBadge(level?: 'high' | 'medium' | 'low') {
  switch (level) {
    case 'high':
      return <span className="inline-block rounded px-1 py-0.5 text-[9px] font-medium bg-emerald-500/20 text-emerald-400">exact</span>
    case 'medium':
      return <span className="inline-block rounded px-1 py-0.5 text-[9px] font-medium bg-amber-500/20 text-amber-400">fuzzy</span>
    case 'low':
      return <span className="inline-block rounded px-1 py-0.5 text-[9px] font-medium bg-rose-500/20 text-rose-400">new</span>
    default:
      return null
  }
}

const inputCls = 'w-full rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200 outline-none focus:border-indigo-500'
// Hide the native up/down spin buttons — in narrow numeric columns they cover the value.
const numInputCls = `${inputCls} text-right [appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`

function emptyItem(flowType: FlowType = 'COGS'): UnifiedItem {
  return { name: '', quantity: 1, unit: 'pcs', unit_price: 0, total_price: 0, flow_type: flowType }
}

/* ── Payload conversion helpers ── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadItemsFromPayload(p: Record<string, any>): UnifiedItem[] {
  const items: UnifiedItem[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const f of (p.food_items ?? []) as any[]) {
    items.push({
      name: f.name || '', original_name: f.original_name, quantity: f.quantity ?? 1,
      unit: f.unit || 'pcs', unit_price: f.unit_price ?? 0, total_price: f.total_price ?? 0,
      flow_type: 'COGS', nomenclature_id: f.nomenclature_id, barcode: f.barcode,
      supplier_sku: f.supplier_sku, brand: f.brand, package_weight: f.package_weight,
      confidence: f.confidence,
    })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (p.capex_items ?? []) as any[]) {
    items.push({
      name: c.name || '', original_name: c.original_name, quantity: c.quantity ?? 1,
      unit: c.unit || 'pcs', unit_price: c.unit_price ?? 0, total_price: c.total_price ?? 0,
      flow_type: 'CapEx', nomenclature_id: c.nomenclature_id, barcode: c.barcode,
      supplier_sku: c.supplier_sku, brand: c.brand, package_weight: c.package_weight,
      confidence: c.confidence,
    })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (p.opex_items ?? []) as any[]) {
    items.push({
      name: o.description || o.name || '', original_name: o.original_name, quantity: o.quantity ?? 1,
      unit: o.unit || 'pcs', unit_price: o.unit_price ?? 0, total_price: o.total_price ?? 0,
      flow_type: 'OpEx', nomenclature_id: o.nomenclature_id, barcode: o.barcode,
      supplier_sku: o.supplier_sku, brand: o.brand, package_weight: o.package_weight,
      confidence: o.confidence,
    })
  }
  return items
}

function splitItemsToPayload(items: UnifiedItem[]) {
  const food_items = items.filter(i => i.flow_type === 'COGS').map(i => ({
    name: i.name, original_name: i.original_name, quantity: i.quantity, unit: i.unit,
    unit_price: i.unit_price, total_price: i.total_price, nomenclature_id: i.nomenclature_id,
    barcode: i.barcode, supplier_sku: i.supplier_sku, brand: i.brand,
    package_weight: i.package_weight, confidence: i.confidence,
  }))
  const capex_items = items.filter(i => i.flow_type === 'CapEx').map(i => ({
    name: i.name, quantity: i.quantity, unit_price: i.unit_price, total_price: i.total_price,
    barcode: i.barcode,
  }))
  const opex_items = items.filter(i => i.flow_type === 'OpEx').map(i => ({
    description: i.name, quantity: i.quantity, unit: i.unit, unit_price: i.unit_price,
    total_price: i.total_price, barcode: i.barcode,
  }))
  return { food_items, capex_items, opex_items }
}

/* ────────────────────────── Component ────────────────────────── */

export function InboxReviewPanel({ row, onApprove, onSkip, onReopen, onClose }: Props) {
  // Stored values stay the identity (and drive PDF detection); only what lands
  // in src/href is swapped for a short-lived signed URL.
  const { resolve: resolvePhoto } = useSignedReceiptUrls(row.photo_urls)
  const [isApproving, setIsApproving] = useState(false)
  const [isSkipping, setIsSkipping] = useState(false)
  const [isReopening, setIsReopening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [nomMap, setNomMap] = useState<Record<string, { code: string; name: string; category?: string }>>({})
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = row.parsed_payload as Record<string, any> | null
  // Mobile-only: collapse the receipt image to a thin peek strip so the reviewer
  // can push it out of the way and work on the parsed data (desktop always shows it).
  const [imgCollapsed, setImgCollapsed] = useState(false)

  // ── Editable header state ──
  const [supplierName, setSupplierName] = useState<string>(p?.supplier_name || '')
  const [transactionDate, setTransactionDate] = useState<string>(p?.transaction_date || '')
  const [receiptTotal, setReceiptTotal] = useState<number>(p?.amount_original ?? 0)
  const [invoiceNumber, setInvoiceNumber] = useState<string>(p?.invoice_number || '')
  const [hasTaxInvoice, setHasTaxInvoice] = useState<boolean>(p?.has_tax_invoice ?? false)
  const [editingHeader, setEditingHeader] = useState(false)

  // ── Unified items state ──
  const [items, setItems] = useState<UnifiedItem[]>(() => p ? loadItemsFromPayload(p) : [])

  // ── Checkboxes ──
  const [checkedItems, setCheckedItems] = useState<Set<number>>(() => new Set())

  // ── Duplicate detection ──
  const [dupeWarnings, setDupeWarnings] = useState<string[]>([])

  useEffect(() => {
    if (!p) return
    const inv = p.invoice_number as string | null
    const date = p.transaction_date as string | null
    const amount = p.amount_original as number | null

    async function checkDuplicates() {
      const warnings: string[] = []
      try {
        if (inv) {
          const { data: inboxDupes } = await supabase
            .from('receipt_inbox')
            .select('id, created_at, status')
            .neq('id', row.id)
            .not('status', 'in', '("skipped","processing","error")')
            .filter('parsed_payload->>invoice_number', 'eq', inv)
            .limit(5)
          if (inboxDupes?.length) {
            for (const d of inboxDupes) {
              warnings.push(`Inbox duplicate: receipt ${inv} also in row ${d.id.slice(0, 8)}… (${d.status}, ${new Date(d.created_at).toLocaleDateString()})`)
            }
          }
        }
        // Ledger duplicate check via SECURITY DEFINER RPC — reviewers verify
        // duplicates without read access to the owner-only expense_ledger.
        if (inv || (date && amount && amount > 0)) {
          const { data: ledgerDupes } = await supabase.rpc('fn_check_expense_duplicate', {
            p_invoice_number: inv || null,
            p_transaction_date: date || null,
            p_amount: amount ?? null,
            p_supplier: null,
          })
          if (Array.isArray(ledgerDupes) && ledgerDupes.length) {
            for (const d of ledgerDupes as LedgerDupe[]) {
              warnings.push(
                inv
                  ? `Already approved: ${inv} on ${d.transaction_date} — ฿${d.amount_original?.toLocaleString()} (${d.details})`
                  : `Possible duplicate: ${d.transaction_date} — ฿${d.amount_original?.toLocaleString()} (${d.details})`,
              )
            }
          }
        }
      } catch (err) {
        console.warn('[InboxReviewPanel] Duplicate check failed:', err)
      }
      setDupeWarnings(warnings)
    }

    checkDuplicates()
  }, [row.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save edits on unmount ──
  const isDirty = useRef(false)
  const isInitialRender = useRef(true)
  const latestPayload = useRef(p)

  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false
      return
    }
    if (!p) return
    const { food_items, capex_items, opex_items } = splitItemsToPayload(items)
    latestPayload.current = {
      ...p,
      supplier_name: supplierName,
      transaction_date: transactionDate,
      amount_original: receiptTotal,
      invoice_number: invoiceNumber || null,
      has_tax_invoice: hasTaxInvoice,
      food_items,
      capex_items,
      opex_items,
    }
    isDirty.current = true
  }, [supplierName, transactionDate, receiptTotal, invoiceNumber, hasTaxInvoice, items]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const rowId = row.id
    return () => {
      if (isDirty.current && latestPayload.current) {
        supabase
          .from('receipt_inbox')
          .update({ parsed_payload: latestPayload.current })
          .eq('id', rowId)
          .then(({ error: err }) => {
            if (err) console.error('[InboxReviewPanel] Auto-save failed:', err.message)
            else console.log('[InboxReviewPanel] Auto-saved edits for', rowId)
          })
      }
    }
  }, [row.id])

  // ── Image viewer with zoom/pan ──
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const imgContainerRef = useRef<HTMLDivElement>(null)

  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom((prev) => Math.min(5, Math.max(1, prev + (e.deltaY < 0 ? 0.3 : -0.3))))
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return
    e.preventDefault()
    setIsDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
  }, [zoom, pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    setPan({
      x: dragStart.current.panX + (e.clientX - dragStart.current.x),
      y: dragStart.current.panY + (e.clientY - dragStart.current.y),
    })
  }, [isDragging])

  const handleMouseUp = useCallback(() => { setIsDragging(false) }, [])

  useEffect(() => { resetView() }, [selectedPhotoIdx, resetView])

  // ── Edit mode per row ──
  const [editingRows, setEditingRows] = useState<Set<number>>(() => new Set())

  const toggleEdit = (idx: number) => {
    setEditingRows((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  // ── Computed totals ──
  const calculatedTotal = items.reduce((s, it) => s + (it.total_price || 0), 0)
  const discountAmount = Math.abs(p?.discount_total || 0)
  const vatAmount = p?.vat_amount || 0
  const deliveryFee = p?.delivery_fee || 0
  // Try all 4 possible formulas and pick the one that matches the receipt total best.
  // Covers: VAT included/excluded × discount embedded/separate × delivery fee.
  const formulas = [
    { expected: calculatedTotal - discountAmount + deliveryFee,              vatIncl: true,  discEmbed: false, label: 'items − discount + delivery' },
    { expected: calculatedTotal + deliveryFee,                               vatIncl: true,  discEmbed: true,  label: 'items + delivery (discount in prices)' },
    { expected: calculatedTotal - discountAmount + vatAmount + deliveryFee,  vatIncl: false, discEmbed: false, label: 'items − discount + VAT + delivery' },
    { expected: calculatedTotal + vatAmount + deliveryFee,                   vatIncl: false, discEmbed: true,  label: 'items + VAT + delivery (discount in prices)' },
  ]
  const best = formulas.reduce((a, b) =>
    Math.abs(b.expected - receiptTotal) < Math.abs(a.expected - receiptTotal) ? b : a
  )
  const vatIncluded = best.vatIncl
  const discountEmbedded = best.discEmbed && discountAmount > 0
  const expectedReceiptTotal = best.expected
  const totalMismatch = Math.abs(expectedReceiptTotal - receiptTotal) > 0.5

  // ── Category counts ──
  const foodCount = items.filter(i => i.flow_type === 'COGS').length
  const capexCount = items.filter(i => i.flow_type === 'CapEx').length
  const opexCount = items.filter(i => i.flow_type === 'OpEx').length

  // ── Checkbox helpers ──
  function toggleCheck(idx: number) {
    setCheckedItems((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function toggleAll() {
    if (checkedItems.size === items.length) setCheckedItems(new Set())
    else setCheckedItems(new Set(items.map((_, i) => i)))
  }

  // ── Item operations ──
  function updateItem(idx: number, field: keyof UnifiedItem, value: string | number) {
    setItems((prev) => {
      const next = [...prev]
      const item = { ...next[idx], [field]: value }
      if (field === 'quantity' || field === 'unit_price') {
        item.total_price = Number(item.quantity) * Number(item.unit_price)
      }
      next[idx] = item
      return next
    })
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
    setCheckedItems((prev) => {
      const next = new Set<number>()
      prev.forEach((v) => { if (v < idx) next.add(v); else if (v > idx) next.add(v - 1) })
      return next
    })
    setEditingRows((prev) => { const next = new Set(prev); next.delete(idx); return next })
  }

  function addItem(flowType: FlowType = 'COGS') {
    setItems((prev) => [...prev, emptyItem(flowType)])
    setEditingRows((prev) => new Set(prev).add(items.length))
  }

  // Fetch nomenclature names for matched items
  useEffect(() => {
    const ids = items
      .map((it) => it.nomenclature_id)
      .filter((id): id is string => !!id)
    if (ids.length === 0) return

    const unique = [...new Set(ids)]
    supabase
      .from('nomenclature')
      .select('id,product_code,name,category:product_categories(name)')
      .in('id', unique)
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, { code: string; name: string; category?: string }> = {}
        for (const r of data) {
          // Supabase generates `category` as { name }[] for the FK relation,
          // but the runtime payload is the single related row (or null) since
          // nomenclature.category_id → product_categories.id is to-one.
          // Cast through unknown to bypass the array-vs-object overlap check.
          const cat = r.category as unknown as { name: string } | null
          map[r.id] = { code: r.product_code, name: r.name, category: cat?.name ?? undefined }
        }
        setNomMap(map)
      })
  }, [row.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return null

  const isReadOnly = row.status === 'processed' || !!row.expense_id
  const isSkippedStatus = row.status === 'skipped' && !row.expense_id

  const validate = (): string[] => {
    const errs: string[] = []
    if (!supplierName.trim()) errs.push('Supplier is required')
    if (!transactionDate.trim()) errs.push('Date is required')
    if (items.length === 0) errs.push('No items')
    if (receiptTotal <= 0) errs.push('Receipt total must be > 0')
    items.forEach((it, i) => { if (!it.name.trim()) errs.push(`Item #${i + 1}: empty name`) })
    return errs
  }

  const handleApproveClick = async () => {
    setError(null)
    const errs = validate()
    if (errs.length > 0) {
      setValidationErrors(errs)
      return
    }
    setValidationErrors([])

    // ── Duplicate detection before confirm dialog ──
    try {
      let dupes: LedgerDupe[] = []
      if (invoiceNumber) {
        const { data } = await supabase.rpc('fn_check_expense_duplicate', {
          p_invoice_number: invoiceNumber,
          p_transaction_date: transactionDate || null,
          p_amount: receiptTotal || null,
          p_supplier: null,
        })
        dupes = (Array.isArray(data) ? data : []) as LedgerDupe[]
      } else if (supplierName && receiptTotal > 0 && transactionDate) {
        const { data } = await supabase.rpc('fn_check_expense_duplicate', {
          p_invoice_number: null,
          p_transaction_date: transactionDate,
          p_amount: receiptTotal,
          p_supplier: supplierName,
        })
        dupes = (Array.isArray(data) ? data : []) as LedgerDupe[]
      }

      if (dupes.length > 0) {
        const dupeInfo = dupes.map(d =>
          `${d.transaction_date} — ฿${d.amount_original} (${d.details})`
        ).join('\n')

        const proceed = window.confirm(
          invoiceNumber
            ? `Possible duplicate!\n\nReceipt "${invoiceNumber}" already exists in ledger:\n${dupeInfo}\n\nProceed anyway?`
            : `Possible duplicate!\n\nSimilar expense found:\n${dupeInfo}\n\nProceed anyway?`
        )
        if (!proceed) return
      }
    } catch (err) {
      console.warn('[InboxReviewPanel] Duplicate check failed:', err)
    }

    setIsApproving(true)
    setError(null)
    const photos = row.photo_urls || []
    const finalInvoice = invoiceNumber || `REC-${transactionDate.replace(/-/g, '')}-${row.id.slice(0, 6)}`
    const { food_items, capex_items, opex_items } = splitItemsToPayload(items)
    const editedPayload = {
      ...p,
      supplier_name: supplierName,
      transaction_date: transactionDate,
      amount_original: receiptTotal,
      invoice_number: finalInvoice,
      has_tax_invoice: hasTaxInvoice,
      food_items,
      capex_items,
      opex_items,
      receipt_supplier_url: p.receipt_supplier_url || photos[0] || null,
      receipt_bank_url: p.receipt_bank_url || (photos[1] && photos[1] !== photos[0] ? photos[1] : null),
      tax_invoice_url: p.tax_invoice_url || (hasTaxInvoice && photos.length > 1 ? photos[1] : null),
    }
    const res = await onApprove(row.id, editedPayload)
    setIsApproving(false)
    if (!res.ok) {
      const msg = res.error || 'Approval failed'
      if (msg.includes('duplicate key') && msg.includes('invoice')) {
        setError(`Receipt "${invoiceNumber}" already recorded. Duplicates not allowed.`)
      } else {
        setError(msg)
      }
    } else {
      setResult(`Saved! expense_id: ${res.expense_id}`)
    }
  }

  const handleSkip = async () => {
    setIsSkipping(true)
    const err = await onSkip(row.id)
    setIsSkipping(false)
    if (err) setError(err)
  }

  const handleReopen = async () => {
    setIsReopening(true)
    const err = await onReopen(row.id)
    setIsReopening(false)
    if (err) setError(err)
  }

  /* ── Category dropdown for each row ── */
  const flowSelect = (idx: number, current: FlowType) => (
    <select
      value={current}
      onChange={(e) => updateItem(idx, 'flow_type', e.target.value)}
      disabled={isReadOnly}
      className={`rounded border-0 px-1.5 py-0.5 text-[10px] font-medium outline-none cursor-pointer ${FLOW_STYLES[current]} ${isReadOnly ? 'opacity-60' : ''}`}
    >
      <option value="COGS">COGS</option>
      <option value="OpEx">OpEx</option>
      <option value="CapEx">CapEx</option>
    </select>
  )

  return (
    // On mobile the panel is a full-screen sheet (escapes the inbox table's
    // horizontal scroll); on lg+ it renders inline inside the expanded row as before.
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-slate-900 lg:static lg:z-auto lg:block lg:overflow-visible lg:bg-transparent">
      <div className="flex flex-col lg:flex-row">
      {/* ── LEFT: Zoomable image viewer — sticky on mobile so it stays visible while rows scroll ── */}
      <div className="sticky top-0 z-[5] w-full self-start border-b border-slate-800 bg-slate-900 p-3 lg:w-[340px] lg:shrink-0 lg:border-b-0 lg:border-r">
        {/* Mobile title + close bar (over the pinned image) */}
        {onClose && (
          <div className="mb-2 flex items-center justify-between gap-2 lg:hidden">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">
              {supplierName || 'Receipt'}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              title="Close"
              aria-label="Close review"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        {/* Zoom controls */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
              className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
              title="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[36px] text-center text-[10px] text-slate-500">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(5, z + 0.5))}
              className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
              title="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            {zoom !== 1 && (
              <button
                type="button"
                onClick={resetView}
                className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                title="Reset zoom"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="hidden text-[9px] text-slate-600 lg:inline">Scroll to zoom</span>
            {/* Mobile-only: compact page switcher (out of the image's center) */}
            {row.photo_urls.length > 1 && (
              <div className="flex items-center gap-0.5 lg:hidden">
                <button
                  type="button"
                  onClick={() => setSelectedPhotoIdx((i) => Math.max(0, i - 1))}
                  disabled={selectedPhotoIdx === 0}
                  className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-[10px] tabular-nums text-slate-400">{selectedPhotoIdx + 1}/{row.photo_urls.length}</span>
                <button
                  type="button"
                  onClick={() => setSelectedPhotoIdx((i) => Math.min(row.photo_urls.length - 1, i + 1))}
                  disabled={selectedPhotoIdx === row.photo_urls.length - 1}
                  className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
            {/* Mobile-only: collapse/expand the image to reclaim vertical space */}
            <button
              type="button"
              onClick={() => setImgCollapsed((v) => !v)}
              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-200 lg:hidden"
            >
              {imgCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              {imgCollapsed ? 'Show' : 'Hide'}
            </button>
          </div>
        </div>

        {/* Image container with arrows */}
        <div className="relative">
          <div
            ref={imgContainerRef}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className={`${imgCollapsed ? 'h-14' : 'h-[26vh]'} lg:h-[500px] w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-950 ${zoom > 1 ? 'cursor-grab' : ''} ${isDragging ? 'cursor-grabbing' : ''}`}
          >
            {(() => {
              const stored = row.photo_urls[selectedPhotoIdx] ?? ''
              // null while the signature is in flight or if signing failed — the
              // bucket is private, so the stored value is not a usable fallback.
              const src = stored ? resolvePhoto(stored) : null
              if (!src) {
                return (
                  <div className="flex h-full w-full animate-pulse items-center justify-center text-xs text-slate-600">
                    Loading receipt…
                  </div>
                )
              }
              return isPdfReceipt(stored) ? (
                <iframe src={src} title="Receipt PDF" className="h-full w-full border-0" />
              ) : (
                <img
                  src={src}
                  alt="Receipt"
                  draggable={false}
                  className="h-full w-full select-none"
                  style={{
                    objectFit: 'contain',
                    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                    transformOrigin: 'center center',
                  }}
                />
              )
            })()}
          </div>
          {/* Desktop overlay arrows (mobile uses the compact switcher in the top bar) */}
          {row.photo_urls.length > 1 && (
            <div className="hidden lg:block">
              <button
                type="button"
                onClick={() => setSelectedPhotoIdx((i) => Math.max(0, i - 1))}
                disabled={selectedPhotoIdx === 0}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-slate-900/80 p-1.5 text-slate-300 shadow-lg backdrop-blur-sm hover:bg-slate-800 disabled:opacity-20"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedPhotoIdx((i) => Math.min(row.photo_urls.length - 1, i + 1))}
                disabled={selectedPhotoIdx === row.photo_urls.length - 1}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-slate-900/80 p-1.5 text-slate-300 shadow-lg backdrop-blur-sm hover:bg-slate-800 disabled:opacity-20"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Page thumbnails — desktop only (mobile uses the compact switcher) */}
        {row.photo_urls.length > 1 && (
          <div className="mt-2 hidden items-center justify-center gap-1.5 lg:flex">
            {row.photo_urls.map((url, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedPhotoIdx(i)}
                className={`h-14 w-10 overflow-hidden rounded border ${i === selectedPhotoIdx ? 'border-indigo-500 ring-1 ring-indigo-500/50' : 'border-slate-700 hover:border-slate-500'} bg-slate-800`}
              >
                {isPdfReceipt(url)
                  ? <span className="flex h-full w-full items-center justify-center text-[8px] text-slate-400">PDF</span>
                  : resolvePhoto(url)
                    ? <img src={resolvePhoto(url)!} alt={`page ${i + 1}`} className="h-full w-full object-cover" />
                    : <span className="block h-full w-full animate-pulse bg-slate-900" />
                }
              </button>
            ))}
            <p className="ml-1 text-[9px] text-slate-600">
              {selectedPhotoIdx + 1}/{row.photo_urls.length}
            </p>
          </div>
        )}
      </div>

      {/* ── RIGHT: Parsed data ── */}
      <div className="flex-1 space-y-4 px-4 py-4">
      {/* ── Duplicate warning banner ── */}
      {dupeWarnings.length > 0 && (
        <div className="space-y-1">
          {dupeWarnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-400" />
              <span className="min-w-0 break-words">{w}</span>
            </div>
          ))}
        </div>
      )}
      {/* ── Header: receipt summary ── */}
      <div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {editingHeader ? (
              <input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className={`${inputCls} w-full text-sm font-semibold sm:max-w-xs`}
                placeholder="Supplier"
              />
            ) : (
              <h3 className="text-sm font-semibold text-slate-100">
                {supplierName || 'Unknown'}
              </h3>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${flowBadge(p.flow_type)}`}>
              {p.flow_type}
            </span>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => setEditingHeader(!editingHeader)}
                className={`ml-1 rounded p-0.5 hover:bg-slate-700 ${editingHeader ? 'text-indigo-400' : 'text-slate-600'}`}
                title={editingHeader ? 'Done' : 'Edit header'}
              >
                {editingHeader ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <div>
              <span className="text-slate-500">Date: </span>
              {editingHeader ? (
                <input value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} className={`${inputCls} inline w-32`} />
              ) : (
                <span className="text-slate-200">{transactionDate}</span>
              )}
            </div>
            <div>
              <span className="text-slate-500">Invoice: </span>
              {editingHeader ? (
                <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={`${inputCls} inline w-32`} placeholder="—" />
              ) : (
                <span className="text-slate-200">{invoiceNumber || '\u2014'}</span>
              )}
            </div>
            <div>
              <span className="text-slate-500">Paid by: </span>
              <span className="text-slate-200">{[p.payment_method, p.paid_by].filter(Boolean).join(' · ') || '—'}</span>
            </div>
            <label className="flex cursor-pointer items-center gap-1.5">
              <span className="text-slate-500">Tax invoice: </span>
              <input
                type="checkbox"
                checked={hasTaxInvoice}
                onChange={(e) => setHasTaxInvoice(e.target.checked)}
                disabled={isReadOnly}
                className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800 text-emerald-500 accent-emerald-500 disabled:opacity-50"
              />
              <span className="text-slate-200">{hasTaxInvoice ? 'Yes' : 'No'}</span>
            </label>
          </div>

          {/* Totals bar */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg bg-slate-800/60 px-3 py-2 text-xs">
            <div>
              <span className="text-slate-500">Receipt: </span>
              {editingHeader ? (
                <input
                  type="number"
                  step="any"
                  value={receiptTotal}
                  onChange={(e) => setReceiptTotal(Number(e.target.value))}
                  className={`${numInputCls} inline w-24`}
                />
              ) : (
                <span className="text-slate-200">{'\u0E3F'}{fmt(receiptTotal)}</span>
              )}
            </div>
            {discountAmount > 0 && (
              <div>
                <span className="text-slate-500">Discount: </span>
                <span className="text-rose-400">{fmt(p.discount_total)}</span>
              </div>
            )}
            {p.vat_amount ? (
              <div>
                <span className="text-slate-500">VAT{vatIncluded ? ' (incl.)' : ' (separate)'}: </span>
                <span className="text-slate-300">{fmt(p.vat_amount)}</span>
              </div>
            ) : null}
            <div className="w-full sm:ml-auto sm:w-auto">
              <span className="text-slate-500">TOTAL (items): </span>
              <span className={`text-base font-semibold ${totalMismatch ? 'text-amber-400' : 'text-slate-100'}`}>
                {'\u0E3F'}{fmt(calculatedTotal)}
              </span>
            </div>
          </div>

          {/* Reconciliation formula */}
          {!totalMismatch && (discountAmount > 0 || (!vatIncluded && vatAmount > 0)) && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-[10px] text-slate-400">
              <Check className="h-3 w-3 flex-shrink-0 text-emerald-500" />
              {'\u0E3F'}{fmt(calculatedTotal)}{!discountEmbedded && discountAmount > 0 ? ` \u2212 ${fmt(discountAmount)}` : ''}{!vatIncluded && vatAmount ? ` + ${fmt(vatAmount)}` : ''} = {'\u0E3F'}{fmt(expectedReceiptTotal)}
            </div>
          )}
          {/* Mismatch warning */}
          {totalMismatch && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span className="min-w-0 break-words">
                Items ({'\u0E3F'}{fmt(calculatedTotal)}){discountEmbedded ? ` [discount \u0E3F${fmt(discountAmount)} already in prices]` : ` \u2212 discount (\u0E3F${fmt(discountAmount)})`}{!vatIncluded && vatAmount ? ` + VAT (\u0E3F${fmt(vatAmount)})` : ''}{vatIncluded && vatAmount ? ` [VAT \u0E3F${fmt(vatAmount)} incl.]` : ''}{deliveryFee ? ` + delivery (\u0E3F${fmt(deliveryFee)})` : ''} = {'\u0E3F'}{fmt(expectedReceiptTotal)} \u2260 receipt ({'\u0E3F'}{fmt(receiptTotal)}).
                {' '}Diff: {'\u0E3F'}{fmt(Math.abs(expectedReceiptTotal - receiptTotal))}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Unified items table ── */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <h4 className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Items ({items.length})
            {checkedItems.size > 0 && (
              <span className="ml-2 text-slate-500">— {checkedItems.size}/{items.length} verified</span>
            )}
          </h4>
          <div className="flex items-center gap-2 text-[9px]">
            {foodCount > 0 && <span className="text-emerald-400">COGS: {foodCount}</span>}
            {opexCount > 0 && <span className="text-amber-400">OpEx: {opexCount}</span>}
            {capexCount > 0 && <span className="text-sky-400">CapEx: {capexCount}</span>}
          </div>
        </div>
        <div className="hidden max-h-[36rem] overflow-y-auto overflow-x-auto rounded-lg border border-slate-800 md:block">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-900 text-[9px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-2 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && checkedItems.size === items.length}
                    ref={(el) => { if (el) el.indeterminate = checkedItems.size > 0 && checkedItems.size < items.length }}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 cursor-pointer rounded border-slate-600 bg-slate-800 accent-indigo-500"
                  />
                </th>
                <th className="w-8 px-2 py-1.5 text-left">#</th>
                <th className="w-16 px-2 py-1.5 text-left">Type</th>
                <th className="min-w-[140px] px-2 py-1.5 text-left">Product</th>
                <th className="min-w-[100px] px-2 py-1.5 text-left">Barcode</th>
                <th className="w-16 px-2 py-1.5 text-right">Qty</th>
                <th className="w-14 px-2 py-1.5 text-left">Unit</th>
                <th className="w-20 px-2 py-1.5 text-right">Price</th>
                <th className="w-20 px-2 py-1.5 text-right">Total</th>
                <th className="px-2 py-1.5 text-left">Category</th>
                <th className="px-2 py-1.5 text-left">Nomenclature</th>
                {!isReadOnly && <th className="w-16 px-1 py-1.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {items.map((item, i) => {
                const nom = item.nomenclature_id ? nomMap[item.nomenclature_id] : null
                const editing = editingRows.has(i)
                const checked = checkedItems.has(i)
                const rowBg = checked
                  ? item.flow_type === 'CapEx' ? 'bg-sky-500/5' : item.flow_type === 'OpEx' ? 'bg-amber-500/5' : 'bg-emerald-500/5'
                  : ''
                return (
                  <tr key={i} className={`hover:bg-slate-800/30 ${rowBg}`}>
                    <td className="w-10 px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCheck(i)}
                        className="h-3.5 w-3.5 cursor-pointer rounded border-slate-600 bg-slate-800 accent-indigo-500"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-slate-500">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      {flowSelect(i, item.flow_type)}
                    </td>
                    <td className="px-2 py-1.5">
                      {editing ? (
                        <input value={item.name} onChange={(e) => updateItem(i, 'name', e.target.value)} className={inputCls} />
                      ) : (
                        <>
                          <div className="text-slate-200">{item.name}</div>
                          {item.original_name && item.original_name !== item.name && (
                            <div className="text-[10px] text-slate-500">{item.original_name}</div>
                          )}
                          {item.brand && (
                            <span className="text-[10px] text-slate-600">{item.brand} {item.package_weight || ''}</span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {editing ? (
                        <input value={item.barcode || ''} onChange={(e) => updateItem(i, 'barcode', e.target.value)} className={`${inputCls} font-mono text-[10px]`} placeholder="barcode" />
                      ) : (
                        <span className="font-mono text-[10px] text-slate-500">{item.barcode || item.supplier_sku || '\u2014'}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {editing ? (
                        <input type="number" step="any" value={item.quantity} onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))} className={`${numInputCls} w-16`} />
                      ) : (
                        <span className="text-slate-300">{item.quantity}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {editing ? (
                        <input value={item.unit} onChange={(e) => updateItem(i, 'unit', e.target.value)} className={`${inputCls} w-12`} />
                      ) : (
                        <span className="text-slate-400">{item.unit}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {editing ? (
                        <input type="number" step="any" value={item.unit_price} onChange={(e) => updateItem(i, 'unit_price', Number(e.target.value))} className={`${numInputCls} w-20`} />
                      ) : (
                        <span className="text-slate-300">{fmt(item.unit_price)}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right text-slate-200">{fmt(item.total_price)}</td>
                    <td className="px-2 py-1.5">
                      {nom?.category ? (
                        <span className="text-[10px] text-slate-400">{nom.category}</span>
                      ) : (
                        <span className="text-[10px] text-slate-600">{'\u2014'}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {nom ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-emerald-400">{nom.name}</span>
                          {confidenceBadge(item.confidence)}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-amber-400">New</span>
                          {confidenceBadge(item.confidence)}
                        </div>
                      )}
                    </td>
                    {!isReadOnly && (
                      <td className="px-1 py-1.5 text-center">
                        <div className="flex items-center gap-0.5">
                          <button type="button" onClick={() => toggleEdit(i)} className={`rounded p-0.5 hover:bg-slate-700 ${editing ? 'text-indigo-400' : 'text-slate-500'}`} title={editing ? 'Done' : 'Edit'}>
                            {editing ? <Check className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                          </button>
                          <button type="button" onClick={() => removeItem(i)} className="rounded p-0.5 text-slate-600 hover:bg-slate-700 hover:text-rose-400" title="Delete">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── Mobile card list (replaces the wide table below md) — compact ── */}
        <div className="space-y-1.5 md:hidden">
          {items.map((item, i) => {
            const nom = item.nomenclature_id ? nomMap[item.nomenclature_id] : null
            const editing = editingRows.has(i)
            const checked = checkedItems.has(i)
            const cardBg = checked
              ? item.flow_type === 'CapEx' ? 'bg-sky-500/5' : item.flow_type === 'OpEx' ? 'bg-amber-500/5' : 'bg-slate-900/40'
              : 'bg-slate-900/40'
            const barcode = item.barcode || item.supplier_sku
            return (
              <div key={i} className={`rounded-lg border border-slate-800 px-2.5 py-2 ${cardBg}`}>
                {/* Row 1: verify · # · flow · actions */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCheck(i)}
                    className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-600 bg-slate-800 accent-indigo-500"
                    aria-label={`Verify item ${i + 1}`}
                  />
                  <span className="text-[11px] text-slate-500">#{i + 1}</span>
                  {flowSelect(i, item.flow_type)}
                  {!isReadOnly && (
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleEdit(i)}
                        className={`flex h-8 items-center gap-1 rounded-md border px-2 text-[11px] font-medium ${editing ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-slate-600 text-slate-300 hover:bg-slate-700'}`}
                        aria-label={editing ? 'Done editing' : 'Edit item'}
                      >
                        {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                        {editing ? 'Done' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-700 hover:text-rose-400"
                        title="Delete"
                        aria-label="Delete item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Row 2: name */}
                {editing ? (
                  <input value={item.name} onChange={(e) => updateItem(i, 'name', e.target.value)} className={`${inputCls} mt-1.5 w-full text-sm`} />
                ) : (
                  <div className="mt-1 text-sm leading-snug text-slate-100">{item.name}</div>
                )}

                {/* Row 3: qty · unit-price ............ total */}
                {editing ? (
                  <div className="mt-1.5">
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[9px] uppercase text-slate-500">Qty</span>
                        <input type="number" step="any" value={item.quantity} onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))} className={numInputCls} />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[9px] uppercase text-slate-500">Unit</span>
                        <input value={item.unit} onChange={(e) => updateItem(i, 'unit', e.target.value)} className={inputCls} />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[9px] uppercase text-slate-500">Price / unit</span>
                        <input type="number" step="any" value={item.unit_price} onChange={(e) => updateItem(i, 'unit_price', Number(e.target.value))} className={numInputCls} />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[9px] uppercase text-slate-500">Weight / pack</span>
                        <input value={item.package_weight || ''} onChange={(e) => updateItem(i, 'package_weight', e.target.value)} className={inputCls} placeholder="e.g. 1 kg" />
                      </label>
                    </div>
                    <div className="mt-1.5 flex items-baseline justify-between border-t border-slate-800 pt-1.5 text-xs">
                      <span className="text-slate-500">Total (qty × price)</span>
                      <span className="text-sm font-semibold text-slate-100">{'฿'}{fmt(item.total_price)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-slate-400">
                      {item.quantity} {item.unit}
                      {item.unit_price ? <span className="text-slate-500"> · {fmt(item.unit_price)}/u</span> : null}
                    </span>
                    <span className="text-sm font-semibold text-slate-100">{'฿'}{fmt(item.total_price)}</span>
                  </div>
                )}

                {/* Row 4: match · confidence · category · barcode (only what's present) */}
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                  {nom ? (
                    <span className="text-emerald-400">{nom.name}</span>
                  ) : (
                    <span className="text-amber-400">New</span>
                  )}
                  {confidenceBadge(item.confidence)}
                  {nom?.category && <span className="text-slate-500">{nom.category}</span>}
                  {editing ? (
                    <input value={item.barcode || ''} onChange={(e) => updateItem(i, 'barcode', e.target.value)} className={`${inputCls} mt-1 w-full font-mono text-[10px]`} placeholder="barcode" />
                  ) : (
                    barcode && <span className="break-all font-mono text-slate-600">{barcode}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {!isReadOnly && (
          <div className="mt-1.5 flex items-center gap-2">
            <button type="button" onClick={() => addItem('COGS')} className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-emerald-500 hover:bg-emerald-500/10">
              <Plus className="h-3 w-3" /> Food
            </button>
            <button type="button" onClick={() => addItem('OpEx')} className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-amber-500 hover:bg-amber-500/10">
              <Plus className="h-3 w-3" /> OpEx
            </button>
            <button type="button" onClick={() => addItem('CapEx')} className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-sky-500 hover:bg-sky-500/10">
              <Plus className="h-3 w-3" /> CapEx
            </button>
          </div>
        )}
      </div>

      {/* ── GDrive paths ── */}
      {row.gdrive_paths && row.gdrive_paths.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
          <FolderOpen className="h-3 w-3 shrink-0" />
          {row.gdrive_paths.map((gp, i) => (
            <span key={i} className="max-w-full truncate rounded bg-slate-800 px-1.5 py-0.5 text-slate-400">{gp}</span>
          ))}
        </div>
      )}

      {/* ── Validation errors ── */}
      {validationErrors.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <div className="mb-1 font-medium">Fix before approving:</div>
          <ul className="list-inside list-disc space-y-0.5">
            {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* ── Error / Result ── */}
      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div>
      )}
      {result && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{result}</div>
      )}

      {/* ── Actions ── */}
      <div className="flex items-center gap-2 border-t border-slate-800 pt-3">
        {isReadOnly ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-md bg-emerald-500/15 px-3 py-2 font-medium text-emerald-400">
              Saved to ledger
            </span>
            {row.expense_id && (
              <span className="text-[10px] text-slate-500">expense_id: {row.expense_id}</span>
            )}
          </div>
        ) : isSkippedStatus ? (
          <>
            <button
              type="button"
              disabled={isReopening}
              onClick={handleReopen}
              className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              {isReopening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Reopen for review
            </button>
            <span className="text-[10px] text-slate-500">Status: skipped</span>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={isApproving || !!result}
              onClick={handleApproveClick}
              className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {isApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Approve ({items.length} items)
            </button>
            <button
              type="button"
              disabled={isSkipping || !!result}
              onClick={handleSkip}
              className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-xs text-slate-400 hover:bg-slate-700 disabled:opacity-40"
            >
              {isSkipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              Skip
            </button>
          </>
        )}
        <div className="ml-auto flex items-center gap-3 text-[10px] text-slate-600">
          {checkedItems.size > 0 && (
            <span className="text-emerald-500/70">
              Verified: {checkedItems.size}/{items.length}
            </span>
          )}
          <span>{p.currency ?? 'THB'} | {p.flow_type} | cat {p.category_code ?? '\u2014'}</span>
        </div>
      </div>
    </div>
    </div>
    </div>
  )
}
