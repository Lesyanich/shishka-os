import { Trash2 } from 'lucide-react'
import type { ModifierBindingRow } from '../../../hooks/useModifierBindings'

interface Props {
  rows: ModifierBindingRow[]
  onDelete: (id: string) => void
}

export function BindingsTable({ rows, onDelete }: Props) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-xs text-slate-500">
        No bindings yet. Click "+ Add binding" above to map a Loyverse option to a dish.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-2 font-semibold">Dish</th>
            <th className="px-3 py-2 font-semibold">Loyverse option</th>
            <th className="px-3 py-2 font-semibold">Slot</th>
            <th className="px-3 py-2 font-semibold">MOD</th>
            <th className="px-3 py-2 font-semibold text-right">Qty</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {rows.map((r) => (
            <tr key={r.id} className="text-slate-300 hover:bg-slate-900/40">
              <td className="px-3 py-2">
                <div className="font-medium text-slate-100">{r.dish_code}</div>
                <div className="text-[10px] text-slate-500">{r.dish_name}</div>
              </td>
              <td className="px-3 py-2 text-slate-300">
                {r.loyverse_modifier_list_name && (
                  <span className="text-[10px] text-slate-500">{r.loyverse_modifier_list_name} → </span>
                )}
                {r.modifier_name}
              </td>
              <td className="px-3 py-2">
                {r.slot ? (
                  <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                    {r.slot}
                  </span>
                ) : (
                  <span className="text-amber-400">missing</span>
                )}
              </td>
              <td className="px-3 py-2">
                <div className="font-medium text-slate-200">{r.modifier_code}</div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.quantity_per_unit}</td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  onClick={() => onDelete(r.id)}
                  className="text-slate-500 hover:text-rose-300"
                  aria-label="Delete binding"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
