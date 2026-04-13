export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export interface ProductionTask {
  id: string
  description: string | null
  status: TaskStatus
  scheduled_start: string | null
  duration_min: number | null
  equipment_id: string | null
  actual_start: string | null
  actual_end: string | null
  actual_weight: number | null
  gross_weight: number | null
  theoretical_yield: number | null
  target_nomenclature_id: string | null
  target_quantity: number | null
  assigned_to: string | null
  schedule_run_id: string | null
  parent_target_id: string | null
  target_nomenclature: { name: string; product_code: string } | null
}
