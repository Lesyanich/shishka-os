import { startTransition, useCallback, useMemo, useOptimistic, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  useShelfLifeItems,
  type ShelfKind,
  type ShelfLifeItem,
} from '../../hooks/useShelfLifeItems'
import { useInlineUpdate } from '../../hooks/useInlineUpdate'
import { InlineEditCell } from '../menu/owner/InlineEditCell'

type KindFilter = 'all' | ShelfKind

const KIND_BADGE: Record<ShelfKind, string> = {
  PF: 'bg-amber-watch/20 text-amber-watch ring-amber-watch/40',
  SALE: 'bg-forest-soft/20 text-mint-200 ring-forest-soft/40',
}

export function ShelfLifeEditor() {
  const { items, isLoading, error, updateShelfLife } = useShelfLifeItems()

  const inline = useInlineUpdate((id: string, patch: { shelf_life_days: number | null }) =>
    updateShelfLife(id, patch.shelf_life_days),
  )
  const [optimistic, setOptimistic] = useOptimistic(
    items,
    (state, p: { id: string; days: number | null }) =>
      state.map((it) => (it.id === p.id ? { ...it, shelf_life_days: p.days } : it)),
  )

  const [kind, setKind] = useState<KindFilter>('PF')
  const [blankOnly, setBlankOnly] = useState(true)
  const [search, setSearch] = useState('')

  const commitDays = useCallback(
    (item: ShelfLifeItem, days: number | null) => {
      // React 19 requires optimistic updates to run inside a transition/action,
      // otherwise it throws "optimistic state update outside a transition" and
      // the error boundary bounces the user off the page.
      startTransition(async () => {
        setOptimistic({ id: item.id, days })
        await inline.commit(item.id, { shelf_life_days: days })
      })
    },
    [inline, setOptimistic],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return optimistic.filter((it) => {
      if (kind !== 'all' && it.kind !== kind) return false
      if (blankOnly && it.shelf_life_days != null) return false
      if (q && !it.name.toLowerCase().includes(q) && !it.product_code.toLowerCase().includes(q))
        return false
      return true
    })
  }, [optimistic, kind, blankOnly, search])

  const blanksTotal = useMemo(
    () =>
      optimistic.filter((it) => it.shelf_life_days == null && (kind === 'all' || it.kind === kind))
        .length,
    [optimistic, kind],
  )

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--s-1)] shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-cream">Shelf life &amp; prep</h2>
          <p className="text-xs text-cream/45">
            Set days-until-expiry per prep. Drives batch expiry today, prep forecasting next.
          </p>
        </div>
        <span className="rounded-md bg-[var(--s-2)] px-2 py-1 text-[11px] text-cream/60">
          {blanksTotal} still blank
        </span>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-2.5">
        <div className="flex gap-1">
          {(['PF', 'SALE', 'all'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={[
                'rounded-md px-2.5 py-1 text-[11px] font-medium transition',
                kind === k
                  ? 'bg-[var(--s-3)] text-cream'
                  : 'bg-[var(--s-2)] text-cream/45 hover:text-cream/80',
              ].join(' ')}
            >
              {k === 'all' ? 'All' : k}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-cream/60">
          <input
            type="checkbox"
            checked={blankOnly}
            onChange={(e) => setBlankOnly(e.target.checked)}
            className="accent-forest-soft"
          />
          Blank only
        </label>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="ml-auto h-8 w-44 rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-2.5 text-xs text-cream outline-none focus:border-forest-soft"
        />
      </div>

      <div className="px-4 py-3">
        {error && (
          <div className="mb-3 rounded-md border border-brick-soft/30 bg-brick-soft/10 px-3 py-2 text-xs text-brick-bright">
            {error}
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-xs text-cream/45">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading items…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-xs text-cream/45">
            {blankOnly ? 'Nothing left blank here — nice.' : 'No items match.'}
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-cream/45">
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3">Storage</th>
                <th className="w-28 py-2 text-right">Shelf life (days)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr
                  key={it.id}
                  className={[
                    'border-b border-[var(--line)] last:border-none',
                    inline.isFailed(it.id) ? 'bg-brick-soft/5' : '',
                  ].join(' ')}
                >
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ring-1 ring-inset ${KIND_BADGE[it.kind]}`}
                      >
                        {it.kind}
                      </span>
                      <span className="font-medium text-cream">
                        {it.customer_short_name || it.name}
                      </span>
                      {!it.is_available && (
                        <span className="text-[10px] text-cream/30">(inactive)</span>
                      )}
                    </div>
                    <span className="text-[10px] text-cream/30">{it.product_code}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-cream/60">{it.storage_location || '—'}</td>
                  <td className="py-2.5 text-right">
                    <InlineEditCell<number | null>
                      value={it.shelf_life_days}
                      variant="number"
                      min={0}
                      align="right"
                      ariaLabel={`Shelf life for ${it.name}`}
                      placeholder="set…"
                      className="tabular-nums text-cream"
                      isFailed={inline.isFailed(it.id)}
                      onCommit={(next) => void commitDays(it, next)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
