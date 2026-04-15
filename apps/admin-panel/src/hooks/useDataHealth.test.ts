import { describe, it, expect } from 'vitest'
import type { HealthMetric, HealthMetricKey, HealthSeverity } from './useDataHealth'

// Smoke stubs — the hook binds directly to Supabase; integration covered in UI.
describe('useDataHealth types', () => {
  it('severity and metric keys are assignable', () => {
    const sev: HealthSeverity = 'error'
    const key: HealthMetricKey = 'type_mismatch'
    const metric: HealthMetric = {
      metric: key,
      severity: sev,
      val: 0,
      health_score: 100,
    }
    expect(metric.val).toBe(0)
    expect(metric.health_score).toBe(100)
  })
})
