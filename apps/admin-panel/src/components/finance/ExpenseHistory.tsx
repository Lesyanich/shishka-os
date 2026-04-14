import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Pencil,
  Receipt,
  Upload,
  Save,
  X,
} from 'lucide-react'
import type { ExpenseRow, ExpenseUpdatePayload, FinCategory, FinSubCategory, Supplier } from '../../hooks/useExpenseLedger'
import { ExpenseFilterPanel, EMPTY_FILTERS } from './ExpenseFilterPanel'
import type { ExpenseFilters } from './ExpenseFilterPanel'
import { SpokeDetail } from './SpokeDetail'
import { exportExpenses } from './exportExpenses'
import { PAYMENT_METHODS } from './helpers'
import { supabase } from '../../lib/supabase'

/* ═══════════════════════════════════════════════════════════════
   ExpenseHistory — Phase 4.5: Analytics-Grade Expense Ledger
   Features: Sort (Date/Amount/Supplier), Composable Filters,
   Expandable Spoke Rows, Sticky Subtotal Footer
   ═══════════════════════════════════════════════════════════════ */

export interface ExpenseHistoryProps {
  rows: ExpenseRow[]
  categories: FinCategory[]
  subCategories: FinSubCategory[]
  suppliers: Supplier[]
  isLoading: boolean
  error: string | null
  onRefetch: () => void
  onReceiptClick: (url: string) => void
  onEditClick: (row: ExpenseRow) => void
  onUpdateExpense: (id: string, payload: ExpenseUpdatePayload) => Promise<string | null>
}

/* ── Sort types ── */
type SortField = 'transaction_date' | 'amount_thb' | 'supplier_name'
type SortDir = 'asc' | 'desc'

export function ExpenseHistory({
  rows,
  categories,
  subCategories,
  suppliers,
  isLoading,
  error,
  onRefetch,
  onReceiptClick,
  onEditClick,
  onUpdateExpense,
}: ExpenseHistoryProps) {
  /* ── Filter state ── */
  const [filters, setFilters] = useState<ExpenseFilters>(EMPTY_FILTERS)

  /* ── Sort state ── */
  const [sortField, setSortField] = useState<SortField>('transaction_date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  /* ── Expand state (single-expand) ── */
  const [expandedId, setExpandedId] = useState<string | null>(null)

  /* ── Active filter count ── */
  const activeCount = useMemo(() => {
    let n = 0
    if (filters.searchText) n++
    if (filters.dateFrom) n++
    if (filters.dateTo) n++
    if (filters.categoryCode !== null) n++
    if (filters.supplierId !== null) n++
    if (filters.flowType !== null) n++
    return n
  }, [filters])

  /* ── Filtered rows (AND logic) ── */
  const filteredRows = useMemo(() => {
    const q = filters.searchText.toLowerCase().trim()
    return rows.filter((r) => {
      // Text search — matches supplier_name, details, comments, category_name
      if (q) {
        const haystack = [
          r.supplier_name,
          r.details,
          r.comments,
          r.category_name,
          r.sub_category_name,
          r.invoice_number,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (filters.dateFrom && r.transaction_date < filters.dateFrom) return false
      if (filters.dateTo && r.transaction_date > filters.dateTo) return false
      if (filters.categoryCode !== null && r.category_code !== filters.categoryCode) return false
      if (filters.supplierId !== null && r.supplier_id !== filters.supplierId) return false
      if (filters.flowType !== null && r.flow_type !== filters.flowType) return false
      return true
    })
  }, [rows, filters])

  /* ── Sorted rows ── */
  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'transaction_date':
          cmp = a.transaction_date.localeCompare(b.transaction_date)
          break
        case 'amount_thb':
          cmp = a.amount_thb - b.amount_thb
          break
        case 'supplier_name':
          cmp = (a.supplier_name ?? '').localeCompare(b.supplier_name ?? '')
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [filteredRows, sortField, sortDir])

  /* ── Filtered total ── */
  const filteredTotal = useMemo(
    () => filteredRows.reduce((s, r) => s + r.amount_thb, 0),
    [filteredRows],
  )
  const isFiltered = activeCount > 0

  /* ── Sort handler ── */
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'amount_thb' ? 'desc' : 'asc')
    }
  }

  /* ── Sort icon helper ── */
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-slate-600" />
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-indigo-400" />
    ) : (
      <ArrowDown className="h-3 w-3 text-indigo-400" />
    )
  }

  /* ── Error state ── */
  if (error) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="text-xs text-rose-400">{error}</div>
      </section>
    )
  }

  /* ── Loading state ── */
  if (isLoading) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex items-center justify-center py-8 text-xs text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading expenses...
        </div>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 shadow-sm">
      {/* ── Header ── */}
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">Expense Ledger</h2>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
            {isFiltered ? (
              <>
                <span className="font-semibold text-indigo-400">{filteredRows.length}</span>
                <span className="text-slate-600"> / </span>
                {rows.length}
              </>
            ) : (
              rows.length
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportExpenses(sortedRows)}
            className="inline-flex items-center gap-1 rounded-md bg-slate-700 px-2.5 py-1 text-[10px] font-medium text-slate-300 transition-colors hover:bg-slate-600"
          >
            <Download className="h-4 w-4" />
            Export XLSX
          </button>
          <button
            type="button"
            onClick={onRefetch}
            className="text-[10px] text-slate-500 hover:text-slate-300"
          >
            Refresh
          </button>
        </div>
      </header>

      {/* ── Filter Panel ── */}
      <div className="border-b border-slate-800/60 px-4 py-3">
        <ExpenseFilterPanel
          categories={categories}
          suppliers={suppliers}
          filters={filters}
          onChange={setFilters}
          activeCount={activeCount}
        />
      </div>

      {/* ── Table or empty state ── */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-xs text-slate-500">
          No expenses yet. Add one using the form.
        </div>
      ) : sortedRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-xs text-slate-500">
          No expenses match these filters.
        </div>
      ) : (
        <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-900 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-8 px-2 py-2" />
                <th className="w-[110px] px-3 py-2">
                  <button type="button" onClick={() => toggleSort('transaction_date')} className="inline-flex items-center gap-1 transition-colors hover:text-slate-300">
                    Date <SortIcon field="transaction_date" />
                  </button>
                </th>
                <th className="w-[120px] px-2 py-2">Category</th>
                <th className="w-[130px] px-2 py-2">
                  <button type="button" onClick={() => toggleSort('supplier_name')} className="inline-flex items-center gap-1 transition-colors hover:text-slate-300">
                    Supplier <SortIcon field="supplier_name" />
                  </button>
                </th>
                <th className="max-w-[220px] px-2 py-2">Details</th>
                <th className="w-[90px] px-2 py-2">Invoice #</th>
                <th className="w-[100px] px-2 py-2 text-right">
                  <button type="button" onClick={() => toggleSort('amount_thb')} className="inline-flex items-center gap-1 transition-colors hover:text-slate-300">
                    Amount <SortIcon field="amount_thb" />
                  </button>
                </th>
                <th className="w-[65px] px-2 py-2">Payment</th>
                <th className="w-[55px] px-2 py-2">Paid by</th>
                <th className="w-8 px-2 py-2 text-center" title="Tax Invoice">Tax</th>
                <th className="w-[60px] px-2 py-2 text-center">Docs</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/50">
              {sortedRows.map((r) => {
                const isExpanded = expandedId === r.id
                return (
                  <TableRowWithSpoke
                    key={r.id}
                    row={r}
                    isExpanded={isExpanded}
                    onToggleExpand={() =>
                      setExpandedId(isExpanded ? null : r.id)
                    }
                    onReceiptClick={onReceiptClick}
                    onEditClick={onEditClick}
                    categories={categories}
                    subCategories={subCategories}
                    suppliers={suppliers}
                    onUpdateExpense={onUpdateExpense}
                    onRefetch={onRefetch}
                  />
                )
              })}
            </tbody>

            {/* ── Sticky subtotal footer ── */}
            <tfoot className="sticky bottom-0 z-10 border-t border-slate-700/60 bg-slate-900/95 backdrop-blur-sm">
              <tr>
                <td colSpan={6} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium tracking-wide text-slate-500 uppercase">
                      {isFiltered ? 'Filtered Total' : 'Total'}
                    </span>
                    {isFiltered && (
                      <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[9px] font-semibold text-indigo-400 ring-1 ring-indigo-500/20">
                        {filteredRows.length} of {rows.length}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right">
                  <span className="font-mono text-sm font-bold tracking-tight text-slate-100">
                    {'\u0E3F'}
                    {Math.round(filteredTotal).toLocaleString()}
                  </span>
                </td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}

/* ═════════════════════════════════════════════════════════════
   Sub-component: TableRowWithSpoke
   Renders the main data row + optional expanded panel
   with inline editing, file management & spoke detail
   ═════════════════════════════════════════════════════════════ */

const FLOW_BADGE: Record<string, string> = {
  OpEx: 'bg-emerald-500/15 text-emerald-400',
  CapEx: 'bg-amber-500/15 text-amber-400',
  COGS: 'bg-blue-900/30 text-blue-400',
}

function TableRowWithSpoke({
  row: r,
  isExpanded,
  onToggleExpand,
  onReceiptClick,
  onEditClick,
  categories,
  subCategories,
  suppliers,
  onUpdateExpense,
  onRefetch,
}: {
  row: ExpenseRow
  isExpanded: boolean
  onToggleExpand: () => void
  onReceiptClick: (url: string) => void
  onEditClick: (row: ExpenseRow) => void
  categories: FinCategory[]
  subCategories: FinSubCategory[]
  suppliers: Supplier[]
  onUpdateExpense: (id: string, payload: ExpenseUpdatePayload) => Promise<string | null>
  onRefetch: () => void
}) {
  // Use receipt_pages if available, fallback to legacy 3 URL fields
  const pages = r.receipt_pages.length
    ? r.receipt_pages
    : [r.receipt_supplier_url, r.receipt_bank_url, r.tax_invoice_url].filter((u): u is string => !!u)
  const docCount = pages.length

  return (
    <>
      <tr className="group hover:bg-slate-800/30">
        {/* Chevron */}
        <td className="w-8 px-2 py-2.5 text-center">
          <button type="button" onClick={onToggleExpand} className="rounded-md p-0.5 text-slate-600 transition-colors hover:bg-slate-700/50 hover:text-slate-400">
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-indigo-400" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </td>

        {/* Date + flow badge */}
        <td className="px-3 py-2.5">
          <div className="text-slate-300">{r.transaction_date}</div>
          <span className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-medium ${FLOW_BADGE[r.flow_type] || FLOW_BADGE.COGS}`}>
            {r.flow_type}
          </span>
        </td>

        {/* Category */}
        <td className="px-2 py-2.5">
          <div className="text-slate-300">{r.category_name ?? '\u2014'}</div>
          {r.sub_category_name && <div className="text-[10px] text-slate-500">{r.sub_category_name}</div>}
        </td>

        {/* Supplier */}
        <td className="px-2 py-2.5">
          <div className="font-medium text-slate-200">{r.supplier_name ?? '\u2014'}</div>
          {r.status !== 'paid' && (
            <span className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] ${r.status === 'pending' ? 'bg-amber-500/15 text-amber-300' : 'bg-rose-500/15 text-rose-300'}`}>
              {r.status}
            </span>
          )}
        </td>

        {/* Details (constrained) */}
        <td className="max-w-[220px] px-2 py-2.5">
          <div className="truncate text-slate-300">{r.details || '\u2014'}</div>
          {r.comments && <div className="truncate text-[10px] text-slate-500">{r.comments}</div>}
        </td>

        {/* Invoice # */}
        <td className="px-2 py-2.5">
          <span className="font-mono text-[10px] text-slate-400">{r.invoice_number || '\u2014'}</span>
        </td>

        {/* Amount */}
        <td className="px-2 py-2.5 text-right">
          <div className="font-semibold text-slate-100">{'\u0E3F'}{Math.round(r.amount_thb).toLocaleString()}</div>
          {r.currency !== 'THB' && <div className="text-[10px] text-slate-500">{Math.round(r.amount_original).toLocaleString()} {r.currency}</div>}
        </td>

        {/* Payment */}
        <td className="px-2 py-2.5">
          <span className="text-[10px] text-slate-400 capitalize">{r.payment_method || '\u2014'}</span>
        </td>

        {/* Paid by */}
        <td className="px-2 py-2.5">
          <span className="text-[10px] text-slate-400">{r.paid_by || '\u2014'}</span>
        </td>

        {/* Tax invoice indicator */}
        <td className="px-2 py-2.5 text-center">
          {r.has_tax_invoice ? (
            <Check className="mx-auto h-3.5 w-3.5 text-amber-400" />
          ) : (
            <span className="text-[10px] text-slate-700">\u2014</span>
          )}
        </td>

        {/* Docs */}
        <td className="px-2 py-2.5">
          <div className="flex items-center justify-center gap-1">
            {docCount > 0 ? (
              <button type="button" onClick={() => onReceiptClick(pages[0])} title={`${docCount} document(s)`} className="relative hover:opacity-70">
                <Receipt className="h-3.5 w-3.5 text-emerald-400" />
                {docCount > 1 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-indigo-500 text-[7px] font-bold text-white">{docCount}</span>
                )}
              </button>
            ) : (
              <span className="text-[10px] text-slate-600">{'\u2014'}</span>
            )}
          </div>
        </td>

        {/* Edit */}
        <td className="px-2 py-2.5 text-center">
          <button type="button" onClick={() => onEditClick(r)} className="rounded-md p-1 text-slate-500 opacity-0 transition hover:bg-slate-700 hover:text-slate-300 group-hover:opacity-100" title="Edit expense">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </td>
      </tr>

      {/* Expanded panel: Edit + Files + Spoke */}
      {isExpanded && (
        <tr>
          <td colSpan={12} className="bg-slate-950/40 p-0">
            <ExpandedExpensePanel
              row={r}
              categories={categories}
              subCategories={subCategories}
              suppliers={suppliers}
              onUpdateExpense={onUpdateExpense}
              onReceiptClick={onReceiptClick}
              onRefetch={onRefetch}
            />
          </td>
        </tr>
      )}
    </>
  )
}

/* ═════════════════════════════════════════════════════════════
   Sub-component: ExpandedExpensePanel
   Inline editing + receipt management + spoke detail
   ═════════════════════════════════════════════════════════════ */

function ExpandedExpensePanel({
  row,
  categories: _categories,
  subCategories: _subCategories,
  suppliers: _suppliers,
  onUpdateExpense,
  onReceiptClick,
  onRefetch,
}: {
  row: ExpenseRow
  categories: FinCategory[]
  subCategories: FinSubCategory[]
  suppliers: Supplier[]
  onUpdateExpense: (id: string, payload: ExpenseUpdatePayload) => Promise<string | null>
  onReceiptClick: (url: string) => void
  onRefetch: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  // Edit form state
  const [details, setDetails] = useState(row.details)
  const [comments, setComments] = useState(row.comments ?? '')
  const [invoiceNumber, setInvoiceNumber] = useState(row.invoice_number ?? '')
  const [paymentMethod, setPaymentMethod] = useState(row.payment_method)
  const [status, setStatus] = useState(row.status)
  const [hasTaxInvoice, setHasTaxInvoice] = useState(row.has_tax_invoice)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const payload: ExpenseUpdatePayload = {}
      if (details !== row.details) payload.details = details
      if (comments !== (row.comments ?? '')) payload.comments = comments || null
      if (invoiceNumber !== (row.invoice_number ?? '')) payload.has_tax_invoice = hasTaxInvoice
      if (paymentMethod !== row.payment_method) payload.payment_method = paymentMethod
      if (status !== row.status) payload.status = status
      if (hasTaxInvoice !== row.has_tax_invoice) payload.has_tax_invoice = hasTaxInvoice
      if (invoiceNumber !== (row.invoice_number ?? '')) {
        // invoice_number is in the allowed update fields
        ;(payload as Record<string, unknown>).invoice_number = invoiceNumber || null
      }
      if (Object.keys(payload).length > 0) {
        await onUpdateExpense(row.id, payload)
      }
      setIsEditing(false)
    } catch {
      // error handled by parent
    } finally {
      setIsSaving(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, slot: 'receipt_supplier_url' | 'receipt_bank_url' | 'tax_invoice_url') => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    try {
      // Compress to WebP if image
      let uploadFile: File | Blob = file
      if (file.type.startsWith('image/')) {
        const bitmap = await createImageBitmap(file)
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(bitmap, 0, 0)
        uploadFile = await canvas.convertToBlob({ type: 'image/webp', quality: 0.7 })
      }

      const ts = Date.now()
      const ext = file.type.startsWith('image/') ? 'webp' : file.name.split('.').pop() || 'pdf'
      const path = `${ts}_${Math.random().toString(36).slice(2, 6)}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('receipts')
        .upload(path, uploadFile, { contentType: file.type.startsWith('image/') ? 'image/webp' : file.type })

      if (uploadErr) throw uploadErr

      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path)
      const publicUrl = urlData.publicUrl

      await onUpdateExpense(row.id, { [slot]: publicUrl } as ExpenseUpdatePayload)
      onRefetch()
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setIsUploading(false)
      e.target.value = ''
    }
  }

  const receipts = [
    { label: 'Supplier receipt', url: row.receipt_supplier_url, slot: 'receipt_supplier_url' as const, color: 'emerald' },
    { label: 'Bank slip', url: row.receipt_bank_url, slot: 'receipt_bank_url' as const, color: 'sky' },
    { label: 'Tax invoice', url: row.tax_invoice_url, slot: 'tax_invoice_url' as const, color: 'amber' },
  ]

  return (
    <div className="animate-expand space-y-3 px-4 py-4">
      {/* ── Metadata & Edit section ── */}
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium text-slate-400">Transaction Details</span>
          {!isEditing ? (
            <button type="button" onClick={() => setIsEditing(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition">
              <Pencil className="h-3 w-3" /> Edit
            </button>
          ) : (
            <div className="flex gap-1">
              <button type="button" onClick={handleSave} disabled={isSaving} className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-400 hover:bg-emerald-500/25 transition disabled:opacity-50">
                {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
              </button>
              <button type="button" onClick={() => setIsEditing(false)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-800 transition">
                <X className="h-3 w-3" /> Cancel
              </button>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <label className="text-[9px] uppercase tracking-wider text-slate-500">Details</label>
              <input value={details} onChange={(e) => setDetails(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-[9px] uppercase tracking-wider text-slate-500">Comments</label>
              <input value={comments} onChange={(e) => setComments(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-[9px] uppercase tracking-wider text-slate-500">Invoice #</label>
              <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-mono text-slate-200 focus:border-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-[9px] uppercase tracking-wider text-slate-500">Payment</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none">
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase tracking-wider text-slate-500">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none">
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="flex items-end gap-2 pb-1">
              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                <input type="checkbox" checked={hasTaxInvoice} onChange={(e) => setHasTaxInvoice(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-0" />
                Tax Invoice
              </label>
            </div>
          </div>
        ) : (
          <div className="grid gap-x-6 gap-y-1 text-[11px] sm:grid-cols-3">
            <div><span className="text-slate-500">Details:</span> <span className="text-slate-300">{row.details || '\u2014'}</span></div>
            <div><span className="text-slate-500">Comments:</span> <span className="text-slate-300">{row.comments || '\u2014'}</span></div>
            <div><span className="text-slate-500">Invoice #:</span> <span className="font-mono text-slate-300">{row.invoice_number || '\u2014'}</span></div>
            <div><span className="text-slate-500">Payment:</span> <span className="text-slate-300 capitalize">{row.payment_method}</span></div>
            <div><span className="text-slate-500">Status:</span> <span className="text-slate-300 capitalize">{row.status}</span></div>
            <div><span className="text-slate-500">Tax Invoice:</span> <span className="text-slate-300">{row.has_tax_invoice ? 'Yes' : 'No'}</span></div>
          </div>
        )}
      </div>

      {/* ── Receipt files section ── */}
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/30 p-3">
        <span className="text-[11px] font-medium text-slate-400">Documents</span>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {receipts.map(({ label, url, slot, color }) => (
            <div key={slot} className="flex items-center gap-2 rounded-lg border border-slate-800/40 bg-slate-900/50 px-2.5 py-2">
              {url ? (
                <>
                  <button type="button" onClick={() => onReceiptClick(url)} className="hover:opacity-70" title={`View ${label}`}>
                    <Receipt className={`h-4 w-4 text-${color}-400`} />
                  </button>
                  <button type="button" onClick={() => onReceiptClick(url)} className="flex-1 truncate text-[10px] text-slate-300 hover:text-slate-100 text-left">
                    {label}
                  </button>
                  <span className="rounded bg-emerald-500/10 px-1 py-0.5 text-[8px] text-emerald-400">Attached</span>
                </>
              ) : (
                <>
                  <Receipt className="h-4 w-4 text-slate-600" />
                  <span className="flex-1 text-[10px] text-slate-500">{label}</span>
                  <label className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] text-slate-400 transition hover:bg-slate-700 hover:text-slate-200 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Upload className="h-3 w-3" />
                    {isUploading ? '...' : 'Upload'}
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => handleFileUpload(e, slot)} />
                  </label>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Spoke detail (line items) ── */}
      <SpokeDetail expenseId={row.id} />
    </div>
  )
}
