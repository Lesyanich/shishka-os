import { describe, expect, it } from 'vitest'
import { AVAILABLE_MODELS, DEFAULT_MODEL } from './modelCatalog'

describe('modelCatalog', () => {
  it('exposes available models', () => {
    expect(AVAILABLE_MODELS.length).toBeGreaterThan(0)
    expect(DEFAULT_MODEL).toBeDefined()
  })
})
