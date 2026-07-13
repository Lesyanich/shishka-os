import { describe, it, expect } from 'vitest'
import { useThawBatch } from './useThawBatch'

describe('useThawBatch', () => {
  it('exports useThawBatch hook', () => {
    expect(typeof useThawBatch).toBe('function')
  })
})
