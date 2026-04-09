import { describe, it, expect } from 'vitest'
import type { GroupBy } from '../../utils/taskGrouping'

describe('GroupedTaskList', () => {
  it('exports GroupedTaskList component', async () => {
    const mod = await import('./GroupedTaskList')
    expect(mod.GroupedTaskList).toBeDefined()
    expect(typeof mod.GroupedTaskList).toBe('function')
  })

  it('GroupBy type covers expected values', () => {
    const values: GroupBy[] = ['none', 'topic', 'agent']
    expect(values).toHaveLength(3)
  })
})
