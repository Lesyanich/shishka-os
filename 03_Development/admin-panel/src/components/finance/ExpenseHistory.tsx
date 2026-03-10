import { FileCheck, Loader2, Pencil, Receipt } from 'lucide-react'
import type { ExpenseRow } from '../../hooks/useExpenseLedger'

export interface ExpenseHistoryProps {
  rows: ExpenseRow[]
  isLoading: boolean
  error: string | null
  onRefetch: () => void
  onReceiptClick: (url: string) => void
  onEditClick: (row: ExpenseRow) => void
}

export function ExpenseHistory({
  rows,
  isLoading,
  error,
  onRefetch,
  onReceiptClick,
  onEditClick,
}: ExpenseHistoryProps) {
  if (error) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="text-xs text-rose-400">{error}</div>
      </section>
    )
  }

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
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">Recent Expenses</h2>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
            {rows.length}
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

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-xs text-slate-500">
          No expenses yet. Add one using the form.
        </div>
      ) : (
        <div className="max-h-[520px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-900 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-2 py-2">Supplier</th>
                <th className="px-2 py-2">Details</th>
                <th className="px-2 py-2">Comments</th>
                <th className="px-2 py-2 text-right">Amount</th>
                <th className="px-2 py-2 text-center">Docs</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {rows.slice(0, 100).map((r) => (
                <tr key={r.id} className="group hover:bg-slate-800/30">
                  {/* Date + tiny OpEx/CapEx badge */}
                  <td className="px-4 py-2.5">
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

                  {/* Supplier */}
                  <td className="px-2 py-2.5">
                    <div className="font-medium text-slate-200">
                      {r.supplier_name ?? '\u2014'}
                    </div>
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
                    <div className="truncate text-slate-300">
                      {r.details || '\u2014'}
                    </div>
                  </td>

                  {/* Comments */}
                  <td className="max-w-[140px] px-2 py-2.5">
                    <div className="truncate text-slate-500">
                      {r.comments || '\u2014'}
                    </div>
                  </td>

                  {/* Amount */}
                  <td className="px-2 py-2.5 text-right">
                    <div className="font-semibold text-slate-100">
                      {'\u0E3F'}{r.amount_thb.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </div>
                    {r.currency !== 'THB' && (
                      <div className="text-[10px] text-slate-500">
                        {r.amount_original.toLocaleString()} {r.currency}
                      </div>
                    )}
                  </td>

                  {/* Docs: Receipts + Tax Invoice flag */}
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
