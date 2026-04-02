import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface EquipmentSlot {
  id: string
  equipment_id: string
  slot_date: string
  start_time: string
  end_time: string
  shift_task_id: string | null
  production_task_id: string | null
  label: string | null
  created_at: string
  equipment?: { name: string } | null
}

export interface EquipmentSlotInsert {
  equipment_id: string
  slot_date: string
  start_time: string
  end_time: string
  shift_task_id?: string | null
  production_task_id?: string | null
  label?: string | null
}

export interface EquipmentSlotUpdate {
  equipment_id?: string
  slot_date?: string
  start_time?: string
  end_time?: string
  shift_task_id?: string | null
  production_task_id?: string | null
  label?: string | null
}

export interface UseEquipmentSlotsResult {
  slots: EquipmentSlot[]
  isLoading: boolean
  error: string | null
  refetch: () => void
  createSlot: (data: EquipmentSlotInsert) => Promise<EquipmentSlot | null>
  updateSlot: (id: string, data: EquipmentSlotUpdate) => Promise<EquipmentSlot | null>
  deleteSlot: (id: string) => Promise<boolean>
}

export function useEquipmentSlots(dateFilter?: string): UseEquipmentSlotsResult {
  const [slots, setSlots] = useState<EquipmentSlot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    let query = supabase
      .from('equipment_slots')
      .select('id, equipment_id, slot_date, start_time, end_time, shift_task_id, production_task_id, label, created_at, equipment(name)')
      .order('start_time', { ascending: true })

    if (dateFilter) {
      query = query.eq('slot_date', dateFilter)
    }

    const { data, error: fetchError } = await query

    if (fetchError) {
      console.error('[useEquipmentSlots] fetch error', fetchError)
      setError(fetchError.message)
      setIsLoading(false)
      return
    }

    const mapped = (data ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      equipment: row.equipment as EquipmentSlot['equipment'],
    })) as EquipmentSlot[]

    setSlots(mapped)
    setIsLoading(false)
  }, [dateFilter])

  // Supabase Realtime subscription
  useEffect(() => {
    fetchData()

    const channel = supabase
      .channel('equipment-slots-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'equipment_slots',
        },
        () => {
          fetchData()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchData])

  const createSlot = useCallback(async (input: EquipmentSlotInsert): Promise<EquipmentSlot | null> => {
    const { data, error: insertError } = await supabase
      .from('equipment_slots')
      .insert(input)
      .select()
      .single()

    if (insertError) {
      console.error('[useEquipmentSlots] insert error', insertError)
      setError(insertError.message)
      return null
    }

    return data as EquipmentSlot
  }, [])

  const updateSlot = useCallback(async (id: string, input: EquipmentSlotUpdate): Promise<EquipmentSlot | null> => {
    const { data, error: updateError } = await supabase
      .from('equipment_slots')
      .update(input)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('[useEquipmentSlots] update error', updateError)
      setError(updateError.message)
      return null
    }

    return data as EquipmentSlot
  }, [])

  const deleteSlot = useCallback(async (id: string): Promise<boolean> => {
    const { error: deleteError } = await supabase
      .from('equipment_slots')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('[useEquipmentSlots] delete error', deleteError)
      setError(deleteError.message)
      return false
    }

    return true
  }, [])

  return {
    slots,
    isLoading,
    error,
    refetch: fetchData,
    createSlot,
    updateSlot,
    deleteSlot,
  }
}
