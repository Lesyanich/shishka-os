import { describe, expect, it } from 'vitest'

describe('PhaseChapter', () => {
  it('exports PhaseChapter component', async () => {
    const mod = await import('../PhaseChapter')
    expect(typeof mod.PhaseChapter).toBe('function')
  })
})
