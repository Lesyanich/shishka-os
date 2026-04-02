import { lazy, Suspense, useEffect, useState } from 'react'
import { useExpenseLedger } from '../hooks/useExpenseLedger'
import type { ExpenseRow } from '../hooks/useExpenseLedger'
import { useSupplierMapping } from '../hooks/useSupplierMapping'
import { supabase } from '../lib/supabase'
import { formatTHB, formatTHBFull } from '../components/finance/helpers'
import { KpiCard } from '../components/finance/KpiCard'
const MonthlyChart = lazy(() => import('../components/finance/MonthlyChart').then(m => ({ default: m.MonthlyChart })))
import { ExpenseForm } from '../components/finance/ExpenseForm'
import { ExpenseHistory } from '../components/finance/ExpenseHistory'
import { ExpenseEditModal } from '../components/finance/ExpenseEditModal'
import { MagicDropzone } from '../components/finance/MagicDropzone'
import { SmartTextInput } from '../components/finance/SmartTextInput'
import { ReceiptLightbox } from '../components/finance/ReceiptLightbox'
import { StagingArea } from '../components/finance/StagingArea'
import type { ParsedReceipt, ReceiptUrls, ApprovePayload, FoodItem, ReceiptJob } from '../types/receipt'

/* ═══════════════════════════════════════════════════════════════════
   FinanceManager — Thin Page Orchestrator
   State machine: idle → pending → staging → (approve|cancel) → idle
   Phase 4.14: Async receipt processing via Realtime subscription
   ═══════════════════════════════════════════════════════════════════ */

/** Phase 6.6c: Sanitize OCR-dirty numbers (e.g., "225,!" → 225, "1.0.00" → 1) */
function sanitizeNum(v: unknown): number {
  if (v == null || v === '') return 0
  const s = String(v).replace(/[^\d.]/g, '')
  const parts = s.split('.')
  const clean = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : s
  const n = Number(clean)
  return isNaN(n) ? 0 : n
}

/** Sanitize number preserving negative sign (for discount_total) */
function sanitizeSigned(v: unknown): number {
  if (v == null || v === '') return 0
  const neg = String(v).includes('-')
  const n = sanitizeNum(v)
  return neg ? -Math.abs(n) : n
}

/** Fuzzy match supplier name from AI to existing suppliers */
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

/* ── Module-level job resolver — survives HMR remounts ── */
let _activeResolveJobId: string | null = null

async function resolveJobToSessionStorage(jobId: string) {
  // Prevent duplicate resolves for the same job
  if (_activeResolveJobId === jobId) return
  _activeResolveJobId = jobId

  try {
    console.log('[ReceiptJob] Resolving job:', jobId)
    const { data: job, error: fetchErr } = await supabase
      .from('receipt_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (fetchErr) {
      console.error('[ReceiptJob] DB fetch error:', fetchErr.message)
      _activeResolveJobId = null
      return
    }

    console.log('[ReceiptJob] Job status:', job?.status, 'has result:', !!job?.result)

    if (!job || job.status !== 'completed' || !job.result) {
      if (job?.status === 'failed') {
        console.error('[ReceiptJob] Job failed:', job.error)
        sessionStorage.removeItem('pendingReceiptJobId')
        window.dispatchEvent(new CustomEvent('receipt-job-failed', { detail: job.error || 'AI parsing failed' }))
      }
      _activeResolveJobId = null
      return
    }

    const result = job.result as ParsedReceipt
    const imageUrls = (job.image_urls as string[]) || []

    // Build receiptUrls from AI document classification
    const urls: ReceiptUrls = {}
    const docs = result.documents
    if (docs) {
      if (docs.supplier_receipt_index != null && imageUrls[docs.supplier_receipt_index])
        urls.supplier = imageUrls[docs.supplier_receipt_index]
      if (docs.bank_slip_index != null && imageUrls[docs.bank_slip_index])
        urls.bank = imageUrls[docs.bank_slip_index]
      if (docs.tax_invoice_index != null && imageUrls[docs.tax_invoice_index])
        urls.tax = imageUrls[docs.tax_invoice_index]
    } else {
      if (imageUrls[0]) urls.supplier = imageUrls[0]
      if (imageUrls[1]) urls.bank = imageUrls[1]
      if (imageUrls[2]) urls.tax = imageUrls[2]
    }

    // Reclassify line_items into food/capex/opex (without applyMappings for now)
    if (result.line_items?.length) {
      result.food_items = result.line_items
        .filter((li) => li.category === 'food')
        .map((li) => ({
          name: li.makro_name || li.translated_name || li.original_name || '',
          quantity: sanitizeNum(li.quantity),
          unit: li.unit || 'pcs',
          unit_price: sanitizeNum(li.unit_price),
          total_price: sanitizeNum(li.total_price),
          nomenclature_id: li.nomenclature_id ?? undefined,
          supplier_sku: li.supplier_sku ?? null,
          original_name: li.original_name ?? null,
          brand: li.brand ?? undefined,
          package_weight: li.package_weight ?? undefined,
          makro_name: li.makro_name ?? undefined,
          full_title: li.full_title ?? undefined,
        } as FoodItem))

      result.capex_items = result.line_items
        .filter((li) => li.category === 'capex')
        .map((li) => ({
          name: li.translated_name || li.original_name || '',
          quantity: sanitizeNum(li.quantity),
          unit_price: sanitizeNum(li.unit_price),
          total_price: sanitizeNum(li.total_price),
        }))

      result.opex_items = result.line_items
        .filter((li) => li.category === 'opex' || li.category === 'uncategorized')
        .map((li) => ({
          description: li.translated_name || li.original_name || '',
          quantity: sanitizeNum(li.quantity),
          unit: li.unit || 'pcs',
          unit_price: sanitizeNum(li.unit_price),
          total_price: sanitizeNum(li.total_price),
        }))
    }

    // Sanitize totals
    result.total_amount = sanitizeNum(result.total_amount)
    if (result.footer) {
      result.footer = {
        subtotal: sanitizeNum(result.footer.subtotal),
        discount_total: sanitizeSigned(result.footer.discount_total),
        vat_amount: sanitizeNum(result.footer.vat_amount),
        delivery_fee: sanitizeNum(result.footer.delivery_fee),
        grand_total: sanitizeNum(result.footer.grand_total),
      }
    }

    // Write to sessionStorage — React will pick it up on next mount/effect
    const stagingPayload = { receipt: result, urls, imageUrls }
    const payloadJson = JSON.stringify(stagingPayload)
    console.log('[ReceiptJob] Writing stagingData to sessionStorage:', payloadJson.length, 'bytes,', result.line_items?.length ?? 0, 'items, total:', result.total_amount)
    sessionStorage.setItem('stagingData', payloadJson)
    sessionStorage.removeItem('pendingReceiptJobId')
    sessionStorage.removeItem('pendingReceiptImageUrls')

    // Signal to any listening component
    console.log('[ReceiptJob] Dispatching receipt-job-resolved event')
    window.dispatchEvent(new Event('receipt-job-resolved'))
  } catch (err) {
    console.error('[ReceiptJob] Module-level resolve error:', err)
  } finally {
    _activeResolveJobId = null
  }
}

export function FinanceManager() {
  const {
    rows,
    categories,
    subCategories,
    suppliers,
    monthlySummaries,
    grandTotal,
    isLoading,
    error,
    refetch,
    updateExpense,
  } = useExpenseLedger()

  const { applyMappings, saveMapping, lookupMappings, updateConversion, lookupByBarcodes } = useSupplierMapping()

  /* Receipt URLs injected from MagicDropzone */
  const [receiptUrls, setReceiptUrls] = useState<ReceiptUrls>({})

  /* Lightbox state */
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  /* Edit modal state */
  const [editingRow, setEditingRow] = useState<ExpenseRow | null>(null)

  /* Quick text from SmartTextInput — passed to ExpenseForm */
  const [quickText, setQuickText] = useState<string | undefined>(undefined)

  /* ── Phase 4.14: Async job tracking ── */
  /* Persist pendingJobId in sessionStorage so it survives HMR/reload */
  const [pendingJobId, _setPendingJobId] = useState<string | null>(
    () => sessionStorage.getItem('pendingReceiptJobId'),
  )
  const setPendingJobId = (id: string | null) => {
    if (id) sessionStorage.setItem('pendingReceiptJobId', id)
    else sessionStorage.removeItem('pendingReceiptJobId')
    _setPendingJobId(id)
  }
  const [pendingImageUrls, setPendingImageUrls] = useState<string[]>(
    () => {
      const stored = sessionStorage.getItem('pendingReceiptImageUrls')
      return stored ? JSON.parse(stored) : []
    },
  )
  const [jobError, setJobError] = useState<string | null>(null)

  /* ── Staging Area state (Phase 4.4 + 4.6: added imageUrls) ── */
  /* Initialize from sessionStorage to survive HMR remounts */
  const [stagingData, _setStagingData] = useState<{
    receipt: ParsedReceipt
    urls: ReceiptUrls
    imageUrls: string[]
  } | null>(() => {
    const stored = sessionStorage.getItem('stagingData')
    if (stored) {
      try { return JSON.parse(stored) } catch { /* ignore */ }
    }
    return null
  })
  const setStagingData = (data: typeof stagingData) => {
    if (data) {
      sessionStorage.setItem('stagingData', JSON.stringify(data))
    } else {
      sessionStorage.removeItem('stagingData')
    }
    _setStagingData(data)
  }

  // Listen for module-level resolver completing
  useEffect(() => {
    const onResolved = () => {
      console.log('[FinanceManager] receipt-job-resolved event received (global listener)')
      const stored = sessionStorage.getItem('stagingData')
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          console.log('[FinanceManager] Setting stagingData from sessionStorage, items:', parsed?.receipt?.line_items?.length)
          _setStagingData(parsed)
          _setPendingJobId(null)
        } catch (e) { console.error('[FinanceManager] Failed to parse stagingData:', e) }
      } else {
        console.warn('[FinanceManager] receipt-job-resolved fired but no stagingData in sessionStorage')
      }
    }
    const onFailed = (e: Event) => {
      const detail = (e as CustomEvent).detail
      console.error('[FinanceManager] receipt-job-failed:', detail)
      setJobError(detail || 'AI parsing failed')
      _setPendingJobId(null)
    }
    window.addEventListener('receipt-job-resolved', onResolved)
    window.addEventListener('receipt-job-failed', onFailed)
    return () => {
      window.removeEventListener('receipt-job-resolved', onResolved)
      window.removeEventListener('receipt-job-failed', onFailed)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Lazy-loaded nomenclature for staging area food item mapping */
  const [nomenclature, setNomenclature] = useState<
    { id: string; name: string; product_code: string; category_id: string | null }[]
  >([])

  /* Product categories for category column in food items table */
  const [productCategories, setProductCategories] = useState<
    { id: string; code: string; name: string; parent_id: string | null; level: number }[]
  >([])

  // Fetch RAW nomenclature + product_categories only when staging area opens
  useEffect(() => {
    if (!stagingData) return
    // CLAUDE.md rule #3: separate queries, no INNER JOIN
    supabase
      .from('nomenclature')
      .select('id, name, product_code, category_id')
      .ilike('product_code', 'RAW-%')
      .order('name')
      .then(({ data }) => setNomenclature(data ?? []))
    supabase
      .from('product_categories')
      .select('id, code, name, parent_id, level')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setProductCategories(data ?? []))
  }, [stagingData])

  // Phase 4.14: Realtime subscription + module-level resolver
  // Module-level resolver writes to sessionStorage (survives HMR)
  // This effect: (1) kicks off resolver, (2) Realtime subscription, (3) listens for resolution
  useEffect(() => {
    if (!pendingJobId) return

    console.log('[FinanceManager] pendingJobId effect fired:', pendingJobId)

    // Kick off module-level resolve (idempotent — won't duplicate)
    resolveJobToSessionStorage(pendingJobId)

    // Listen for resolution signal from module-level resolver
    const onResolved = () => {
      console.log('[FinanceManager] receipt-job-resolved event received (job-specific listener)')
      const stored = sessionStorage.getItem('stagingData')
      if (stored) {
        try {
          _setStagingData(JSON.parse(stored))
        } catch (e) {
          console.error('[FinanceManager] Failed to parse stagingData:', e)
        }
        _setPendingJobId(null)
        setPendingImageUrls([])
        setJobError(null)
      }
    }
    window.addEventListener('receipt-job-resolved', onResolved)

    // Realtime subscription as primary channel
    const channel = supabase
      .channel(`receipt-job-${pendingJobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'receipt_jobs',
          filter: `id=eq.${pendingJobId}`,
        },
        (payload) => {
          const job = payload.new as ReceiptJob
          console.log('[FinanceManager] Realtime UPDATE:', job.status)
          if (job.status === 'completed') {
            resolveJobToSessionStorage(pendingJobId!)
          } else if (job.status === 'failed') {
            setJobError(job.error || 'AI parsing failed')
            setPendingJobId(null)
          }
        },
      )
      .subscribe((status) => {
        console.log('[FinanceManager] Realtime subscription status:', status)
      })

    // Fallback poll every 5s (was 10s — more aggressive for Google Drive HMR environments)
    const fallbackTimer = setInterval(() => {
      if (!sessionStorage.getItem('pendingReceiptJobId')) {
        console.log('[FinanceManager] Poll: no pendingReceiptJobId, clearing timer')
        clearInterval(fallbackTimer)
        return
      }
      console.log('[FinanceManager] Poll: checking job status...')
      resolveJobToSessionStorage(pendingJobId!)
    }, 5_000)

    return () => {
      window.removeEventListener('receipt-job-resolved', onResolved)
      supabase.removeChannel(channel)
      clearInterval(fallbackTimer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJobId])

  const handleCreated = () => {
    setReceiptUrls({})
    setQuickText(undefined)
    refetch()
  }

  /* ── AI result handler — Phase 4.14: receives ParsedReceipt + imageUrls ── */
  const handleAiResult = async (
    receipt: ParsedReceipt,
    imageUrls: string[],
  ) => {
    // Build receiptUrls from AI document classification
    const urls: ReceiptUrls = {}
    const docs = receipt.documents
    if (docs) {
      if (docs.supplier_receipt_index != null && imageUrls[docs.supplier_receipt_index]) {
        urls.supplier = imageUrls[docs.supplier_receipt_index]
      }
      if (docs.bank_slip_index != null && imageUrls[docs.bank_slip_index]) {
        urls.bank = imageUrls[docs.bank_slip_index]
      }
      if (docs.tax_invoice_index != null && imageUrls[docs.tax_invoice_index]) {
        urls.tax = imageUrls[docs.tax_invoice_index]
      }
    } else {
      // Fallback: positional mapping (backward compat)
      if (imageUrls[0]) urls.supplier = imageUrls[0]
      if (imageUrls[1]) urls.bank = imageUrls[1]
      if (imageUrls[2]) urls.tax = imageUrls[2]
    }
    setReceiptUrls(urls)

    // Phase 4.6: If new line_items[] format, run mapping engine + reclassify
    if (receipt.line_items && receipt.line_items.length > 0) {
      // Resolve supplier_id for mapping lookup
      const supplierId = fuzzyMatchSupplier(receipt.supplier_name, suppliers)

      // Apply saved mappings (SKU → nomenclature_id)
      const mapped = supplierId
        ? await applyMappings(supplierId, receipt.line_items)
        : receipt.line_items

      // Reclassify into legacy 3-array format for existing RPC
      // Phase 6.6c: Sanitize all numeric fields (strip OCR dust like "225,!")
      receipt.food_items = mapped
        .filter((li) => li.category === 'food')
        .map((li) => ({
          name: li.makro_name || li.translated_name || li.original_name || '',
          quantity: sanitizeNum(li.quantity),
          unit: li.unit || 'pcs',
          unit_price: sanitizeNum(li.unit_price),
          total_price: sanitizeNum(li.total_price),
          nomenclature_id: li.nomenclature_id ?? undefined,
          supplier_sku: li.supplier_sku ?? null,
          original_name: li.original_name ?? null,
          brand: li.brand ?? undefined,
          package_weight: li.package_weight ?? undefined,
          makro_name: li.makro_name ?? undefined,
          full_title: li.full_title ?? undefined,
        } as FoodItem))

      receipt.capex_items = mapped
        .filter((li) => li.category === 'capex')
        .map((li) => ({
          name: li.translated_name || li.original_name || '',
          quantity: sanitizeNum(li.quantity),
          unit_price: sanitizeNum(li.unit_price),
          total_price: sanitizeNum(li.total_price),
        }))

      receipt.opex_items = mapped
        .filter((li) => li.category === 'opex' || li.category === 'uncategorized')
        .map((li) => ({
          description: li.translated_name || li.original_name || '',
          quantity: sanitizeNum(li.quantity),
          unit: li.unit || 'pcs',
          unit_price: sanitizeNum(li.unit_price),
          total_price: sanitizeNum(li.total_price),
        }))
    }

    // Phase 6.6c: Sanitize total_amount and footer values (OCR dust defense)
    receipt.total_amount = sanitizeNum(receipt.total_amount)
    if (receipt.footer) {
      receipt.footer = {
        subtotal: sanitizeNum(receipt.footer.subtotal),
        discount_total: sanitizeSigned(receipt.footer.discount_total),
        vat_amount: sanitizeNum(receipt.footer.vat_amount),
        delivery_fee: sanitizeNum(receipt.footer.delivery_fee),
        grand_total: sanitizeNum(receipt.footer.grand_total),
      }
    }

    setStagingData({ receipt, urls, imageUrls })
  }

  /* ── Save mapping callback — passed to StagingArea ── */
  const handleSaveMapping = async (params: {
    supplierId: string
    supplierSku: string | null
    originalName: string
    nomenclatureId: string
    purchaseUnit?: string
    conversionFactor?: number
    baseUnit?: string
  }) => {
    await saveMapping(params)
  }

  /* ── Phase 6.3: Create new nomenclature item ── */
  const handleCreateNomenclature = async (params: {
    name: string
    baseUnit: string
  }): Promise<string> => {
    // Generate product_code: RAW-{UPPER_SLUG}
    const slug = params.name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 30)
    const productCode = `RAW-${slug}`

    // Check for duplicate
    const { data: existing } = await supabase
      .from('nomenclature')
      .select('id')
      .eq('product_code', productCode)
      .maybeSingle()

    if (existing) {
      // Already exists — just return its id
      return existing.id
    }

    const { data, error: insertErr } = await supabase
      .from('nomenclature')
      .insert({
        product_code: productCode,
        name: params.name,
        type: 'good',
        base_unit: params.baseUnit,
      })
      .select('id')
      .single()

    if (insertErr) throw insertErr
    // Refresh nomenclature list for staging area
    const { data: freshNom } = await supabase
      .from('nomenclature')
      .select('id, name, product_code, category_id')
      .ilike('product_code', 'RAW-%')
      .order('name')
    if (freshNom) setNomenclature(freshNom)

    return data.id
  }

  /* ── Approve handler — calls fn_approve_receipt RPC ── */
  const handleApprove = async (payload: ApprovePayload) => {
    const { data, error: rpcErr } = await supabase.rpc('fn_approve_receipt', {
      p_payload: payload,
    })

    if (rpcErr) throw rpcErr
    if (data && !data.ok) throw new Error(data.error || 'RPC returned error')

    // Success — exit staging, refetch
    setStagingData(null)
    setReceiptUrls({})
    refetch()
  }

  // Current month KPI
  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthTotal = rows
    .filter((r) => r.transaction_date.startsWith(currentMonthKey))
    .reduce((s, r) => s + r.amount_thb, 0)
  const prevMonthKey = now.getMonth() === 0
    ? `${now.getFullYear() - 1}-12`
    : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`
  const prevMonthTotal = rows
    .filter((r) => r.transaction_date.startsWith(prevMonthKey))
    .reduce((s, r) => s + r.amount_thb, 0)
  const monthDelta = prevMonthTotal > 0 ? ((monthTotal - prevMonthTotal) / prevMonthTotal) * 100 : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Finance</h1>
        <p className="mt-1 text-sm text-slate-500">
          Expense ledger with multi-currency support and receipt storage.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="This Month"
          value={`฿${formatTHBFull(monthTotal)}`}
          delta={monthDelta}
          isLoading={isLoading}
        />
        <KpiCard
          label="All-time Total"
          value={`฿${formatTHBFull(grandTotal)}`}
          isLoading={isLoading}
        />
        <KpiCard
          label="Transactions"
          value={String(rows.length)}
          isLoading={isLoading}
        />
      </div>

      {/* Smart Text Input — quick log line */}
      <SmartTextInput onSubmitText={setQuickText} />

      {/* Magic Dropzone — full width (Phase 4.14: async) */}
      <MagicDropzone
        onUrlsReady={setReceiptUrls}
        onJobCreated={(jobId, imageUrls) => {
          setPendingJobId(jobId)
          setPendingImageUrls(imageUrls)
          sessionStorage.setItem('pendingReceiptImageUrls', JSON.stringify(imageUrls))
          setJobError(null)
        }}
        isPending={!!pendingJobId}
      />

      {/* Phase 4.14: Job error toast */}
      {jobError && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 shadow-sm">
          <div className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
          <p className="text-xs leading-relaxed text-rose-300/90">
            AI parsing failed: {jobError}
          </p>
          <button
            type="button"
            onClick={() => setJobError(null)}
            className="ml-auto text-xs text-slate-500 hover:text-slate-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* When StagingArea is active — full-width layout for invoice precision */}
      {stagingData && (
        <div className="space-y-6">
          <StagingArea
            receipt={stagingData.receipt}
            receiptUrls={stagingData.urls}
            imageUrls={stagingData.imageUrls}
            nomenclatureList={nomenclature}
            productCategories={productCategories}
            suppliersList={suppliers}
            categories={categories}
            subCategories={subCategories}
            onApprove={handleApprove}
            onCancel={() => setStagingData(null)}
            onSaveMapping={handleSaveMapping}
            onCreateNomenclature={handleCreateNomenclature}
            onLookupMappings={lookupMappings}
            onLookupBarcodes={lookupByBarcodes}
            onUpdateConversion={updateConversion}
          />
        </div>
      )}

      {/* Main grid: Form (left) | Chart + History (right) — hidden when staging */}
      <div className={`grid gap-6 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)] ${stagingData ? 'hidden' : ''}`}>
        <div className="space-y-6">
          {!stagingData && (
            <ExpenseForm
              categories={categories}
              subCategories={subCategories}
              suppliers={suppliers}
              receiptUrls={receiptUrls}
              quickText={quickText}
              onCreated={handleCreated}
            />
          )}
        </div>
        <div className="space-y-6">
          <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-slate-800/50" />}>
            <MonthlyChart

              summaries={monthlySummaries}
              isLoading={isLoading}
              error={error}
            />
          </Suspense>
          <ExpenseHistory
            rows={rows}
            categories={categories}
            subCategories={subCategories}
            suppliers={suppliers}
            isLoading={isLoading}
            error={error}
            onRefetch={refetch}
            onReceiptClick={setLightboxUrl}
            onEditClick={setEditingRow}
            onUpdateExpense={updateExpense}
          />
        </div>
      </div>

      {/* Edit modal */}
      <ExpenseEditModal
        row={editingRow}
        categories={categories}
        subCategories={subCategories}
        suppliers={suppliers}
        onSave={updateExpense}
        onClose={() => setEditingRow(null)}
      />

      {/* Receipt Lightbox modal */}
      <ReceiptLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  )
}
