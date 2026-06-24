import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/** One row of v_equipment_maintenance_schedule (one maintenance template × its unit). */
export interface MaintenanceRow {
  equipment_id: string
  equipment_code: string | null
  equipment_name: string
  last_service_date: string | null
  task_id: string
  title: string
  title_th: string | null
  category: string
  priority: string
  recurrence: 'daily' | 'weekly' | 'monthly' | 'none'
  due_time: string | null
  cadence: string
}

export type ServiceStatus = 'ok' | 'warning' | 'overdue'

export interface ScheduleTask {
  taskId: string
  title: string
  titleTh: string | null
  priority: string
}

/** Per-equipment maintenance regimen, grouped by cadence. */
export interface EquipmentSchedule {
  equipmentId: string
  code: string | null
  name: string
  lastServiceDate: string | null
  daysSinceService: number | null
  serviceStatus: ServiceStatus
  daily: ScheduleTask[]
  weekly: ScheduleTask[]
  monthly: ScheduleTask[]
}

const OVERDUE_DAYS = 90
const WARNING_DAYS = 72 // 80% of the overdue threshold — matches useEquipment

/** Service status from the last service date (mirrors useEquipment's thresholds). */
export function serviceStatusFor(
  lastServiceDate: string | null,
  now: number = Date.now(),
): { status: ServiceStatus; days: number | null } {
  if (!lastServiceDate) return { status: 'overdue', days: null }
  const days = Math.floor((now - new Date(lastServiceDate).getTime()) / 86_400_000)
  if (days > OVERDUE_DAYS) return { status: 'overdue', days }
  if (days > WARNING_DAYS) return { status: 'warning', days }
  return { status: 'ok', days }
}

/** Group flat view rows into one entry per equipment, tasks bucketed by cadence. */
export function groupMaintenance(rows: MaintenanceRow[], now: number = Date.now()): EquipmentSchedule[] {
  const map = new Map<string, EquipmentSchedule>()
  for (const r of rows) {
    let g = map.get(r.equipment_id)
    if (!g) {
      const ss = serviceStatusFor(r.last_service_date, now)
      g = {
        equipmentId: r.equipment_id,
        code: r.equipment_code,
        name: r.equipment_name,
        lastServiceDate: r.last_service_date,
        daysSinceService: ss.days,
        serviceStatus: ss.status,
        daily: [],
        weekly: [],
        monthly: [],
      }
      map.set(r.equipment_id, g)
    }
    const task: ScheduleTask = {
      taskId: r.task_id,
      title: r.title,
      titleTh: r.title_th,
      priority: r.priority,
    }
    if (r.recurrence === 'daily') g.daily.push(task)
    else if (r.recurrence === 'weekly') g.weekly.push(task)
    else if (r.recurrence === 'monthly') g.monthly.push(task)
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
}

export interface UseEquipmentMaintenanceResult {
  schedules: EquipmentSchedule[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

/** Reads the per-equipment maintenance regimen (cadence + last service) for the staff view. */
export function useEquipmentMaintenance(): UseEquipmentMaintenanceResult {
  const [schedules, setSchedules] = useState<EquipmentSchedule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const { data, error: fetchError } = await supabase
      .from('v_equipment_maintenance_schedule')
      .select('*')

    if (fetchError) {
      console.error('[useEquipmentMaintenance] fetch error', fetchError)
      setError(fetchError.message)
      setIsLoading(false)
      return
    }
    setSchedules(groupMaintenance((data ?? []) as MaintenanceRow[]))
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { schedules, isLoading, error, refetch: fetchData }
}
