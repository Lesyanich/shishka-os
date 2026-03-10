import { useEffect, useState } from 'react'
import { useExpenseLedger } from '../hooks/useExpenseLedger'
import type { ExpenseRow } from '../hooks/useExpenseLedger'
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
import type { ParsedReceipt, ReceiptUrls, ApprovePayload } from '../types/receipt'

/* ═══════════════════════════════════════════════════════════════════
   FinanceManager — Thin Page Orchestrator
   State machine: idle → analyzing → staging → (approve|cancel) → idle
   ═══════════════════════════════════════════════════════════════════ */

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

  /* Receipt URLs injected from MagicDropzone */
  const [receiptUrls, setReceiptUrls] = useState<ReceiptUrls>({})

  /* Lightbox state */
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  /* Edit modal state */
  const [editingRow, setEditingRow] = useState<ExpenseRow | null>(null)

  /* Quick text from SmartTextInput — passed to ExpenseForm */
  const [quickText, setQuickText] = useState<string | undefined>(undefined)

  /* ── Staging Area state (Phase 4.4) ── */
  const [stagingData, setStagingData] = useState<{
    receipt: ParsedReceipt
    urls: ReceiptUrls
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

  const handleCreated = () => {
    setReceiptUrls({})
    setQuickText(undefined)
    refetch()
  }

  /* ── AI result handler — transitions to staging ── */
  const handleAiResult = (receipt: ParsedReceipt, urls: ReceiptUrls) => {
    setStagingData({ receipt, urls })
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

      {/* Magic Dropzone — full width */}
      <MagicDropzone onUrlsReady={setReceiptUrls} onAiResult={handleAiResult} />

      {/* Main grid: Form OR StagingArea (left) | Chart + History (right) */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]">
        <div className="space-y-6">
          {stagingData ? (
            <StagingArea
              receipt={stagingData.receipt}
              receiptUrls={stagingData.urls}
              nomenclatureList={nomenclature}
              suppliersList={suppliers}
              categories={categories}
              subCategories={subCategories}
              onApprove={handleApprove}
              onCancel={() => setStagingData(null)}
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
