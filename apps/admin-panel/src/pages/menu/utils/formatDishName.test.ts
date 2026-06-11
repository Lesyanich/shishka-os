import { describe, expect, it } from 'vitest'
import { formatDishName } from './formatDishName'

describe('formatDishName', () => {
  it('prefixes the staff code before the name', () => {
    expect(formatDishName('S-1', 'Mango Smoothie')).toBe('S-1 Mango Smoothie')
    expect(formatDishName('M-12', "Za'atar Manakish")).toBe("M-12 Za'atar Manakish")
  })

  it('returns the bare name when there is no staff code', () => {
    expect(formatDishName(null, 'Mango Smoothie')).toBe('Mango Smoothie')
    expect(formatDishName(undefined, 'Mango Smoothie')).toBe('Mango Smoothie')
    expect(formatDishName('', 'Mango Smoothie')).toBe('Mango Smoothie')
  })
})
