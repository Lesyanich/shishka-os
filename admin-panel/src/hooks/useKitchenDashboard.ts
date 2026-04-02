import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface DashboardShift {
  id: string
  staff_id: string
  shift_date: string
  start_time: string
  end_time: string
  break_minutes: number
  status: string
  notes: string | null
  staff: { name: string; name_th: string | null; role: string } | null
}

export interface DashboardShiftTask {
  id: string
  shift_id: string
  equipment_id: string | null
  task_description: string | null
  start_time: string
  end_time: string
  priority: number
  status: string
  shift: { staff_id: string; staff: { name: string; role: string } | null } | null
  equipment: { name: string } | null
}

export interface DashboardEquipmentSlot {
  id: string
  equipment_id: string
  slot_date: string
  start_time: string
  end_time: string
  label: string | null
  shift_task_id: string | null
  production_task_id: string | null
  equipment: { name: string; category: string | null } | null
}

export interface UseKitchenDashboardResult {
  shifts: DashboardShift[]
  tasks: DashboardShiftTask[]
  equipmentSlots: DashboardEquipmentSlot[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useKitchenDashboard(date?: string): UseKitchenDashboardResult {
  const [shifts, setShifts] = useState<DashboardShift[]>([])
  const [tasks, setTasks] = useState<DashboardShiftTask[]>([])
  const [equipmentSlots, setEquipmentSlots] = useState<DashboardEquipmentSlot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const targetDate = date ?? new Date().toISOString().split('T')[0]

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const [shiftsRes, tasksRes, slotsRes] = await Promise.all([
      supabase
        .from('shifts')
        .select('id, staff_id, shift_date, start_time, end_time, break_minutes, status, notes, staff(name, name_th, role)')
        .eq('shift_date', targetDate)
        .order('start_time', { ascending: true }),

      supabase
        .from('shift_tasks')
        .select('id, shift_id, equipment_id, task_description, start_time, end_time, priority, status, shift:shifts!shift_id(staff_id, staff(name, role)), equipment(name)')
        .eq('shift:shifts.shift_date' as string, targetDate)
        .order('start_time', { ascending: true }),

      supabase
        .from('equipment_slots')
        .select('id, equipment_id, slot_date, start_time, end_time, label, shift_task_id, production_task_id, equipment(name, category)')
        .eq('slot_date', targetDate)
        .order('start_time', { ascending: true }),
    ])

    if (shiftsRes.error) {
      console.error('[useKitchenDashboard] shifts error', shiftsRes.error)
      setError(shiftsRes.error.message)
      setIsLoading(false)
      return
    }

    if (tasksRes.error) {
      console.error('[useKitchenDashboard] tasks error', tasksRes.error)
      setError(tasksRes.error.message)
      setIsLoading(false)
      return
    }

    if (slotsRes.error) {
      console.error('[useKitchenDashboard] slots error', slotsRes.error)
      setError(slotsRes.error.message)
      setIsLoading(false)
      return
    }

    setShifts((shiftsRes.data ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      staff: row.staff as DashboardShift['staff'],
    })) as DashboardShift[])

    setTasks((tasksRes.data ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      shift: row.shift as DashboardShiftTask['shift'],
      equipment: row.equipment as DashboardShiftTask['equipment'],
    })) as DashboardShiftTask[])

    setEquipmentSlots((slotsRes.data ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      equipment: row.equipment as DashboardEquipmentSlot['equipment'],
    })) as DashboardEquipmentSlot[])

    setIsLoading(false)
  }, [targetDate])

  // Realtime: re-fetch on any change to shifts, shift_tasks, or equipment_slots
  useEffect(() => {
    fetchData()

    const channel = supabase
      .channel('kitchen-dashboard')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        () => { fetchData() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shift_tasks' },
        () => { fetchData() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'equipment_slots' },
        () => { fetchData() },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchData])

  return {
    shifts,
    tasks,
    equipmentSlots,
    isLoading,
    error,
    refetch: fetchData,
  }
}
