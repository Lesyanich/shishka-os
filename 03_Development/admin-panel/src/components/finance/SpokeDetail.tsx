import { Loader2, Package, ShoppingCart, Wrench } from 'lucide-react'
import { useSpokeData } from '../../hooks/useSpokeData'
import type { PurchaseLogRow, CapexTransactionRow, OpexItemRow } from '../../hooks/useSpokeData'
import { formatTHB } from './helpers'

/* ═══════════════════════════════════════════════════════════════
   SpokeDetail — Expandable row content for Hub→Spoke line items
   Phase 4.5: purchase_logs, capex_transactions, opex_items
   Renders inside <tr><td colSpan> below the parent expense row
   ═══════════════════════════════════════════════════════════════ */

interface Props {
  expenseId: string
}

/* ── Color config (matches StagingArea pattern) ── */
const colorMap = {
  emerald: {
    badge: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
    icon: 'text-emerald-400/70',
    border: 'border-emerald-500/10',
    header: 'from-emerald-500/[0.03]',
    total: 'text-emerald-400',
  },
  amber: {
    badge: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20',
    icon: 'text-amber-400/70',
    border: 'border-amber-500/10',
    header: 'from-amber-500/[0.03]',
    total: 'text-amber-400',
  },
  cyan: {
    badge: 'bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/20',
    icon: 'text-cyan-400/70',
    border: 'border-cyan-500/10',
    header: 'from-cyan-500/[0.03]',
    total: 'text-cyan-400',
  },
} as const

export function SpokeDetail({ expenseId }: Props) {
  const { data, isLoading, error } = useSpokeData(expenseId)

  /* Loading state */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin text-indigo-400/60" />
        <span className="text-[11px] text-slate-500">Loading line items...</span>
      </div>
    )
  }

  /* Error state */
  if (error) {
    return (
      <div className="px-4 py-4">
        <p className="text-[11px] text-rose-400/80">{error}</p>
      </div>
    )
  }

  /* No data or all empty */
  if (
    !data ||
    (data.purchaseLogs.length === 0 &&
      data.capexTransactions.length === 0 &&
      data.opexItems.length === 0)
  ) {
    return (
      <div className="flex items-center justify-center py-5">
        <span className="text-[11px] text-slate-600">No line items recorded</span>
      </div>
    )
  }

  return (
    <div className="animate-expand space-y-3 px-4 py-4">
      {/* Food Items (purchase_logs) */}
      {data.purchaseLogs.length > 0 && (
        <SpokeSection
          title="Food Items"
          icon={<ShoppingCart className="h-3 w-3" />}
          count={data.purchaseLogs.length}
          color="emerald"
        >
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-slate-800/30">
                <th className="px-2 py-1.5 text-left text-[9px] font-medium tracking-wider text-slate-500/70 uppercase">
                  Item
                </th>
                <th className="w-16 px-2 py-1.5 text-right text-[9px] font-medium tracking-wider text-slate-500/70 uppercase">
                  Qty
                </th>
                <th className="w-20 px-2 py-1.5 text-right text-[9px] font-medium tracking-wider text-slate-500/70 uppercase">
                  Unit Price
                </th>
                <th className="w-20 px-2 py-1.5 text-right text-[9px] font-medium tracking-wider text-slate-500/70 uppercase">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/20">
              {data.purchaseLogs.map((r: PurchaseLogRow) => (
                <tr key={r.id} className="hover:bg-slate-800/10">
                  <td className="px-2 py-1.5 text-slate-300">
                    {r.nomenclature_name || r.nomenclature_id}
                    {r.notes && (
                      <span className="ml-1.5 text-[10px] text-slate-600">{r.notes}</span>
                    )}
                  </td>
                  <td className="w-16 px-2 py-1.5 text-right font-mono text-slate-400">
                    {r.quantity}
                  </td>
                  <td className="w-20 px-2 py-1.5 text-right font-mono text-slate-400">
                    {formatTHB(r.price_per_unit)}
                  </td>
                  <td className="w-20 px-2 py-1.5 text-right font-mono font-medium text-emerald-400/80">
                    {formatTHB(r.total_price)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-800/40">
                <td colSpan={3} className="px-2 py-1.5 text-right text-[10px] font-medium tracking-wide text-slate-500 uppercase">
                  Subtotal
                </td>
                <td className="w-20 px-2 py-1.5 text-right font-mono text-xs font-semibold text-emerald-400">
                  {formatTHB(data.purchaseLogs.reduce((s, r) => s + r.total_price, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </SpokeSection>
      )}

      {/* CapEx Items (capex_transactions) */}
      {data.capexTransactions.length > 0 && (
        <SpokeSection
          title="CapEx Items"
          icon={<Wrench className="h-3 w-3" />}
          count={data.capexTransactions.length}
          color="amber"
        >
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-slate-800/30">
                <th className="px-2 py-1.5 text-left text-[9px] font-medium tracking-wider text-slate-500/70 uppercase">
                  ID
                </th>
                <th className="px-2 py-1.5 text-left text-[9px] font-medium tracking-wider text-slate-500/70 uppercase">
                  Type
                </th>
                <th className="px-2 py-1.5 text-left text-[9px] font-medium tracking-wider text-slate-500/70 uppercase">
                  Vendor
                </th>
                <th className="w-20 px-2 py-1.5 text-right text-[9px] font-medium tracking-wider text-slate-500/70 uppercase">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/20">
              {data.capexTransactions.map((r: CapexTransactionRow) => (
                <tr key={r.id} className="hover:bg-slate-800/10">
                  <td className="px-2 py-1.5 font-mono text-slate-400">
                    {r.transaction_id || '\u2014'}
                  </td>
                  <td className="px-2 py-1.5 text-slate-300">
                    {r.transaction_type || '\u2014'}
                  </td>
                  <td className="px-2 py-1.5 text-slate-300">
                    {r.vendor || '\u2014'}
                    {r.details && (
                      <span className="ml-1.5 text-[10px] text-slate-600">{r.details}</span>
                    )}
                  </td>
                  <td className="w-20 px-2 py-1.5 text-right font-mono font-medium text-amber-400/80">
                    {formatTHB(r.amount_thb)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-800/40">
                <td colSpan={3} className="px-2 py-1.5 text-right text-[10px] font-medium tracking-wide text-slate-500 uppercase">
                  Subtotal
                </td>
                <td className="w-20 px-2 py-1.5 text-right font-mono text-xs font-semibold text-amber-400">
                  {formatTHB(data.capexTransactions.reduce((s, r) => s + r.amount_thb, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </SpokeSection>
      )}

      {/* OpEx Items (opex_items) */}
      {data.opexItems.length > 0 && (
        <SpokeSection
          title="OpEx Items"
          icon={<Package className="h-3 w-3" />}
          count={data.opexItems.length}
          color="cyan"
        >
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-slate-800/30">
                <th className="px-2 py-1.5 text-left text-[9px] font-medium tracking-wider text-slate-500/70 uppercase">
                  Description
                </th>
                <th className="w-12 px-2 py-1.5 text-right text-[9px] font-medium tracking-wider text-slate-500/70 uppercase">
                  Qty
                </th>
                <th className="w-14 px-2 py-1.5 text-center text-[9px] font-medium tracking-wider text-slate-500/70 uppercase">
                  Unit
                </th>
                <th className="w-20 px-2 py-1.5 text-right text-[9px] font-medium tracking-wider text-slate-500/70 uppercase">
                  Price
                </th>
                <th className="w-20 px-2 py-1.5 text-right text-[9px] font-medium tracking-wider text-slate-500/70 uppercase">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/20">
              {data.opexItems.map((r: OpexItemRow) => (
                <tr key={r.id} className="hover:bg-slate-800/10">
                  <td className="px-2 py-1.5 text-slate-300">{r.description}</td>
                  <td className="w-12 px-2 py-1.5 text-right font-mono text-slate-400">
                    {r.quantity}
                  </td>
                  <td className="w-14 px-2 py-1.5 text-center text-slate-500">{r.unit}</td>
                  <td className="w-20 px-2 py-1.5 text-right font-mono text-slate-400">
                    {formatTHB(r.unit_price)}
                  </td>
                  <td className="w-20 px-2 py-1.5 text-right font-mono font-medium text-cyan-400/80">
                    {formatTHB(r.total_price)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-800/40">
                <td colSpan={4} className="px-2 py-1.5 text-right text-[10px] font-medium tracking-wide text-slate-500 uppercase">
                  Subtotal
                </td>
                <td className="w-20 px-2 py-1.5 text-right font-mono text-xs font-semibold text-cyan-400">
                  {formatTHB(data.opexItems.reduce((s, r) => s + r.total_price, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </SpokeSection>
      )}
    </div>
  )
}

/* ── Sub-component: SpokeSection (read-only version of StagingArea's ItemSection) ── */

function SpokeSection({
  title,
  icon,
  count,
  color,
  children,
}: {
  title: string
  icon: React.ReactNode
  count: number
  color: keyof typeof colorMap
  children: React.ReactNode
}) {
  const c = colorMap[color]

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-800/60 bg-slate-900/30 ${c.border}`}>
      {/* Header — always open (read-only, no toggle needed) */}
      <div
        className={`flex items-center gap-2 bg-gradient-to-r ${c.header} to-transparent px-3 py-2`}
      >
        <span className={c.icon}>{icon}</span>
        <span className="text-[11px] font-medium tracking-wide text-slate-300">{title}</span>
        <span
          className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold tabular-nums ${c.badge}`}
        >
          {count}
        </span>
      </div>

      {/* Table content */}
      <div className="border-t border-slate-800/30">{children}</div>
    </div>
  )
}
