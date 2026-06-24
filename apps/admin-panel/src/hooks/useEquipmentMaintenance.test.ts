import { describe, it, expect } from 'vitest'
import { groupMaintenance, serviceStatusFor, type MaintenanceRow } from './useEquipmentMaintenance'

const NOW = new Date('2026-06-24T00:00:00Z').getTime()

function row(over: Partial<MaintenanceRow> = {}): MaintenanceRow {
  return {
    equipment_id: 'e1', equipment_code: 'EQ-1', equipment_name: 'Open fridge',
    last_service_date: null, task_id: 't1', title: 'x', title_th: null,
    category: 'cleaning', priority: 'high', recurrence: 'weekly', due_time: '10:00',
    cadence: 'Weekly', ...over,
  }
}

describe('serviceStatusFor', () => {
  it('treats never-serviced as overdue', () => {
    expect(serviceStatusFor(null, NOW)).toEqual({ status: 'overdue', days: null })
  })
  it('recent service is ok', () => {
    expect(serviceStatusFor('2026-06-20', NOW)).toEqual({ status: 'ok', days: 4 })
  })
  it('72–90 days is a warning', () => {
    expect(serviceStatusFor('2026-04-08', NOW).status).toBe('warning')
  })
  it('over 90 days is overdue', () => {
    expect(serviceStatusFor('2026-01-01', NOW).status).toBe('overdue')
  })
})

describe('groupMaintenance', () => {
  it('buckets a unit\'s tasks by cadence and computes status', () => {
    const out = groupMaintenance(
      [
        row({ recurrence: 'daily', task_id: 'd1', title: 'wipe' }),
        row({ recurrence: 'weekly', task_id: 'w1', title: 'deep clean' }),
        row({ recurrence: 'monthly', task_id: 'm1', title: 'descale' }),
      ],
      NOW,
    )
    expect(out).toHaveLength(1)
    expect(out[0].daily.map((t) => t.title)).toEqual(['wipe'])
    expect(out[0].weekly.map((t) => t.title)).toEqual(['deep clean'])
    expect(out[0].monthly.map((t) => t.title)).toEqual(['descale'])
    expect(out[0].serviceStatus).toBe('overdue') // last_service_date null
  })

  it('groups by equipment and sorts by name', () => {
    const out = groupMaintenance(
      [
        row({ equipment_id: 'b', equipment_name: 'Zebra unit' }),
        row({ equipment_id: 'a', equipment_name: 'Alpha unit' }),
      ],
      NOW,
    )
    expect(out.map((g) => g.name)).toEqual(['Alpha unit', 'Zebra unit'])
  })
})
