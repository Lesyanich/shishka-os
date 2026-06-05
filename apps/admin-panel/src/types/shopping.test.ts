import { describe, it, expect } from 'vitest'
import { SHOPPING_STORES, STORE_LABELS } from './shopping'

describe('shopping types', () => {
  it('every store has a label', () => {
    for (const store of SHOPPING_STORES) {
      expect(STORE_LABELS[store]).toBeTruthy()
    }
  })

  it('includes makro as the default-seedable store', () => {
    expect(SHOPPING_STORES).toContain('makro')
  })
})
