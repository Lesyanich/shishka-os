import { describe, expect, it } from 'vitest'
import { useStocktakeSessions } from './useStocktakeSessions'

describe('useStocktakeSessions', () => {
  it('exports a hook function', () => {
    expect(typeof useStocktakeSessions).toBe('function')
    expect(useStocktakeSessions.name).toBe('useStocktakeSessions')
  })
})
