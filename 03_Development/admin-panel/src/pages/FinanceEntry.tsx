import { useEffect, useState } from 'react'
import { useFinance } from '../contexts/FinanceContext'
import { useSupplierMapping } from '../hooks/useSupplierMapping'
import { supabase } from '../lib/supabase'
import { ExpenseForm } from '../components/finance/ExpenseForm'
import { MagicDropzone } from '../components/finance/MagicDropzone'
import { SmartTextInput } from '../components/finance/SmartTextInput'
import { StagingArea } from '../components/finance/StagingArea'
import { RecentEntries } from '../components/finance/RecentEntries'
import { ReceiptGallery } from '../components/finance/ReceiptGallery'
import type { ParsedReceipt, ReceiptUrls, ApprovePayload, FoodItem, ReceiptJob } from '../types/receipt'
import type { ExpenseRow } from '../hooks/useExpenseLedger'

/* ═══════════════════════════════════════════════════════════
   FinanceEntry — Receipt upload + manual expense entry
   Moved from FinanceManager: MagicDropzone, StagingArea, ExpenseForm
   ═══════════════════════════════════════════════════════════ */

/** Phase 6.6c: Sanitize OCR-dirty numbers (e.g., "225,!" → 225) */
function sanitizeNum(v: unknown): number {
  if (v == null || v === '') return 0
  const s = String(v).replace(/[^\d.]/g, '')
  const parts = s.split('.')
  const clean = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : s
  const n = Number(clean)
  return isNaN(n) ? 0 : n
}

function sanitizeSigned(v: unknown): number {
  if (v == null || v === '') return 0
  const neg = String(v).includes('-')
  const n = sanitizeNum(v)
  return neg ? -Math.abs(n) : n
}

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
  if (_activeResolveJobId === jobId) return
  _activeResolveJobId = jobId

  try {
    const { data: job, error: fetchErr } = await supabase
      .from('receipt_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (fetchErr) { _activeResolveJobId = null; return }

    if (!job || job.status !== 'completed' || !job.result) {
      if (job?.status === 'failed') {
        sessionStorage.removeItem('pendingReceiptJobId')
        window.dispatchEvent(new CustomEvent('receipt-job-failed', { detail: job.error || 'AI parsing failed' }))
      }
      _activeResolveJobId = null
      return
    }

    const result = job.result as ParsedReceipt
    const imageUrls = (job.image_urls as string[]) || []

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
          barcode: li.barcode ?? li.supplier_sku ?? null,
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

    const stagingPayload = { receipt: result, urls, imageUrls }
    sessionStorage.setItem('stagingData', JSON.stringify(stagingPayload))
    sessionStorage.removeItem('pendingReceiptJobId')
    sessionStorage.removeItem('pendingReceiptImageUrls')
    window.dispatchEvent(new Event('receipt-job-resolved'))
  } catch (err) {
    console.error('[ReceiptJob] Module-level resolve error:', err)
  } finally {
    _activeResolveJobId = null
  }
}

export function FinanceEntry() {
  const { rows, categories, subCategories, suppliers, refetch } = useFinance()
  const { applyMappings, saveMapping, lookupMappings, updateConversion, lookupByBarcodes } = useSupplierMapping()

  const [receiptUrls, setReceiptUrls] = useState<ReceiptUrls>({})
  const [quickText, setQuickText] = useState<string | undefined>(undefined)

  // Gallery for RecentEntries receipt clicks
  const [galleryPages, setGalleryPages] = useState<string[]>([])
  const [galleryStart, setGalleryStart] = useState(0)

  const openGalleryForRow = (row: ExpenseRow) => {
    const pages = row.receipt_pages.length
      ? row.receipt_pages
      : [row.receipt_supplier_url, row.receipt_bank_url, row.tax_invoice_url].filter(
          (u): u is string => !!u,
        )
    if (pages.length) {
      setGalleryPages(pages)
      setGalleryStart(0)
    }
  }

  /* Async job tracking */
  const [pendingJobId, _setPendingJobId] = useState<string | null>(
    () => sessionStorage.getItem('pendingReceiptJobId'),
  )
  const setPendingJobId = (id: string | null) => {
    if (id) sessionStorage.setItem('pendingReceiptJobId', id)
    else sessionStorage.removeItem('pendingReceiptJobId')
    _setPendingJobId(id)
  }
  const [, setPendingImageUrls] = useState<string[]>(() => {
    const stored = sessionStorage.getItem('pendingReceiptImageUrls')
    return stored ? JSON.parse(stored) : []
  })
  const [jobError, setJobError] = useState<string | null>(null)

  /* Staging Area state */
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
    if (data) sessionStorage.setItem('stagingData', JSON.stringify(data))
    else sessionStorage.removeItem('stagingData')
    _setStagingData(data)
  }

  /* Nomenclature + product categories for staging */
  const [nomenclature, setNomenclature] = useState<
    { id: string; name: string; product_code: string; category_id: string | null }[]
  >([])
  const [productCategories, setProductCategories] = useState<
    { id: string; code: string; name: string; parent_id: string | null; level: number }[]
  >([])

  useEffect(() => {
    if (!stagingData) return
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

  // Listen for module-level resolver completing
  useEffect(() => {
    const onResolved = () => {
      const stored = sessionStorage.getItem('stagingData')
      if (stored) {
        try { _setStagingData(JSON.parse(stored)); _setPendingJobId(null) } catch { /* */ }
      }
    }
    const onFailed = (e: Event) => {
      setJobError((e as CustomEvent).detail || 'AI parsing failed')
      _setPendingJobId(null)
    }
    window.addEventListener('receipt-job-resolved', onResolved)
    window.addEventListener('receipt-job-failed', onFailed)
    return () => {
      window.removeEventListener('receipt-job-resolved', onResolved)
      window.removeEventListener('receipt-job-failed', onFailed)
    }
  }, [])

  // Realtime subscription + fallback poll
  useEffect(() => {
    if (!pendingJobId) return

    resolveJobToSessionStorage(pendingJobId)

    const onResolved = () => {
      const stored = sessionStorage.getItem('stagingData')
      if (stored) {
        try { _setStagingData(JSON.parse(stored)) } catch { /* */ }
        _setPendingJobId(null)
        setPendingImageUrls([])
        setJobError(null)
      }
    }
    window.addEventListener('receipt-job-resolved', onResolved)

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
          if (job.status === 'completed') resolveJobToSessionStorage(pendingJobId!)
          else if (job.status === 'failed') {
            setJobError(job.error || 'AI parsing failed')
            setPendingJobId(null)
          }
        },
      )
      .subscribe()

    const fallbackTimer = setInterval(() => {
      if (!sessionStorage.getItem('pendingReceiptJobId')) { clearInterval(fallbackTimer); return }
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

  const handleAiResult = async (receipt: ParsedReceipt, imageUrls: string[]) => {
    const urls: ReceiptUrls = {}
    const docs = receipt.documents
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
    setReceiptUrls(urls)

    if (receipt.line_items && receipt.line_items.length > 0) {
      const supplierId = fuzzyMatchSupplier(receipt.supplier_name, suppliers)
      const mapped = supplierId
        ? await applyMappings(supplierId, receipt.line_items)
        : receipt.line_items

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
          barcode: li.barcode ?? li.supplier_sku ?? null,
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

  const handleSaveMapping = async (params: {
    supplierId: string
    supplierSku: string | null
    originalName: string
    nomenclatureId: string
    purchaseUnit?: string
    conversionFactor?: number
    baseUnit?: string
  }) => { await saveMapping(params) }

  const handleCreateNomenclature = async (params: { name: string; baseUnit: string }): Promise<string> => {
    const slug = params.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').substring(0, 30)
    const productCode = `RAW-${slug}`
    const { data: existing } = await supabase
      .from('nomenclature')
      .select('id')
      .eq('product_code', productCode)
      .maybeSingle()
    if (existing) return existing.id

    const { data, error: insertErr } = await supabase
      .from('nomenclature')
      .insert({ product_code: productCode, name: params.name, type: 'good', base_unit: params.baseUnit })
      .select('id')
      .single()
    if (insertErr) throw insertErr

    const { data: freshNom } = await supabase
      .from('nomenclature')
      .select('id, name, product_code, category_id')
      .ilike('product_code', 'RAW-%')
      .order('name')
    if (freshNom) setNomenclature(freshNom)
    return data.id
  }

  const handleApprove = async (payload: ApprovePayload) => {
    const { data, error: rpcErr } = await supabase.rpc('fn_approve_receipt', { p_payload: payload })
    if (rpcErr) throw rpcErr
    if (data && !data.ok) throw new Error(data.error || 'RPC returned error')
    setStagingData(null)
    setReceiptUrls({})
    refetch()
  }

  return (
    <div className="space-y-6">
      {/* Magic Dropzone — full width */}
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

      {/* Job error toast */}
      {jobError && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 shadow-sm">
          <div className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
          <p className="text-xs leading-relaxed text-rose-300/90">AI parsing failed: {jobError}</p>
          <button type="button" onClick={() => setJobError(null)} className="ml-auto text-xs text-slate-500 hover:text-slate-300">
            Dismiss
          </button>
        </div>
      )}

      {/* Staging Area — full-width when active */}
      {stagingData && (
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
      )}

      {/* Two-column: SmartText + Form | Recent Entries */}
      {!stagingData && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Left: SmartText + ExpenseForm */}
          <div className="space-y-4">
            <SmartTextInput onSubmitText={setQuickText} />
            <ExpenseForm
              categories={categories}
              subCategories={subCategories}
              suppliers={suppliers}
              receiptUrls={receiptUrls}
              quickText={quickText}
              onCreated={handleCreated}
            />
          </div>

          {/* Right: Recent entries sidebar */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50">
            <RecentEntries
              rows={rows}
              limit={7}
              onReceiptClick={openGalleryForRow}
            />
          </div>
        </div>
      )}

      {/* Receipt Gallery overlay */}
      {galleryPages.length > 0 && (
        <ReceiptGallery
          pages={galleryPages}
          startIndex={galleryStart}
          onClose={() => setGalleryPages([])}
        />
      )}
    </div>
  )
}

export default FinanceEntry
