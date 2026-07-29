import { describe, it, expect, vi } from 'vitest'
import { resolveTab } from '../hooks/useTabParam'
import { VIEWS } from './KDSBoard'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
    }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))

describe('KDSBoard views', () => {
  it('hosts both halves of the old split — planning and execution', () => {
    expect([...VIEWS]).toEqual(['schedule', 'cook'])
  })

  it('opens on the schedule, and `?tab=cook` reaches the merged Cook Station', () => {
    // /kitchen/tasks now redirects to /kitchen/schedule?tab=cook, and the
    // stocktake review page links there — if this param stopped resolving, both
    // would silently land on the Gantt instead.
    expect(resolveTab('cook', VIEWS, 'schedule')).toBe('cook')
    expect(resolveTab(null, VIEWS, 'schedule')).toBe('schedule')
    expect(resolveTab('tasks', VIEWS, 'schedule')).toBe('schedule')
  })
})
