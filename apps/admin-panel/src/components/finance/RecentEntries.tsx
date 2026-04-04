import { Receipt, Check } from 'lucide-react'
import type { ExpenseRow } from '../../hooks/useExpenseLedger'

/* ═══════════════════════════════════════════════════════
   RecentEntries — compact list of last N expenses
   for quick reference while entering new ones.
   ═══════════════════════════════════════════════════════ */

export interface RecentEntriesProps {
  rows: ExpenseRow[]
  limit?: number
  onReceiptClick?: (row: ExpenseRow) => void
}

const FLOW_DOT: Record<string, string> = {
  OpEx: 'bg-emerald-400',
  CapEx: 'bg-amber-400',
  COGS: 'bg-blue-400',
}

export function RecentEntries({ rows, limit = 5, onReceiptClick }: RecentEntriesProps) {
  const recent = rows.slice(0, limit)

  if (recent.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-600">
        No entries yet
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <h3 className="text-xs font-semibold text-slate-400">Recent Entries</h3>
        <span className="text-[10px] text-slate-600">{rows.length} total</span>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        {recent.map((r) => {
          const docCount = r.receipt_pages.length
            || [r.receipt_supplier_url, r.receipt_bank_url, r.tax_invoice_url].filter(Boolean).length

          return (
            <div
              key={r.id}
              className="group rounded-lg border border-slate-800/40 bg-slate-900/30 px-3 py-2 transition hover:bg-slate-800/40"
            >
              {/* Top: date + amount */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${FLOW_DOT[r.flow_type] || FLOW_DOT.COGS}`}
                    title={r.flow_type}
                  />
                  <span className="text-[10px] text-slate-500">{r.transaction_date}</span>
                </div>
                <span className="font-mono text-[11px] font-semibold text-slate-200">
                  ฿{Math.round(r.amount_thb).toLocaleString()}
                </span>
              </div>

              {/* Middle: supplier + details */}
              <div className="mt-1">
                {r.supplier_name && (
                  <div className="text-[11px] font-medium text-slate-300">{r.supplier_name}</div>
                )}
                <div className="truncate text-[10px] text-slate-500">
                  {r.details || '\u2014'}
                </div>
              </div>

              {/* Bottom: category + docs + tax */}
              <div className="mt-1 flex items-center gap-2">
                {r.category_name && (
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-500">
                    {r.category_name}
                  </span>
                )}
                {docCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onReceiptClick?.(r)}
                    className="inline-flex items-center gap-0.5 text-[9px] text-emerald-500 hover:text-emerald-400"
                  >
                    <Receipt className="h-3 w-3" />
                    {docCount}
                  </button>
                )}
                {r.has_tax_invoice && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-500">
                    <Check className="h-3 w-3" /> Tax
                  </span>
                )}
                <span className="ml-auto text-[9px] capitalize text-slate-600">
                  {r.payment_method}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
