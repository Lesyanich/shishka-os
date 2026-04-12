import { describe, it, expect } from 'vitest'
import { fetchBrainPulse } from '../brainPulse'

describe('brainPulse', () => {
  it('exports fetchBrainPulse function', () => {
    expect(typeof fetchBrainPulse).toBe('function')
  })
})
