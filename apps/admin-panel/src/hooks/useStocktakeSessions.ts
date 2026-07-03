import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { StocktakeSession } from '../types/stations'

const SELECT_COLS =
  'id, doc_number, station_id, status, is_baseline, scope, counted_by, opened_at, ' +
  'submitted_at, applied_at, applied_by, entries_count, variance_value_thb, notes'

/** Stocktake session documents (mig 349), newest first — the audit trail. */
export function useStocktakeSessions(limit = 30) {
  const [sessions, setSessions] = useState<StocktakeSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSessions = useCallback(async () => {
    setIsLoading(true)
    const { data, error: err } = await supabase
      .from('stocktake_sessions')
      .select(SELECT_COLS)
      .order('opened_at', { ascending: false })
      .limit(limit)
    if (err) {
      setError(err.message)
    } else {
      setError(null)
      setSessions(
        ((data ?? []) as unknown as (StocktakeSession & { variance_value_thb: number | string | null })[]).map(
          (s) => ({
            ...s,
            variance_value_thb:
              s.variance_value_thb != null ? Number(s.variance_value_thb) : null,
          }),
        ),
      )
    }
    setIsLoading(false)
  }, [limit])

  useEffect(() => {
    fetchSessions()
    const channel = supabase
      .channel('stocktake-sessions-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stocktake_sessions' },
        () => fetchSessions(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchSessions])

  return { sessions, isLoading, error, refetch: fetchSessions }
}
