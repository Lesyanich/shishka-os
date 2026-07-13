import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  compareChecklistRows,
  normalizeChecklistRow,
  type RawChecklistRow,
  type StationChecklistRow,
} from '../types/stations'

const SELECT_COLS =
  'station_id, station_code, nomenclature_id, product_code, name, base_unit, type, ' +
  'item_kind, cost_per_unit, count_class, batch_on_hand, next_expiry, expiring_soon, ' +
  'expired, last_count, last_count_at, min_stock, par_stock, is_due_today'

/** Auto-derived count checklist for one station (v_station_checklist, mig 351).
 * Pass null to skip fetching (no station selected). */
export function useStationChecklist(stationId: string | null) {
  const [rows, setRows] = useState<StationChecklistRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // background=true keeps the current rows on screen while re-fetching, so an
  // inline Min/Par/count save refreshes the numbers without blanking the whole
  // table to a spinner (the "page reloads on every edit" symptom).
  const fetchRows = useCallback(
    async (background = false) => {
      if (!stationId) {
        setRows([])
        return
      }
      if (!background) setIsLoading(true)
      setError(null)
      const { data, error: err } = await supabase
        .from('v_station_checklist')
        .select(SELECT_COLS)
        .eq('station_id', stationId)
      if (err) {
        setError(err.message)
        setIsLoading(false)
        return
      }
      // View isn't in generated DB types — cast through unknown (house pattern).
      setRows(
        ((data ?? []) as unknown as RawChecklistRow[])
          .map(normalizeChecklistRow)
          .sort(compareChecklistRows),
      )
      setIsLoading(false)
    },
    [stationId],
  )

  useEffect(() => {
    void fetchRows()
  }, [fetchRows])

  const refetch = useCallback(() => fetchRows(true), [fetchRows])

  const { dueCount, foodCount, packagingCount } = useMemo(() => {
    let due = 0
    let food = 0
    let pkg = 0
    for (const r of rows) {
      if (r.is_due_today) due += 1
      if (r.item_kind === 'food') food += 1
      else pkg += 1
    }
    return { dueCount: due, foodCount: food, packagingCount: pkg }
  }, [rows])

  return { rows, isLoading, error, refetch, dueCount, foodCount, packagingCount }
}
