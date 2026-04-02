import * as XLSX from 'xlsx'
import type { ExpenseRow } from '../../hooks/useExpenseLedger'

/** DD.MM.YYYY */
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** Round to 2 decimals */
function n2(v: number): number {
  return Math.round(v * 100) / 100
}

const COLUMNS = [
  'Date',
  'Flow Type',
  'Category',
  'Sub-Category',
  'Supplier',
  'Details',
  'Amount (THB)',
  'Currency',
  'Original Amount',
  'Payment Method',
  'Paid By',
  'Status',
  'Invoice #',
  'Has Tax Invoice',
  'VAT Amount',
  'Discount',
  'Delivery Fee',
] as const

export function exportExpenses(rows: ExpenseRow[]): void {
  const data = rows.map((r) => [
    fmtDate(r.transaction_date),
    r.flow_type,
    r.category_name ?? '',
    r.sub_category_name ?? '',
    r.supplier_name ?? '',
    r.details,
    n2(r.amount_thb),
    r.currency,
    n2(r.amount_original),
    r.payment_method,
    r.paid_by,
    r.status,
    r.invoice_number ?? '',
    r.has_tax_invoice ? 'Yes' : 'No',
    n2(r.vat_amount),
    n2(r.discount_total),
    n2(r.delivery_fee),
  ])

  const ws = XLSX.utils.aoa_to_sheet([
    [...COLUMNS],
    ...data,
  ])

  /* ── Auto-width ── */
  const colWidths: number[] = COLUMNS.map((h) => h.length)
  for (const row of data) {
    row.forEach((cell, i) => {
      const len = String(cell).length
      if (len > colWidths[i]) colWidths[i] = len
    })
  }
  ws['!cols'] = colWidths.map((w) => ({ wch: Math.min(w + 2, 40) }))

  /* ── Header style (slate-800 fill, white text) ── */
  const headerFill = { fgColor: { rgb: '1E293B' } }
  const headerFont = { color: { rgb: 'FFFFFF' }, bold: true }
  for (let c = 0; c < COLUMNS.length; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[ref]) continue
    ws[ref].s = {
      fill: headerFill,
      font: headerFont,
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Expenses')

  const today = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `shishka_expenses_${today}.xlsx`)
}
