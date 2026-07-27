import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { POLine, POLinePatch, Station } from '../../types/procurement'

interface Props {
  line: POLine
  stations: Station[]
  /** False once the order is past `confirmed` — fn_update_po refuses edits there anyway. */
  editable: boolean
  onPatch: (patch: POLinePatch) => void
  onRemove: (lineId: string) => void
  isBusy?: boolean
}

/**
 * One order line. While the order is still active this is the edit surface —
 * quantity stepper, actual price, unload station — matching the design's
 * "no Save button" model: every committed change is sent straight to
 * `fn_update_po`, which is the only thing allowed to touch totals.
 */
export function POLineEditor({ line, stations, editable, onPatch, onRemove, isBusy }: Props) {
  const [qty, setQty] = useState(String(line.qty_ordered))
  const [price, setPrice] = useState(
    line.unit_price_expected == null ? '' : String(line.unit_price_expected),
  )

  // Server is the source of truth: re-sync when the row changes underneath us
  // (another session's edit arriving via the coalesced realtime refetch).
  useEffect(() => setQty(String(line.qty_ordered)), [line.qty_ordered])
  useEffect(
    () => setPrice(line.unit_price_expected == null ? '' : String(line.unit_price_expected)),
    [line.unit_price_expected],
  )

  const unit = line.unit || line.base_unit

  const commitQty = (raw: string) => {
    const next = Number(raw)
    // qty <= 0 is rejected by the RPC; bounce it here so the user sees the old
    // value instead of a server error.
    if (!Number.isFinite(next) || next <= 0) {
      setQty(String(line.qty_ordered))
      return
    }
    if (next === line.qty_ordered) return
    onPatch({ id: line.id, qty_ordered: next })
  }

  const step = (delta: number) => {
    const next = Number((Number(qty) + delta).toFixed(3))
    if (next <= 0) return
    setQty(String(next))
    onPatch({ id: line.id, qty_ordered: next })
  }

  const commitPrice = (raw: string) => {
    const trimmed = raw.trim()
    const next = trimmed === '' ? null : Number(trimmed)
    if (next !== null && (!Number.isFinite(next) || next < 0)) {
      setPrice(line.unit_price_expected == null ? '' : String(line.unit_price_expected))
      return
    }
    if (next === line.unit_price_expected) return
    onPatch({ id: line.id, unit_price_expected: next })
  }

  const stationName = stations.find((s) => s.id === line.destination_station_id)

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-[var(--line-strong)] bg-[var(--s-2)] p-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-cream">{line.product_name}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-[10px] text-cream/45">{line.product_code}</span>
          {editable ? (
            <select
              value={line.destination_station_id ?? ''}
              onChange={(e) => onPatch({ id: line.id, destination_station_id: e.target.value || null })}
              disabled={isBusy}
              aria-label={`Destination for ${line.product_name}`}
              className="rounded-full bg-forest-soft/20 px-2 py-0.5 text-[10px] font-semibold text-mint-200 outline-none focus:ring-1 focus:ring-honey-300 disabled:opacity-50"
            >
              <option value="">→ set destination</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  → {s.name} · {s.floor}
                </option>
              ))}
            </select>
          ) : (
            stationName && (
              <span className="rounded-full bg-forest-soft/20 px-2 py-0.5 text-[10px] font-semibold text-mint-200">
                → {stationName.name} · {stationName.floor}
              </span>
            )
          )}
        </div>
      </div>

      {editable ? (
        <>
          <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-[var(--line-strong)]">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={isBusy}
              aria-label="Decrease quantity"
              className="flex h-7 w-6 items-center justify-center bg-[var(--s-3)] text-sm font-bold text-cream transition hover:bg-[var(--s-2)] disabled:opacity-50"
            >
              −
            </button>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onBlur={(e) => commitQty(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              disabled={isBusy}
              inputMode="decimal"
              aria-label={`Quantity of ${line.product_name} in ${unit}`}
              className="w-12 bg-transparent text-center text-xs text-cream outline-none disabled:opacity-50"
            />
            <span className="pr-1.5 text-[10px] text-cream/45">{unit}</span>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={isBusy}
              aria-label="Increase quantity"
              className="flex h-7 w-6 items-center justify-center bg-[var(--s-3)] text-sm font-bold text-cream transition hover:bg-[var(--s-2)] disabled:opacity-50"
            >
              +
            </button>
          </div>

          <div className="flex shrink-0 items-center rounded-lg border border-[var(--line-strong)] bg-[var(--s-1)] px-2 py-1">
            <span className="text-[10px] text-honey-300/70">฿</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={(e) => commitPrice(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              disabled={isBusy}
              inputMode="decimal"
              placeholder="—"
              aria-label={`Unit price of ${line.product_name}`}
              className="w-14 bg-transparent text-right text-xs font-bold text-honey-300 outline-none placeholder:text-cream/30 disabled:opacity-50"
            />
          </div>

          <button
            type="button"
            onClick={() => onRemove(line.id)}
            disabled={isBusy}
            aria-label={`Remove ${line.product_name}`}
            className="shrink-0 rounded-lg p-1.5 text-cream/35 transition hover:bg-brick-soft/10 hover:text-brick-bright disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <div className="shrink-0 text-right">
          <p className="text-xs font-medium text-cream">
            {line.qty_ordered} {unit}
          </p>
          <p className="text-[10px] text-cream/45">
            {line.unit_price_expected != null
              ? `฿${line.unit_price_expected.toLocaleString()} · ฿${(line.total_expected ?? 0).toLocaleString()}`
              : 'Price TBD'}
          </p>
        </div>
      )}
    </div>
  )
}
