import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Station } from '../types/stations'

/** Active stations, sorted. Stations are the combinable/splittable count
 * scopes (mig 348); each owns a private locations anchor. */
export function useStations() {
  const [stations, setStations] = useState<Station[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStations = useCallback(async () => {
    setIsLoading(true)
    const { data, error: err } = await supabase
      .from('stations')
      .select('id, code, name, name_th, floor, location_id, is_active, sort_order')
      .eq('is_active', true)
      .order('sort_order')
    if (err) {
      setError(err.message)
    } else {
      setError(null)
      setStations((data ?? []) as Station[])
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchStations()
  }, [fetchStations])

  return { stations, isLoading, error, refetch: fetchStations }
}
