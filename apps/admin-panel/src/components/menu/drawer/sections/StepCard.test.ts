import { describe, it, expect } from 'vitest'
import { StepCard, formatTime, equipEmoji } from './StepCard'

describe('StepCard', () => {
  it('exports the StepCard component', () => {
    expect(typeof StepCard).toBe('function')
  })

  it('formatTime renders minutes and hours', () => {
    expect(formatTime(5)).toBe('5m')
    expect(formatTime(60)).toBe('1h')
    expect(formatTime(90)).toBe('1h 30m')
  })

  it('equipEmoji falls back to a hand for unknown categories', () => {
    expect(equipEmoji('cooking')).toBe('🔥')
    expect(equipEmoji(null)).toBe('✋')
    expect(equipEmoji('nonsense')).toBe('✋')
  })
})
