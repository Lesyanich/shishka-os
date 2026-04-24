import { describe, expect, it } from 'vitest'

describe('PhaseTaskList', () => {
  it('exports PhaseTaskList component', async () => {
    const mod = await import('../PhaseTaskList')
    expect(typeof mod.PhaseTaskList).toBe('function')
  })
})
