import { CalendarDays, Filter, Search, X } from 'lucide-react'
import type { FinCategory, Supplier } from '../../hooks/useExpenseLedger'

/* ═══════════════════════════════════════════════════════════════
   ExpenseFilterPanel — Composable filter bar for Expense Ledger
   Phase 4.5: Date range, category, supplier, flow type toggles
   ═══════════════════════════════════════════════════════════════ */

export interface ExpenseFilters {
  searchText: string
  dateFrom: string
  dateTo: string
  categoryCode: number | null
  supplierId: string | null
  flowType: 'OpEx' | 'CapEx' | null
}

export const EMPTY_FILTERS: ExpenseFilters = {
  searchText: '',
  dateFrom: '',
  dateTo: '',
  categoryCode: null,
  supplierId: null,
  flowType: null,
}

interface Props {
  categories: FinCategory[]
  suppliers: Supplier[]
  filters: ExpenseFilters
  onChange: (f: ExpenseFilters) => void
  activeCount: number
}

/* Shared field styles (mirrors StagingArea pattern) */
const inputCls =
  'h-8 w-full rounded-lg border border-slate-700/60 bg-slate-800/80 px-2.5 text-xs text-slate-100 outline-none transition-all duration-200 focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 placeholder:text-slate-600'
const selectCls =
  'h-8 w-full rounded-lg border border-slate-700/60 bg-slate-800/80 px-1.5 text-xs text-slate-100 outline-none transition-all duration-200 focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20'

export function ExpenseFilterPanel({
  categories,
  suppliers,
  filters,
  onChange,
  activeCount,
}: Props) {
  const patch = (p: Partial<ExpenseFilters>) => onChange({ ...filters, ...p })

  return (
    <div className="space-y-3">
      {/* Label row */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <Filter className="h-3.5 w-3.5 text-indigo-400/70" />
          {activeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-indigo-500 text-[8px] font-bold text-white shadow-sm shadow-indigo-500/30">
              {activeCount}
            </span>
          )}
        </div>
        <span className="text-[11px] font-medium tracking-wide text-slate-400/80 uppercase">
          Filters
        </span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-slate-500 transition-all duration-200 hover:bg-slate-800 hover:text-slate-300"
          >
            <X className="h-3 w-3" />
            Clear all
          </button>
        )}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Search by supplier, details, comments…"
          value={filters.searchText}
          onChange={(e) => patch({ searchText: e.target.value })}
          className={`${inputCls} pl-8`}
        />
        {filters.searchText && (
          <button
            type="button"
            onClick={() => patch({ searchText: '' })}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-slate-300"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Date From */}
        <div className="min-w-[130px] flex-1">
          <label className="mb-1 flex items-center gap-1 text-[10px] tracking-wide text-slate-500 uppercase">
            <CalendarDays className="h-3 w-3" /> From
          </label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => patch({ dateFrom: e.target.value })}
            className={inputCls}
          />
        </div>

        {/* Date To */}
        <div className="min-w-[130px] flex-1">
          <label className="mb-1 flex items-center gap-1 text-[10px] tracking-wide text-slate-500 uppercase">
            <CalendarDays className="h-3 w-3" /> To
          </label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => patch({ dateTo: e.target.value })}
            className={inputCls}
          />
        </div>

        {/* Category */}
        <div className="min-w-[150px] flex-1">
          <label className="mb-1 block text-[10px] tracking-wide text-slate-500 uppercase">
            Category
          </label>
          <select
            value={filters.categoryCode ?? ''}
            onChange={(e) =>
              patch({ categoryCode: e.target.value === '' ? null : Number(e.target.value) })
            }
            className={selectCls}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} &mdash; {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Supplier */}
        <div className="min-w-[150px] flex-1">
          <label className="mb-1 block text-[10px] tracking-wide text-slate-500 uppercase">
            Supplier
          </label>
          <select
            value={filters.supplierId ?? ''}
            onChange={(e) =>
              patch({ supplierId: e.target.value === '' ? null : e.target.value })
            }
            className={selectCls}
          >
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Flow Type pills */}
        <div className="min-w-[130px]">
          <label className="mb-1 block text-[10px] tracking-wide text-slate-500 uppercase">
            Type
          </label>
          <div className="flex gap-1.5">
            {(['OpEx', 'CapEx'] as const).map((ft) => {
              const active = filters.flowType === ft
              return (
                <button
                  key={ft}
                  type="button"
                  onClick={() => patch({ flowType: active ? null : ft })}
                  className={`h-8 flex-1 rounded-lg border text-[11px] font-semibold tracking-wide transition-all duration-200 ${
                    active
                      ? ft === 'OpEx'
                        ? 'border-emerald-500/50 bg-emerald-500/[0.12] text-emerald-300 shadow-sm shadow-emerald-500/10'
                        : 'border-amber-500/50 bg-amber-500/[0.12] text-amber-300 shadow-sm shadow-amber-500/10'
                      : 'border-slate-700/60 bg-slate-800/60 text-slate-500 hover:border-slate-600 hover:text-slate-400'
                  }`}
                >
                  {ft}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
