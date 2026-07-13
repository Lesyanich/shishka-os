import { describe, expect, it } from 'vitest'
import { useStocktakeSession } from './useStocktakeSession'

describe('useStocktakeSession', () => {
  it('exports a hook function', () => {
    expect(typeof useStocktakeSession).toBe('function')
    expect(useStocktakeSession.name).toBe('useStocktakeSession')
  })
})
