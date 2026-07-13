import { describe, expect, it } from 'vitest'
import { StocktakeSessionsPanel } from './StocktakeSessionsPanel'

describe('StocktakeSessionsPanel', () => {
  it('exports a component function', () => {
    expect(typeof StocktakeSessionsPanel).toBe('function')
    expect(StocktakeSessionsPanel.name).toBe('StocktakeSessionsPanel')
  })
})
