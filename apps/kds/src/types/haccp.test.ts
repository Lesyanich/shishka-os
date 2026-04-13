import { describe, it, expect } from 'vitest'
import type { HACCPLog, WasteEntry } from './haccp'

describe('HACCP types', () => {
  it('HACCPLog satisfies interface', () => {
    const h: HACCPLog = {
      id: '1', production_task_id: '2', recipe_flow_id: '3',
      step_order: 1, checkpoint_type: 'temperature',
      expected_value: 75, tolerance: 2, actual_value: 76,
      passed: true, recorded_by: '4', photo_url: null,
      notes: null, recorded_at: '2026-01-01',
    }
    expect(h.passed).toBe(true)
  })

  it('WasteEntry satisfies interface', () => {
    const w: WasteEntry = {
      id: '1', production_task_id: '2', waste_type: 'prep_waste',
      gross_weight: 10, net_weight: 8, waste_pct: 20,
      norm_waste_pct: 15, variance_flag: true,
      recorded_by: '3', notes: null, created_at: '2026-01-01',
    }
    expect(w.waste_type).toBe('prep_waste')
  })
})
