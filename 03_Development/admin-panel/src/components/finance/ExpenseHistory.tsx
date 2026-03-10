import { Loader2, Receipt } from 'lucide-react'
import type { ExpenseRow } from '../../hooks/useExpenseLedger'

export interface ExpenseHistoryProps {
  rows: ExpenseRow[]
  isLoading: boolean
  error: string | null
  onRefetch: () => void
  onReceiptClick: (url: string) => void
}

export function ExpenseHistory({
  rows,
  isLoading,
  error,
  onRefetch,
  onReceiptClick,
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
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-900 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">Category</th>
                <th className="px-2 py-2">Details</th>
                <th className="px-2 py-2 text-right">Amount</th>
                <th className="px-2 py-2 text-right">THB</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-4 py-2">Receipts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {rows.slice(0, 50).map((r) => (
                <tr key={r.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-2 text-slate-300">{r.transaction_date}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        r.flow_type === 'OpEx'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-amber-500/15 text-amber-300'
                      }`}
                    >
                      {r.flow_type}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-slate-400">
                    {r.category_name ?? '\u2014'}
                    {r.sub_category_name ? ` / ${r.sub_category_name}` : ''}
                  </td>
                  <td className="max-w-[140px] truncate px-2 py-2 text-slate-300">
                    {r.details || '\u2014'}
                  </td>
                  <td className="px-2 py-2 text-right text-slate-300">
                    {r.currency !== 'THB' ? (
                      <span>
                        {r.amount_original.toLocaleString()} {r.currency}
                      </span>
                    ) : (
                      '\u2014'
                    )}
                  </td>
                  <td className="px-2 py-2 text-right font-medium text-slate-100">
                    {r.amount_thb.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                        r.status === 'paid'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : r.status === 'pending'
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-rose-500/15 text-rose-300'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      {r.receipt_supplier_url && (
                        <button
                          type="button"
                          onClick={() => onReceiptClick(r.receipt_supplier_url!)}
                          title="Supplier receipt"
                          className="hover:opacity-70"
                        >
                          <Receipt className="h-3 w-3 text-emerald-400" />
                        </button>
                      )}
                      {r.receipt_bank_url && (
                        <button
                          type="button"
                          onClick={() => onReceiptClick(r.receipt_bank_url!)}
                          title="Bank slip"
                          className="hover:opacity-70"
                        >
                          <Receipt className="h-3 w-3 text-sky-400" />
                        </button>
                      )}
                      {r.tax_invoice_url && (
                        <button
                          type="button"
                          onClick={() => onReceiptClick(r.tax_invoice_url!)}
                          title="Tax invoice"
                          className="hover:opacity-70"
                        >
                          <Receipt className="h-3 w-3 text-amber-400" />
                        </button>
                      )}
                    </div>
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
