import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  FileCheck,
  Loader2,
  Pencil,
  Receipt,
} from 'lucide-react'
import type { ExpenseRow, FinCategory, Supplier } from '../../hooks/useExpenseLedger'
import { ExpenseFilterPanel, EMPTY_FILTERS } from './ExpenseFilterPanel'
import type { ExpenseFilters } from './ExpenseFilterPanel'
import { SpokeDetail } from './SpokeDetail'

/* ═══════════════════════════════════════════════════════════════
   ExpenseHistory — Phase 4.5: Analytics-Grade Expense Ledger
   Features: Sort (Date/Amount/Supplier), Composable Filters,
   Expandable Spoke Rows, Sticky Subtotal Footer
   ═══════════════════════════════════════════════════════════════ */

export interface ExpenseHistoryProps {
  rows: ExpenseRow[]
  categories: FinCategory[]
  suppliers: Supplier[]
  isLoading: boolean
  error: string | null
  onRefetch: () => void
  onReceiptClick: (url: string) => void
  onEditClick: (row: ExpenseRow) => void
}

/* ── Sort types ── */
type SortField = 'transaction_date' | 'amount_thb' | 'supplier_name'
type SortDir = 'asc' | 'desc'

export function ExpenseHistory({
  rows,
  categories,
  suppliers,
  isLoading,
  error,
  onRefetch,
  onReceiptClick,
  onEditClick,
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
    if (filters.dateFrom) n++
    if (filters.dateTo) n++
    if (filters.categoryCode !== null) n++
    if (filters.supplierId !== null) n++
    if (filters.flowType !== null) n++
    return n
  }, [filters])

  /* ── Filtered rows (AND logic) ── */
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
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
        <button
          type="button"
          onClick={onRefetch}
          className="text-[10px] text-slate-500 hover:text-slate-300"
        >
          Refresh
        </button>
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
        <div className="max-h-[680px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-900 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                {/* Expand chevron column */}
                <th className="w-8 px-2 py-2" />

                {/* Sortable: Date */}
                <th className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleSort('transaction_date')}
                    className="inline-flex items-center gap-1 transition-colors hover:text-slate-300"
                  >
                    Date <SortIcon field="transaction_date" />
                  </button>
                </th>

                <th className="px-2 py-2">Category</th>

                {/* Sortable: Supplier */}
                <th className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => toggleSort('supplier_name')}
                    className="inline-flex items-center gap-1 transition-colors hover:text-slate-300"
                  >
                    Supplier <SortIcon field="supplier_name" />
                  </button>
                </th>

                <th className="px-2 py-2">Details</th>
                <th className="px-2 py-2">Comments</th>

                {/* Sortable: Amount */}
                <th className="px-2 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('amount_thb')}
                    className="inline-flex items-center gap-1 transition-colors hover:text-slate-300"
                  >
                    Amount <SortIcon field="amount_thb" />
                  </button>
                </th>

                <th className="px-2 py-2 text-center">Docs</th>
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
                    {filteredTotal.toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </td>
                <td colSpan={2} />
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
   Renders the main data row + optional expanded SpokeDetail
   ═════════════════════════════════════════════════════════════ */

function TableRowWithSpoke({
  row: r,
  isExpanded,
  onToggleExpand,
  onReceiptClick,
  onEditClick,
}: {
  row: ExpenseRow
  isExpanded: boolean
  onToggleExpand: () => void
  onReceiptClick: (url: string) => void
  onEditClick: (row: ExpenseRow) => void
}) {
  return (
    <>
      <tr className="group hover:bg-slate-800/30">
        {/* Chevron expand toggle */}
        <td className="w-8 px-2 py-2.5 text-center">
          <button
            type="button"
            onClick={onToggleExpand}
            className="rounded-md p-0.5 text-slate-600 transition-colors hover:bg-slate-700/50 hover:text-slate-400"
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-indigo-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        </td>

        {/* Date + flow badge */}
        <td className="px-3 py-2.5">
          <div className="text-slate-300">{r.transaction_date}</div>
          <span
            className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
              r.flow_type === 'OpEx'
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-amber-500/15 text-amber-400'
            }`}
          >
            {r.flow_type}
          </span>
        </td>

        {/* Category + Sub-category */}
        <td className="px-2 py-2.5">
          <div className="text-slate-300">{r.category_name ?? '\u2014'}</div>
          {r.sub_category_name && (
            <div className="text-[10px] text-slate-500">{r.sub_category_name}</div>
          )}
        </td>

        {/* Supplier */}
        <td className="px-2 py-2.5">
          <div className="font-medium text-slate-200">{r.supplier_name ?? '\u2014'}</div>
          {r.status !== 'paid' && (
            <span
              className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] ${
                r.status === 'pending'
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'bg-rose-500/15 text-rose-300'
              }`}
            >
              {r.status}
            </span>
          )}
        </td>

        {/* Details */}
        <td className="max-w-[160px] px-2 py-2.5">
          <div className="truncate text-slate-300">{r.details || '\u2014'}</div>
        </td>

        {/* Comments */}
        <td className="max-w-[140px] px-2 py-2.5">
          <div className="truncate text-slate-500">{r.comments || '\u2014'}</div>
        </td>

        {/* Amount */}
        <td className="px-2 py-2.5 text-right">
          <div className="font-semibold text-slate-100">
            {'\u0E3F'}
            {r.amount_thb.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
          </div>
          {r.currency !== 'THB' && (
            <div className="text-[10px] text-slate-500">
              {r.amount_original.toLocaleString()} {r.currency}
            </div>
          )}
        </td>

        {/* Docs */}
        <td className="px-2 py-2.5">
          <div className="flex items-center justify-center gap-1">
            {r.receipt_supplier_url && (
              <button
                type="button"
                onClick={() => onReceiptClick(r.receipt_supplier_url!)}
                title="Supplier receipt"
                className="hover:opacity-70"
              >
                <Receipt className="h-3.5 w-3.5 text-emerald-400" />
              </button>
            )}
            {r.receipt_bank_url && (
              <button
                type="button"
                onClick={() => onReceiptClick(r.receipt_bank_url!)}
                title="Bank slip"
                className="hover:opacity-70"
              >
                <Receipt className="h-3.5 w-3.5 text-sky-400" />
              </button>
            )}
            {r.has_tax_invoice ? (
              <span title="Tax invoice available">
                <FileCheck className="h-3.5 w-3.5 text-amber-400" />
              </span>
            ) : null}
            {!r.receipt_supplier_url && !r.receipt_bank_url && !r.has_tax_invoice && (
              <span className="text-[10px] text-slate-600">{'\u2014'}</span>
            )}
          </div>
        </td>

        {/* Edit button */}
        <td className="px-2 py-2.5 text-center">
          <button
            type="button"
            onClick={() => onEditClick(r)}
            className="rounded-md p-1 text-slate-500 opacity-0 transition hover:bg-slate-700 hover:text-slate-300 group-hover:opacity-100"
            title="Edit expense"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </td>
      </tr>

      {/* Spoke detail row (expanded) */}
      {isExpanded && (
        <tr>
          <td colSpan={9} className="bg-slate-950/40 p-0">
            <SpokeDetail expenseId={r.id} />
          </td>
        </tr>
      )}
    </>
  )
}
