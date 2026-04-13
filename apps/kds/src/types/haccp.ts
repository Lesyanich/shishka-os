export type HACCPCheckpointType = 'temperature' | 'sanitation' | 'visual' | 'weight'

export interface HACCPLog {
  id: string
  production_task_id: string
  recipe_flow_id: string
  step_order: number
  checkpoint_type: HACCPCheckpointType
  expected_value: number | null
  tolerance: number | null
  actual_value: number | null
  passed: boolean
  recorded_by: string
  photo_url: string | null
  notes: string | null
  recorded_at: string
}

export type WasteType = 'prep_waste' | 'spoilage' | 'human_error' | 'rework'

export interface WasteEntry {
  id: string
  production_task_id: string
  waste_type: WasteType
  gross_weight: number
  net_weight: number
  waste_pct: number
  norm_waste_pct: number | null
  variance_flag: boolean
  recorded_by: string
  notes: string | null
  created_at: string
}
