import { useState } from 'react'
import { useExpenseLedger } from '../hooks/useExpenseLedger'
import { formatTHB } from '../components/finance/helpers'
import { KpiCard } from '../components/finance/KpiCard'
import { MonthlyChart } from '../components/finance/MonthlyChart'
import { ExpenseForm } from '../components/finance/ExpenseForm'
import { ExpenseHistory } from '../components/finance/ExpenseHistory'
import { MagicDropzone } from '../components/finance/MagicDropzone'
import { ReceiptLightbox } from '../components/finance/ReceiptLightbox'

/* ═══════════════════════════════════════════════════════════════════
   FinanceManager — Thin Page Orchestrator
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
  } = useExpenseLedger()

  /* Receipt URLs injected from MagicDropzone */
  const [receiptUrls, setReceiptUrls] = useState<{
    supplier?: string
    bank?: string
    tax?: string
  }>({})

  /* Lightbox state */
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const handleCreated = () => {
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

      {/* Magic Dropzone — full width */}
      <MagicDropzone onUrlsReady={setReceiptUrls} />

      {/* Main grid: Form (left) | Chart + History (right) */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]">
        <div className="space-y-6">
          <ExpenseForm
            categories={categories}
            subCategories={subCategories}
            suppliers={suppliers}
            receiptUrls={receiptUrls}
            onCreated={handleCreated}
          />
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
          />
        </div>
      </div>

      {/* Receipt Lightbox modal */}
      <ReceiptLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  )
}
