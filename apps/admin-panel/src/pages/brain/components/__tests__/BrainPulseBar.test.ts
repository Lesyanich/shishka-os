import { describe, it, expect } from 'vitest'
import { BrainPulseBar } from '../BrainPulseBar'

describe('BrainPulseBar', () => {
  it('exports BrainPulseBar component', () => {
    expect(typeof BrainPulseBar).toBe('function')
  })
})
