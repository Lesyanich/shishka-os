import { useEffect, useState } from 'react'
import { useExpenseLedger } from '../hooks/useExpenseLedger'
import type { ExpenseRow } from '../hooks/useExpenseLedger'
import { useSupplierMapping } from '../hooks/useSupplierMapping'
import { supabase } from '../lib/supabase'
import { formatTHB } from '../components/finance/helpers'
import { KpiCard } from '../components/finance/KpiCard'
import { MonthlyChart } from '../components/finance/MonthlyChart'
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

  const { applyMappings, saveMapping, lookupMappings, updateConversion } = useSupplierMapping()

  /* Receipt URLs injected from MagicDropzone */
  const [receiptUrls, setReceiptUrls] = useState<ReceiptUrls>({})

  /* Lightbox state */
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  /* Edit modal state */
  const [editingRow, setEditingRow] = useState<ExpenseRow | null>(null)

  /* Quick text from SmartTextInput — passed to ExpenseForm */
  const [quickText, setQuickText] = useState<string | undefined>(undefined)

  /* ── Phase 4.14: Async job tracking ── */
  const [pendingJobId, setPendingJobId] = useState<string | null>(null)
  const [pendingImageUrls, setPendingImageUrls] = useState<string[]>([])
  const [jobError, setJobError] = useState<string | null>(null)

  /* ── Staging Area state (Phase 4.4 + 4.6: added imageUrls) ── */
  const [stagingData, setStagingData] = useState<{
    receipt: ParsedReceipt
    urls: ReceiptUrls
    imageUrls: string[]
  } | null>(null)

  /* Lazy-loaded nomenclature for staging area food item mapping */
  const [nomenclature, setNomenclature] = useState<
    { id: string; name: string; product_code: string }[]
  >([])

  // Fetch RAW nomenclature only when staging area opens (CLAUDE.md rule #3: separate query)
  useEffect(() => {
    if (!stagingData) return
    supabase
      .from('nomenclature')
      .select('id, name, product_code')
      .ilike('product_code', 'RAW-%')
      .order('name')
      .then(({ data }) => setNomenclature(data ?? []))
  }, [stagingData])

  // Phase 4.14: Realtime subscription — listen for receipt_jobs completion
  useEffect(() => {
    if (!pendingJobId) return

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
          if (job.status === 'completed' && job.result) {
            handleAiResult(job.result, pendingImageUrls)
            setPendingJobId(null)
            setPendingImageUrls([])
            setJobError(null)
          } else if (job.status === 'failed') {
            setJobError(job.error || 'AI parsing failed')
            setPendingJobId(null)
            setPendingImageUrls([])
          }
        },
      )
      .subscribe()

    // Fallback poll: check once after 90s in case Realtime missed the event
    const fallbackTimer = setTimeout(async () => {
      const { data } = await supabase
        .from('receipt_jobs')
        .select('*')
        .eq('id', pendingJobId)
        .single()

      if (data?.status === 'completed' && data.result) {
        handleAiResult(data.result as ParsedReceipt, data.image_urls as string[])
        setPendingJobId(null)
        setPendingImageUrls([])
        setJobError(null)
      } else if (data?.status === 'failed') {
        setJobError(data.error || 'AI parsing failed (timeout)')
        setPendingJobId(null)
        setPendingImageUrls([])
      }
    }, 90_000)

    return () => {
      supabase.removeChannel(channel)
      clearTimeout(fallbackTimer)
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
      receipt.food_items = mapped
        .filter((li) => li.category === 'food')
        .map((li) => ({
          name: li.translated_name || li.original_name || '',
          quantity: li.quantity || 0,
          unit: li.unit || 'pcs',
          unit_price: li.unit_price || 0,
          total_price: li.total_price || 0,
          nomenclature_id: li.nomenclature_id ?? undefined,
          supplier_sku: li.supplier_sku ?? null,
          original_name: li.original_name ?? null,
          brand: li.brand ?? undefined,
          package_weight: li.package_weight ?? undefined,
        } as FoodItem))

      receipt.capex_items = mapped
        .filter((li) => li.category === 'capex')
        .map((li) => ({
          name: li.translated_name || li.original_name || '',
          quantity: li.quantity || 0,
          unit_price: li.unit_price || 0,
          total_price: li.total_price || 0,
        }))

      receipt.opex_items = mapped
        .filter((li) => li.category === 'opex' || li.category === 'uncategorized')
        .map((li) => ({
          description: li.translated_name || li.original_name || '',
          quantity: li.quantity || 0,
          unit: li.unit || 'pcs',
          unit_price: li.unit_price || 0,
          total_price: li.total_price || 0,
        }))
    }

    setStagingData({ receipt, urls, imageUrls })
  }

  /* ── Save mapping callback — passed to StagingArea ── */
  const handleSaveMapping = async (params: {
    supplierId: string
    supplierSku: string | null
    originalName: string
    nomenclatureId: string
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
      .select('id, name, product_code')
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
          value={formatTHB(monthTotal)}
          delta={monthDelta}
          isLoading={isLoading}
        />
        <KpiCard
          label="All-time Total"
          value={formatTHB(grandTotal)}
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

      {/* Main grid: Form OR StagingArea (left) | Chart + History (right) */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]">
        <div className="space-y-6">
          {stagingData ? (
            <StagingArea
              receipt={stagingData.receipt}
              receiptUrls={stagingData.urls}
              imageUrls={stagingData.imageUrls}
              nomenclatureList={nomenclature}
              suppliersList={suppliers}
              categories={categories}
              subCategories={subCategories}
              onApprove={handleApprove}
              onCancel={() => setStagingData(null)}
              onSaveMapping={handleSaveMapping}
              onCreateNomenclature={handleCreateNomenclature}
              onLookupMappings={lookupMappings}
              onUpdateConversion={updateConversion}
            />
          ) : (
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
          <MonthlyChart
            summaries={monthlySummaries}
            isLoading={isLoading}
            error={error}
          />
          <ExpenseHistory
            rows={rows}
            categories={categories}
            suppliers={suppliers}
            isLoading={isLoading}
            error={error}
            onRefetch={refetch}
            onReceiptClick={setLightboxUrl}
            onEditClick={setEditingRow}
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
