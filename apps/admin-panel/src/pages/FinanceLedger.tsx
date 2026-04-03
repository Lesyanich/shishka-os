import { useState } from 'react'
import { useFinance } from '../contexts/FinanceContext'
import { formatTHBFull } from '../components/finance/helpers'
import { KpiCard } from '../components/finance/KpiCard'
import { ExpenseHistory } from '../components/finance/ExpenseHistory'
import { ExpenseEditModal } from '../components/finance/ExpenseEditModal'
import { ReceiptGallery } from '../components/finance/ReceiptGallery'
import type { ExpenseRow } from '../hooks/useExpenseLedger'

/* ═══════════════════════════════════════════════════════════
   FinanceLedger — Full-width Expense Ledger tab
   KPI strip + filter/sort table (no form, no chart)
   ═══════════════════════════════════════════════════════════ */

export function FinanceLedger() {
  const {
    rows,
    categories,
    subCategories,
    suppliers,
    grandTotal,
    isLoading,
    error,
    refetch,
    updateExpense,
  } = useFinance()

  const [galleryPages, setGalleryPages] = useState<string[]>([])
  const [galleryStart, setGalleryStart] = useState(0)
  const [editingRow, setEditingRow] = useState<ExpenseRow | null>(null)

  /** Open receipt gallery for a given row (receipt_pages or legacy URL fields) */
  const openGallery = (row: ExpenseRow, startIdx = 0) => {
    const pages = row.receipt_pages.length
      ? row.receipt_pages
      : [row.receipt_supplier_url, row.receipt_bank_url, row.tax_invoice_url].filter(
          (u): u is string => !!u,
        )
    if (pages.length) {
      setGalleryPages(pages)
      setGalleryStart(startIdx)
    }
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
    <div className="space-y-4">
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

      {/* Full-width Expense Ledger table */}
      <ExpenseHistory
        rows={rows}
        categories={categories}
        subCategories={subCategories}
        suppliers={suppliers}
        isLoading={isLoading}
        error={error}
        onRefetch={refetch}
        onReceiptClick={(url) => {
          // Find the row that contains this URL and open gallery
          const row = rows.find(
            (r) =>
              r.receipt_pages.includes(url) ||
              r.receipt_supplier_url === url ||
              r.receipt_bank_url === url ||
              r.tax_invoice_url === url,
          )
          if (row) {
            const pages = row.receipt_pages.length
              ? row.receipt_pages
              : [row.receipt_supplier_url, row.receipt_bank_url, row.tax_invoice_url].filter(
                  (u): u is string => !!u,
                )
            const idx = pages.indexOf(url)
            openGallery(row, idx >= 0 ? idx : 0)
          } else {
            // Fallback: single URL
            setGalleryPages([url])
            setGalleryStart(0)
          }
        }}
        onEditClick={setEditingRow}
        onUpdateExpense={updateExpense}
      />

      {/* Edit modal */}
      <ExpenseEditModal
        row={editingRow}
        categories={categories}
        subCategories={subCategories}
        suppliers={suppliers}
        onSave={updateExpense}
        onClose={() => setEditingRow(null)}
        onRefetch={refetch}
      />

      {/* Receipt Gallery */}
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

export default FinanceLedger
