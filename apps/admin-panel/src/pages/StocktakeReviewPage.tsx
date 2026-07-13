import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, PackageCheck, ShoppingCart, ChefHat } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAppRole } from '../contexts/AppRoleContext'
import { fmtQty } from '../components/procurement/StockPanel'
import { SESSION_STATUS_META, type StocktakeSessionStatus } from '../types/stations'

/** S3 — the count -> action loop. A manager opens the applied (or submitted)
 * stocktake document, reviews the variance in ฿, applies it (confirms the
 * counts + posts the discrepancy movement), then routes the low lines:
 * RAW-low -> Shopping List, PF-low -> a Production task at the producing
 * station. Reads v_stocktake_session_lines + fn_route_stocktake_session
 * (mig 355). Route is task_manager-gated in App.tsx. */

interface SessionRow {
  id: string
  doc_number: string
  status: StocktakeSessionStatus
  is_baseline: boolean
  scope: string
  station_id: string
  variance_value_thb: number | null
  applied_at: string | null
  counted_by: string | null
  opened_at: string
}

interface SessionLine {
  nomenclature_id: string
  product_code: string
  name: string
  base_unit: string | null
  cost_per_unit: number | null
  item_kind: 'food' | 'packaging'
  is_raw: boolean
  is_pf: boolean
  counted: number
  on_hand: number
  delta: number
  delta_thb: number
  min_stock: number | null
  par_stock: number | null
  is_low: boolean
  suggested_qty: number | null
  producing_station_id: string | null
  producing_station_code: string | null
  producing_station_name: string | null
}

interface RouteResult {
  ok: boolean
  error?: string
  shopping_inserted?: number
  production_inserted?: number
  skipped?: { nomenclature_id: string; name: string; reason: string }[]
}

const num = (v: unknown): number => (v == null ? 0 : Number(v))
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v))

function normalizeLine(r: Record<string, unknown>): SessionLine {
  return {
    nomenclature_id: r.nomenclature_id as string,
    product_code: r.product_code as string,
    name: r.name as string,
    base_unit: (r.base_unit as string | null) ?? null,
    cost_per_unit: numOrNull(r.cost_per_unit),
    item_kind: r.item_kind === 'packaging' ? 'packaging' : 'food',
    is_raw: Boolean(r.is_raw),
    is_pf: Boolean(r.is_pf),
    counted: num(r.counted),
    on_hand: num(r.on_hand),
    delta: num(r.delta),
    delta_thb: num(r.delta_thb),
    min_stock: numOrNull(r.min_stock),
    par_stock: numOrNull(r.par_stock),
    is_low: Boolean(r.is_low),
    suggested_qty: numOrNull(r.suggested_qty),
    producing_station_id: (r.producing_station_id as string | null) ?? null,
    producing_station_code: (r.producing_station_code as string | null) ?? null,
    producing_station_name: (r.producing_station_name as string | null) ?? null,
  }
}

export function StocktakeReviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { role } = useAppRole()
  const canAct = role === 'owner' || role === 'task_manager'

  const [session, setSession] = useState<SessionRow | null>(null)
  const [stationName, setStationName] = useState<string>('')
  const [lines, setLines] = useState<SessionLine[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null)

  const [pickShopping, setPickShopping] = useState<Set<string>>(new Set())
  const [pickProduction, setPickProduction] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    if (!id) return
    setIsLoading(true)
    setError(null)
    const { data: s, error: sErr } = await supabase
      .from('stocktake_sessions')
      .select('id, doc_number, status, is_baseline, scope, station_id, variance_value_thb, applied_at, counted_by, opened_at')
      .eq('id', id)
      .maybeSingle()
    if (sErr) {
      setError(sErr.message)
      setIsLoading(false)
      return
    }
    if (!s) {
      setSession(null)
      setIsLoading(false)
      return
    }
    setSession(s as SessionRow)

    const [{ data: st }, { data: rawLines, error: lErr }] = await Promise.all([
      supabase.from('stations').select('name').eq('id', (s as SessionRow).station_id).maybeSingle(),
      supabase.from('v_stocktake_session_lines').select('*').eq('session_id', id),
    ])
    setStationName((st?.name as string) ?? '')
    if (lErr) setError(lErr.message)
    setLines(((rawLines ?? []) as Record<string, unknown>[]).map(normalizeLine))
    setIsLoading(false)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  // Pre-tick the routable low lines once the session is applied.
  const shoppingCandidates = useMemo(
    () => lines.filter((l) => l.is_low && l.is_raw),
    [lines],
  )
  const productionCandidates = useMemo(
    () => lines.filter((l) => l.is_low && l.is_pf && l.producing_station_id != null),
    [lines],
  )
  const unroutablePf = useMemo(
    () => lines.filter((l) => l.is_low && l.is_pf && l.producing_station_id == null),
    [lines],
  )

  useEffect(() => {
    if (session?.status === 'applied') {
      setPickShopping(new Set(shoppingCandidates.map((l) => l.nomenclature_id)))
      setPickProduction(new Set(productionCandidates.map((l) => l.nomenclature_id)))
    }
  }, [session?.status, shoppingCandidates, productionCandidates])

  const totalVariance = useMemo(() => {
    if (session?.variance_value_thb != null) return session.variance_value_thb
    return lines.reduce((sum, l) => sum + l.delta_thb, 0)
  }, [session, lines])

  const toggle = (set: Set<string>, key: string): Set<string> => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  }

  const handleApply = useCallback(async () => {
    if (!session) return
    setBusy(true)
    setError(null)
    const { data, error: rpcErr } = await supabase.rpc('fn_apply_stocktake_session', {
      p_session_id: session.id,
      p_applied_by: null,
    })
    setBusy(false)
    const res = data as { ok: boolean; error?: string } | null
    if (rpcErr || !res?.ok) {
      setError(rpcErr?.message ?? res?.error ?? 'could not apply the count')
      return
    }
    await load()
  }, [session, load])

  const handleRoute = useCallback(async () => {
    if (!session) return
    setBusy(true)
    setError(null)
    setRouteResult(null)
    const { data, error: rpcErr } = await supabase.rpc('fn_route_stocktake_session', {
      p_session_id: session.id,
      p_shopping_ids: Array.from(pickShopping),
      p_production_ids: Array.from(pickProduction),
      p_by: null,
    })
    setBusy(false)
    const res = data as RouteResult | null
    if (rpcErr || !res?.ok) {
      setError(rpcErr?.message ?? res?.error ?? 'could not route the counts')
      return
    }
    setRouteResult(res)
  }, [session, pickShopping, pickProduction])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-cream/45">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading stocktake…
      </div>
    )
  }

  if (!session) {
    return (
      <div className="shk-panel p-6">
        <h1 className="text-lg font-semibold text-cream">Stocktake not found</h1>
        <p className="mt-1 text-sm text-cream/50">This count document doesn’t exist or was removed.</p>
        <button
          type="button"
          onClick={() => navigate('/procurement')}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-honey-300 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Procurement
        </button>
      </div>
    )
  }

  const statusMeta = SESSION_STATUS_META[session.status]
  const applied = session.status === 'applied'
  const routable = session.status === 'draft' || session.status === 'submitted'
  const routedOk = routeResult?.ok === true

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 lg:p-6">
      <div>
        <button
          type="button"
          onClick={() => navigate('/procurement')}
          className="inline-flex items-center gap-1.5 text-xs text-cream/50 transition hover:text-cream/80"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Procurement
        </button>
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl font-semibold text-cream">
            {stationName || 'Stocktake'} <span className="text-cream/40">·</span>{' '}
            <span className="font-mono text-base text-cream/70">{session.doc_number}</span>
          </h1>
          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${statusMeta.badgeCls}`}>
            {statusMeta.label}
          </span>
          {session.is_baseline && (
            <span className="rounded bg-[var(--s-2)] px-1.5 py-0.5 text-[10px] text-cream/50">baseline</span>
          )}
        </div>
        <p className="mt-1 text-sm text-cream/50">
          {lines.length} line{lines.length === 1 ? '' : 's'} · variance{' '}
          <span className={totalVariance < 0 ? 'font-semibold text-brick-bright' : 'font-semibold text-forest-soft'}>
            {totalVariance > 0 ? '+' : ''}
            {Math.round(totalVariance).toLocaleString()} ฿
          </span>
          {session.counted_by ? ` · counted by ${session.counted_by}` : ''}
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-brick-soft/30 bg-brick-soft/10 px-3 py-2 text-xs text-brick-bright">
          {error}
        </div>
      )}

      {/* Variance table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--s-1)] text-[10px] uppercase tracking-wide text-cream/45">
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Counted</th>
              <th className="px-3 py-2 text-right">On hand</th>
              <th className="px-3 py-2 text-right">Δ</th>
              <th className="px-3 py-2 text-right">Δ ฿</th>
              <th className="px-3 py-2">Route</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-cream/45">
                  No counted lines on this document.
                </td>
              </tr>
            ) : (
              lines.map((l) => (
                <tr key={l.nomenclature_id} className="border-b border-[var(--line)] last:border-none">
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-cream">{l.name}</span>
                    <span className="block text-[10px] text-cream/30">{l.product_code}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-cream/80">{fmtQty(l.counted, l.base_unit)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-cream/60">{fmtQty(l.on_hand, l.base_unit)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${l.delta < 0 ? 'text-brick-bright' : l.delta > 0 ? 'text-forest-soft' : 'text-cream/40'}`}>
                    {l.delta > 0 ? '+' : ''}
                    {fmtQty(l.delta, l.base_unit)}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${l.delta_thb < 0 ? 'text-brick-bright' : l.delta_thb > 0 ? 'text-forest-soft' : 'text-cream/40'}`}>
                    {l.delta_thb > 0 ? '+' : ''}
                    {Math.round(l.delta_thb).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5">
                    {!l.is_low ? (
                      <span className="text-[10px] text-cream/25">—</span>
                    ) : l.is_raw ? (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-watch/15 px-1.5 py-0.5 text-[10px] text-amber-watch">
                        <ShoppingCart className="h-3 w-3" /> buy
                      </span>
                    ) : l.is_pf && l.producing_station_id ? (
                      <span className="inline-flex items-center gap-1 rounded bg-forest-soft/15 px-1.5 py-0.5 text-[10px] text-forest-soft">
                        <ChefHat className="h-3 w-3" /> {l.producing_station_code}
                      </span>
                    ) : (
                      <span className="text-[10px] text-cream/35">no station</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Apply step (draft/submitted) */}
      {routable && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--s-1)] px-4 py-3">
          <PackageCheck className="h-4 w-4 text-cream/60" />
          <span className="text-sm text-cream/70">
            Apply confirms these counts and posts the {Math.round(totalVariance).toLocaleString()} ฿ variance. Then you can route the low lines.
          </span>
          <button
            type="button"
            onClick={handleApply}
            disabled={busy || !canAct || lines.length === 0}
            className="ml-auto rounded-md bg-[var(--color-royal-green)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--color-royal-soft)] disabled:opacity-40"
          >
            {busy ? 'Applying…' : 'Apply count'}
          </button>
        </div>
      )}

      {/* Routing step (applied) */}
      {applied && !routedOk && (
        <div className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--s-1)] p-4">
          <h2 className="text-sm font-semibold text-cream">Route the low lines</h2>

          {shoppingCandidates.length === 0 && productionCandidates.length === 0 ? (
            <p className="text-sm text-cream/45">
              Nothing to reorder — every counted item is at or above its reorder line.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Shopping */}
              <div className="rounded-lg border border-[var(--line)] p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-watch">
                  <ShoppingCart className="h-3.5 w-3.5" /> Shopping list ({shoppingCandidates.length})
                </div>
                {shoppingCandidates.length === 0 ? (
                  <p className="text-[11px] text-cream/35">No raw items low.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {shoppingCandidates.map((l) => (
                      <li key={l.nomenclature_id}>
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-cream/80">
                          <input
                            type="checkbox"
                            checked={pickShopping.has(l.nomenclature_id)}
                            onChange={() => setPickShopping((s) => toggle(s, l.nomenclature_id))}
                            className="accent-[var(--color-royal-green)]"
                          />
                          <span className="flex-1 truncate">{l.name}</span>
                          <span className="tabular-nums text-cream/50">
                            {fmtQty(l.suggested_qty ?? 0, l.base_unit)}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Production */}
              <div className="rounded-lg border border-[var(--line)] p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-forest-soft">
                  <ChefHat className="h-3.5 w-3.5" /> Production ({productionCandidates.length})
                </div>
                {productionCandidates.length === 0 ? (
                  <p className="text-[11px] text-cream/35">No semi-finished items low.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {productionCandidates.map((l) => (
                      <li key={l.nomenclature_id}>
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-cream/80">
                          <input
                            type="checkbox"
                            checked={pickProduction.has(l.nomenclature_id)}
                            onChange={() => setPickProduction((s) => toggle(s, l.nomenclature_id))}
                            className="accent-[var(--color-royal-green)]"
                          />
                          <span className="flex-1 truncate">{l.name}</span>
                          <span className="rounded bg-[var(--s-2)] px-1 py-0.5 text-[9px] text-cream/50">
                            {l.producing_station_code}
                          </span>
                          <span className="tabular-nums text-cream/50">
                            {fmtQty(l.suggested_qty ?? 0, l.base_unit)}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                {unroutablePf.length > 0 && (
                  <p className="mt-2 text-[10px] text-cream/35">
                    {unroutablePf.length} low semi-finished item{unroutablePf.length === 1 ? '' : 's'} have no producing
                    station mapped — handle manually.
                  </p>
                )}
              </div>
            </div>
          )}

          {(shoppingCandidates.length > 0 || productionCandidates.length > 0) && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRoute}
                disabled={busy || !canAct || (pickShopping.size === 0 && pickProduction.size === 0)}
                className="rounded-md bg-[var(--color-royal-green)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--color-royal-soft)] disabled:opacity-40"
              >
                {busy
                  ? 'Routing…'
                  : `Route ${pickShopping.size + pickProduction.size} item${pickShopping.size + pickProduction.size === 1 ? '' : 's'}`}
              </button>
              <span className="text-[11px] text-cream/40">
                {pickShopping.size} to buy · {pickProduction.size} to make
              </span>
            </div>
          )}
        </div>
      )}

      {/* Routed confirmation */}
      {routedOk && (
        <div className="space-y-2 rounded-xl border border-forest-soft/30 bg-forest-soft/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-forest-soft">
            <PackageCheck className="h-4 w-4" /> Routed
          </div>
          <p className="text-xs text-cream/70">
            {routeResult?.shopping_inserted ?? 0} added to the Shopping List ·{' '}
            {routeResult?.production_inserted ?? 0} production task
            {(routeResult?.production_inserted ?? 0) === 1 ? '' : 's'} created.
          </p>
          {routeResult?.skipped && routeResult.skipped.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-[11px] text-cream/45">
              {routeResult.skipped.map((s) => (
                <li key={s.nomenclature_id}>
                  Skipped {s.name} — {s.reason}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => navigate('/shopping-list')}
              className="text-xs text-honey-300 hover:underline"
            >
              Open Shopping List →
            </button>
            <button
              type="button"
              onClick={() => navigate('/kitchen/tasks')}
              className="text-xs text-honey-300 hover:underline"
            >
              Open Production →
            </button>
          </div>
        </div>
      )}

      {session.status === 'cancelled' && (
        <p className="text-sm text-cream/45">This stocktake was cancelled.</p>
      )}
    </div>
  )
}
