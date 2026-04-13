// types/scheduling.ts — Scheduling domain types matching DB schema

export type Channel = 'dine_in' | 'delivery' | 'retail_L2' | 'catering'
export type TargetStatus = 'draft' | 'confirmed' | 'scheduled'
export type ScheduleRunStatus = 'draft' | 'active' | 'archived'
export type ProductCategory = 'fish' | 'meat' | 'poultry' | 'dairy' | 'bakery' | 'vegan' | 'neutral'

export interface ProductionTarget {
  id: string
  date: string
  nomenclature_id: string
  channel: Channel
  target_qty: number
  deadline_at: string
  location_id: string | null
  created_by: string | null
  status: TargetStatus
  created_at: string
  updated_at: string
  // joined
  nomenclature?: { name: string; product_code: string }
  location?: { name: string }
}

export interface ScheduleRun {
  id: string
  date: string
  generated_at: string
  generated_by: string | null
  config_snapshot: {
    date: string
    conflicts: ScheduleConflict[]
    generated_at: string
  } | null
  task_count: number
  conflict_count: number
  status: ScheduleRunStatus
}

export interface ScheduleConflict {
  step: string
  equipment_id: string
  desired_start: string
  actual_start: string
  buffer_reason: string
}

export interface EquipmentBooking {
  id: string
  equipment_id: string
  production_task_id: string | null
  slot_start: string
  slot_end: string
  capacity_used: number
  product_category: string | null
}

export interface ScheduleResult {
  ok: boolean
  run_id: string
  task_count: number
  conflict_count: number
  conflicts: ScheduleConflict[]
}

export interface StaffAssignResult {
  ok: boolean
  assigned: number
  unassigned: number
}
