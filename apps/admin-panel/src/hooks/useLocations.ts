import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type LocationType = 'kitchen' | 'assembly' | 'storage' | 'delivery'

export interface Location {
  id: string
  name: string
  type: LocationType
}

export interface UseLocationsResult {
  locations: Location[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useLocations(): UseLocationsResult {
  const [locations, setLocations] = useState<Location[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLocations = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('locations')
      .select('id, name, type')
      .order('name', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setLocations((data ?? []) as Location[])
    }

    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchLocations()
  }, [fetchLocations])

  return { locations, isLoading, error, refetch: fetchLocations }
}
