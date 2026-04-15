import { describe, expect, it } from 'vitest'
import { useDishDetail } from './useDishDetail'

describe('useDishDetail', () => {
  it('exports the hook', () => {
    expect(typeof useDishDetail).toBe('function')
  })
})
