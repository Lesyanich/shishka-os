import { useCallback, useState } from 'react'
import { ChevronLeft, Check, Link2, Loader2, PackageOpen, X } from 'lucide-react'
import {
  useCatalogMatching,
  CONFIDENT_MATCH,
  USABLE_MATCH,
} from '../../hooks/useCatalogMatching'
import type { MatchSuggestion } from '../../types/catalogMatch'

type Tab = 'unlinked' | 'pack'

export const fmtPrice = (v: number | null) => (v == null ? '—' : `฿${Number(v).toLocaleString()}`)

/**
 * Candidates worth putting in front of a human. Anything below USABLE_MATCH is
 * noise, and on a screen built for speed a plausible-looking wrong candidate is
 * how bad links get made — so it is hidden rather than ranked last.
 * Highest score first, so the strongest option is the nearest click.
 */
export function visibleSuggestions(all: MatchSuggestion[]): MatchSuggestion[] {
  return all.filter((s) => s.score >= USABLE_MATCH).sort((a, b) => b.score - a.score)
}

/** True when the names are effectively identical (or a barcode proved it). */
export function isConfident(s: MatchSuggestion): boolean {
  return s.score >= CONFIDENT_MATCH
}

/**
 * Clears the two ways a supplier price can be useless:
 *  - unlinked   → real price, no item, so it can be neither compared nor ordered
 *  - pack unknown → linked and priced, but we do not know what the price buys
 *
 * Every action is a single RPC and the row leaves the list immediately. With
 * 800+ rows to work through, a refetch per decision would make this unusable.
 */
export function CatalogMatchQueue({ onBack }: { onBack: () => void }) {
  const { queue, packMissing, health, isLoading, error, suggest, linkRow, dismissRow, setPack } =
    useCatalogMatching()
  const [tab, setTab] = useState<Tab>('unlinked')
  const [openId, setOpenId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([])
  const [loadingSuggest, setLoadingSuggest] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [packInput, setPackInput] = useState('')

  const openRow = useCallback(
    async (catalogId: string) => {
      if (openId === catalogId) {
        setOpenId(null)
        return
      }
      setOpenId(catalogId)
      setSuggestions([])
      setRowError(null)
      setLoadingSuggest(true)
      setSuggestions(await suggest(catalogId))
      setLoadingSuggest(false)
    },
    [openId, suggest],
  )

  const handleLink = useCallback(
    async (catalogId: string, nomenclatureId: string) => {
      setBusyId(catalogId)
      setRowError(null)
      // Pack size is optional here on purpose: forcing it would stall the queue
      // on rows where the pack is genuinely unknown. Those land in the "pack
      // size" tab instead of being blocked here.
      const factor = packInput.trim() ? Number(packInput) : undefined
      const result = await linkRow(catalogId, nomenclatureId, { conversionFactor: factor })
      setBusyId(null)
      if (!result.ok) setRowError(result.error ?? 'Could not link this row')
      else {
        setOpenId(null)
        setPackInput('')
      }
    },
    [linkRow, packInput],
  )

  const handleDismiss = useCallback(
    async (catalogId: string) => {
      setBusyId(catalogId)
      const result = await dismissRow(catalogId)
      setBusyId(null)
      if (!result.ok) setRowError(result.error ?? 'Could not update this row')
    },
    [dismissRow],
  )

  const handleSetPack = useCallback(
    async (catalogId: string, raw: string) => {
      const factor = Number(raw)
      if (!raw.trim() || !Number.isFinite(factor) || factor <= 0) {
        setRowError('Pack size must be a number greater than 0')
        return
      }
      setBusyId(catalogId)
      setRowError(null)
      const result = await setPack(catalogId, factor)
      setBusyId(null)
      if (!result.ok) setRowError(result.error ?? 'Could not save the pack size')
    },
    [setPack],
  )

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--s-1)] shadow-sm">
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-cream/60 hover:text-cream"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Price Book
        </button>
        <div>
          <h2 className="text-sm font-semibold text-cream">Catalog matching</h2>
          <p className="text-xs text-cream/45">
            Turn supplier prices into prices you can actually compare and order.
          </p>
        </div>
      </header>

      {health && (
        <dl className="grid grid-cols-2 gap-px border-b border-[var(--line)] bg-[var(--line)] sm:grid-cols-4">
          {[
            { label: 'Comparable', value: `${health.rows_comparable} / ${health.rows_total}` },
            { label: 'Unlinked queue', value: health.queue_pending },
            { label: 'Pack unknown', value: health.pack_missing },
            {
              label: 'Items with 2+ offers',
              value: `${health.items_with_2plus_offers} / ${health.purchasable_items}`,
            },
          ].map((s) => (
            <div key={s.label} className="bg-[var(--s-1)] px-4 py-2.5">
              <dt className="text-[10px] uppercase tracking-wide text-cream/40">{s.label}</dt>
              <dd className="mt-0.5 text-sm tabular-nums text-cream">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex gap-1 border-b border-[var(--line)] px-4 py-2.5">
        {(
          [
            { key: 'unlinked' as const, label: `Unlinked (${queue.length})` },
            { key: 'pack' as const, label: `Pack size missing (${packMissing.length})` },
          ]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={[
              'rounded-md px-2.5 py-1 text-[11px] font-medium transition',
              tab === t.key
                ? 'bg-[var(--s-3)] text-cream'
                : 'bg-[var(--s-2)] text-cream/45 hover:text-cream/80',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(error || rowError) && (
        <p role="alert" className="px-4 py-2 text-[11px] text-brick-bright">
          {error || rowError}
        </p>
      )}

      {isLoading ? (
        <p className="flex items-center gap-2 px-4 py-6 text-xs text-cream/45">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      ) : tab === 'unlinked' ? (
        queue.length === 0 ? (
          <p className="px-4 py-6 text-xs text-cream/45">
            Nothing waiting — every supplier price is either linked to an item or marked as
            something we do not stock.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {queue.map((r) => (
              <li key={r.catalog_id} className="px-4 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openRow(r.catalog_id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-[12px] font-medium text-cream">
                      {r.raw_name ?? '(no name)'}
                    </span>
                    <span className="text-[10px] text-cream/40">
                      {r.supplier_name} · {fmtPrice(r.last_seen_price)}
                      {r.barcode && ` · ${r.barcode}`}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDismiss(r.catalog_id)}
                    disabled={busyId === r.catalog_id}
                    title="We do not stock this — keep the price, drop it from the queue"
                    className="flex items-center gap-1 rounded-md border border-[var(--line-strong)] px-2 py-1 text-[10px] text-cream/60 hover:text-cream disabled:opacity-50"
                  >
                    <X className="h-3 w-3" /> Not ours
                  </button>
                </div>

                {openId === r.catalog_id && (
                  <div className="mt-2 rounded-lg bg-[var(--s-2)] p-2.5">
                    {loadingSuggest ? (
                      <p className="flex items-center gap-2 text-[11px] text-cream/45">
                        <Loader2 className="h-3 w-3 animate-spin" /> Looking for matches…
                      </p>
                    ) : (
                      <>
                        <label className="mb-2 flex items-center gap-2 text-[10px] text-cream/50">
                          <PackageOpen className="h-3 w-3" />
                          Pack size in base units (optional)
                          <input
                            value={packInput}
                            onChange={(e) => setPackInput(e.target.value)}
                            placeholder="e.g. 0.5 for a 500 g bag"
                            inputMode="decimal"
                            className="w-40 rounded border border-[var(--line-strong)] bg-[var(--s-1)] px-1.5 py-0.5 text-[11px] text-cream"
                          />
                        </label>
                        {visibleSuggestions(suggestions).length === 0 ? (
                          <p className="text-[11px] text-cream/45">
                            No candidate close enough to suggest. This is normal for products we
                            genuinely do not stock — mark it &ldquo;Not ours&rdquo;.
                          </p>
                        ) : (
                          <ul className="space-y-1">
                            {visibleSuggestions(suggestions).map((s) => (
                                <li
                                  key={s.nomenclature_id}
                                  className="flex items-center justify-between gap-2"
                                >
                                  <span className="min-w-0 truncate text-[11px] text-cream">
                                    {s.item_name}
                                    <span className="ml-1 text-[10px] text-cream/35">
                                      {s.product_code}
                                    </span>
                                    {isConfident(s) && (
                                      <span className="ml-1 text-[9px] uppercase text-mint-200">
                                        strong
                                      </span>
                                    )}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleLink(r.catalog_id, s.nomenclature_id)}
                                    disabled={busyId === r.catalog_id}
                                    className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--line-strong)] px-2 py-0.5 text-[10px] text-cream/80 hover:text-mint-200 disabled:opacity-50"
                                  >
                                    <Link2 className="h-3 w-3" /> Link
                                  </button>
                                </li>
                              ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )
      ) : packMissing.length === 0 ? (
        <p className="px-4 py-6 text-xs text-cream/45">
          Every linked price has a pack size, so all of them can be compared per unit.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {packMissing.map((r) => (
            <PackRow
              key={r.catalog_id}
              row={r}
              busy={busyId === r.catalog_id}
              onSave={(raw) => handleSetPack(r.catalog_id, raw)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/** One "we know the price but not what it buys" row. */
function PackRow({
  row,
  busy,
  onSave,
}: {
  row: import('../../types/catalogMatch').PackMissingRow
  busy: boolean
  onSave: (raw: string) => void
}) {
  const [value, setValue] = useState('')
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-cream">{row.item_name}</span>
        <span className="text-[10px] text-cream/40">
          {row.supplier_name} · {fmtPrice(row.last_seen_price)} per pack
          {row.raw_name && ` · ${row.raw_name}`}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`${row.base_unit ?? 'units'} per pack`}
          inputMode="decimal"
          className="w-36 rounded border border-[var(--line-strong)] bg-[var(--s-2)] px-1.5 py-0.5 text-[11px] text-cream"
        />
        <button
          type="button"
          onClick={() => onSave(value)}
          disabled={busy}
          className="flex items-center gap-1 rounded-md border border-[var(--line-strong)] px-2 py-1 text-[10px] text-cream/80 hover:text-mint-200 disabled:opacity-50"
        >
          <Check className="h-3 w-3" /> Save
        </button>
      </div>
    </li>
  )
}
