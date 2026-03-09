import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type ServiceStatus = 'ok' | 'warning' | 'overdue'

export interface Equipment {
  id: string
  equipment_code: string | null
  name: string
  category: string | null
  last_service_date: string | null
  daily_availability_min: number | null
  serviceStatus: ServiceStatus
  daysSinceService: number | null
}

export interface UseEquipmentResult {
  equipment: Equipment[]
  totalCount: number
  alertCount: number
  isLoading: boolean
  error: string | null
  refetch: () => void
}

const OVERDUE_DAYS = 90
const WARNING_DAYS = 72 // 80% of overdue threshold

function computeServiceStatus(lastServiceDate: string | null): {
  status: ServiceStatus
  days: number | null
} {
  if (!lastServiceDate) return { status: 'overdue', days: null }
  const days = (Date.now() - new Date(lastServiceDate).getTime()) / (1000 * 60 * 60 * 24)
  if (days > OVERDUE_DAYS) return { status: 'overdue', days: Math.floor(days) }
  if (days > WARNING_DAYS) return { status: 'warning', days: Math.floor(days) }
  return { status: 'ok', days: Math.floor(days) }
}

export function useEquipment(): UseEquipmentResult {
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('equipment')
      .select('id, equipment_code, name, category, last_service_date, daily_availability_min')
      .order('last_service_date', { ascending: true, nullsFirst: true })

    if (fetchError) {
      console.error('[useEquipment] fetch error', fetchError)
      setError(fetchError.message)
      setIsLoading(false)
      return
    }

    const mapped: Equipment[] = (data ?? []).map((row) => {
      const { status, days } = computeServiceStatus(row.last_service_date as string | null)
      return {
        id: row.id as string,
        equipment_code: row.equipment_code as string | null,
        name: row.name as string,
        category: row.category as string | null,
        last_service_date: row.last_service_date as string | null,
        daily_availability_min: row.daily_availability_min as number | null,
        serviceStatus: status,
        daysSinceService: days,
      }
    })

    setEquipment(mapped)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const alertCount = equipment.filter((e) => e.serviceStatus !== 'ok').length

  return {
    equipment,
    totalCount: equipment.length,
    alertCount,
    isLoading,
    error,
    refetch: fetchData,
  }
}
