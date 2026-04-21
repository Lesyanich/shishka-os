import type { NomenclatureKind } from '../../../hooks/useMenuData'

export type TypeFilterValue = 'all' | NomenclatureKind

interface TypeFilterProps {
  value: TypeFilterValue
  onChange: (value: TypeFilterValue) => void
  counts?: Partial<Record<TypeFilterValue, number>>
}

const ORDER: TypeFilterValue[] = ['all', 'SALE', 'PF', 'MOD']

const LABELS: Record<TypeFilterValue, string> = {
  all: 'All',
  SALE: 'Sale',
  PF: 'PF',
  MOD: 'Mod',
}

/** Pills in Alegreya SC. SALE/PF/MOD get accent-tinted active states
 * echoing the type badge colors used in the owner table. */
const TONE: Record<
  TypeFilterValue,
  { active: string; idle: string; accent: string }
> = {
  all: {
    active: 'bg-[var(--color-cream)]/10 text-[color:var(--color-cream)] ring-1 ring-inset ring-[var(--color-cream)]/30',
    idle: 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100',
    accent: 'bg-[var(--color-cream)]/70',
  },
  SALE: {
    active: 'bg-[var(--color-royal-green)]/25 text-[color:var(--color-forest-soft)] ring-1 ring-inset ring-[var(--color-forest-soft)]/50',
    idle: 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100',
    accent: 'bg-[var(--color-forest-soft)]',
  },
  PF: {
    active: 'bg-[var(--color-amber-watch)]/20 text-[color:var(--color-amber-watch)] ring-1 ring-inset ring-[var(--color-amber-watch)]/50',
    idle: 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100',
    accent: 'bg-[var(--color-amber-watch)]',
  },
  MOD: {
    active: 'bg-[var(--color-royal-red)]/20 text-[color:var(--color-brick-soft)] ring-1 ring-inset ring-[var(--color-brick-soft)]/50',
    idle: 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100',
    accent: 'bg-[var(--color-brick-soft)]',
  },
}

export function TypeFilter({ value, onChange, counts }: TypeFilterProps) {
  return (
    <div
      role="tablist"
      aria-label="Product type filter"
      className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-[var(--color-surface-1)] p-1"
    >
      {ORDER.map((key) => {
        const isActive = value === key
        const tone = TONE[key]
        const n = counts?.[key]
        return (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(key)}
            className={`relative inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.12em] transition ${
              isActive ? tone.active : tone.idle
            }`}
            style={{ fontFamily: 'var(--font-display-sc)', fontWeight: 500 }}
          >
            {!isActive && (
              <span
                className={`h-1.5 w-1.5 rounded-full ${tone.accent} opacity-70`}
                aria-hidden
              />
            )}
            {LABELS[key]}
            {typeof n === 'number' && (
              <span className="font-mono text-[10px] tabular-nums opacity-70">
                {n}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
