import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { EquipmentBooking } from '../types/scheduling'

interface BookingWithEquipment extends EquipmentBooking {
  equipment?: { name: string; category: string }
}

export interface UseEquipmentBookingsResult {
  bookings: BookingWithEquipment[]
  byEquipment: Record<string, BookingWithEquipment[]>
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useEquipmentBookings(date: string): UseEquipmentBookingsResult {
  const [bookings, setBookings] = useState<BookingWithEquipment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBookings = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const dayStart = `${date}T00:00:00`
    const dayEnd = `${date}T23:59:59`

    const { data, error: fetchError } = await supabase
      .from('equipment_bookings')
      .select('*, equipment!equipment_id(name, category)')
      .gte('slot_start', dayStart)
      .lte('slot_start', dayEnd)
      .order('slot_start', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      const mapped = (data ?? []).map((row: Record<string, unknown>) => ({
        ...row,
        equipment: row.equipment as BookingWithEquipment['equipment'],
      })) as unknown as BookingWithEquipment[]
      setBookings(mapped)
    }
    setIsLoading(false)
  }, [date])

  useEffect(() => {
    fetchBookings()
    const channel = supabase
      .channel(`bookings-${date}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment_bookings' }, () => { fetchBookings() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [date, fetchBookings])

  // Group by equipment
  const byEquipment: Record<string, BookingWithEquipment[]> = {}
  for (const b of bookings) {
    if (!byEquipment[b.equipment_id]) byEquipment[b.equipment_id] = []
    byEquipment[b.equipment_id].push(b)
  }

  return { bookings, byEquipment, isLoading, error, refetch: fetchBookings }
}
