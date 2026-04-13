import { describe, it, expect } from 'vitest'
import type { ProductionTask } from './tasks'

describe('ProductionTask type', () => {
  it('satisfies interface', () => {
    const t: ProductionTask = {
      id: '1', description: null, status: 'pending',
      scheduled_start: null, duration_min: null, equipment_id: null,
      actual_start: null, actual_end: null, actual_weight: null,
      gross_weight: null, theoretical_yield: null,
      target_nomenclature_id: null, target_quantity: null,
      assigned_to: null, schedule_run_id: null, parent_target_id: null,
      target_nomenclature: null,
    }
    expect(t.status).toBe('pending')
  })
})
