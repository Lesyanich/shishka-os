import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { StocktakeScope } from '../types/stations'

interface ActiveSession {
  id: string
  doc_number: string
  status: 'draft' | 'submitted'
  is_baseline: boolean
}

interface RpcResult {
  ok: boolean
  error?: string
}

/** Drives one editable stocktake document for a station+scope: open/resume a
 * draft, record counted numbers (upserted server-side), apply (confirm counts
 * + post variance), or cancel. counted_by = the signed-in staff display name.
 * See migs 349/352. */
export function useStocktakeSession(
  stationCode: string,
  stationId: string,
  scope: StocktakeScope,
  countedBy: string,
) {
  const [session, setSession] = useState<ActiveSession | null>(null)
  /** nomenclature_id -> counted qty currently on the draft (local mirror). */
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const savingRef = useRef<Set<string>>(new Set())

  const loadDraftLines = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from('stocktake_entries')
      .select('nomenclature_id, counted_qty')
      .eq('session_id', sessionId)
      .eq('status', 'pending')
    const next: Record<string, number> = {}
    for (const r of data ?? []) next[r.nomenclature_id as string] = Number(r.counted_qty)
    setCounts(next)
  }, [])

  // Resume an already-open document for this station+scope on mount / change.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('stocktake_sessions')
        .select('id, doc_number, status, is_baseline')
        .eq('station_id', stationId)
        .eq('scope', scope)
        .in('status', ['draft', 'submitted'])
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled) return
      if (data && data.status === 'draft') {
        setSession(data as ActiveSession)
        await loadDraftLines(data.id)
      } else {
        setSession(null)
        setCounts({})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [stationId, scope, loadDraftLines])

  const open = useCallback(
    async (isBaseline: boolean): Promise<boolean> => {
      setBusy(true)
      setError(null)
      const { data, error: rpcErr } = await supabase.rpc('fn_open_stocktake_session', {
        p_station_code: stationCode,
        p_counted_by: countedBy || null,
        p_is_baseline: isBaseline,
        p_scope: scope,
      })
      setBusy(false)
      const res = data as (RpcResult & ActiveSession & { session_id: string }) | null
      if (rpcErr || !res?.ok) {
        setError(rpcErr?.message ?? res?.error ?? 'could not open session')
        return false
      }
      setSession({
        id: res.session_id,
        doc_number: res.doc_number,
        status: 'draft',
        is_baseline: res.is_baseline,
      })
      await loadDraftLines(res.session_id)
      return true
    },
    [stationCode, countedBy, scope, loadDraftLines],
  )

  const record = useCallback(
    async (nomenclatureId: string, qty: number | null) => {
      if (!session) return
      // clearing the field removes the draft line
      if (qty == null || Number.isNaN(qty)) {
        setCounts((c) => {
          const next = { ...c }
          delete next[nomenclatureId]
          return next
        })
        await supabase.rpc('fn_delete_stocktake_line', {
          p_session_id: session.id,
          p_nomenclature_id: nomenclatureId,
        })
        return
      }
      setCounts((c) => ({ ...c, [nomenclatureId]: qty })) // optimistic
      if (savingRef.current.has(nomenclatureId)) return
      savingRef.current.add(nomenclatureId)
      const { data, error: rpcErr } = await supabase.rpc('fn_record_stocktake_line', {
        p_session_id: session.id,
        p_nomenclature_id: nomenclatureId,
        p_counted_qty: qty,
        p_counted_by: countedBy || null,
      })
      savingRef.current.delete(nomenclatureId)
      const res = data as RpcResult | null
      if (rpcErr || !res?.ok) setError(rpcErr?.message ?? res?.error ?? 'could not save count')
    },
    [session, countedBy],
  )

  const apply = useCallback(async (): Promise<{ ok: boolean; variance?: number }> => {
    if (!session) return { ok: false }
    setBusy(true)
    setError(null)
    const { data, error: rpcErr } = await supabase.rpc('fn_apply_stocktake_session', {
      p_session_id: session.id,
      p_applied_by: countedBy || null,
    })
    setBusy(false)
    const res = data as (RpcResult & { variance_value_thb: number }) | null
    if (rpcErr || !res?.ok) {
      setError(rpcErr?.message ?? res?.error ?? 'could not apply')
      return { ok: false }
    }
    setSession(null)
    setCounts({})
    return { ok: true, variance: res.variance_value_thb }
  }, [session, countedBy])

  const cancel = useCallback(async () => {
    if (!session) return
    setBusy(true)
    await supabase.rpc('fn_cancel_stocktake_session', { p_session_id: session.id })
    setBusy(false)
    setSession(null)
    setCounts({})
  }, [session])

  return { session, counts, busy, error, open, record, apply, cancel }
}
