import { describe, it, expect } from 'vitest'
import { containsCyrillic, transliterate } from '../_translit'

describe('containsCyrillic', () => {
  it('returns true for Russian text', () => {
    expect(containsCyrillic('манакиш')).toBe(true)
    expect(containsCyrillic('Манакиш с мясом')).toBe(true)
  })

  it('returns false for pure Latin', () => {
    expect(containsCyrillic('Manakish Beef (GF)')).toBe(false)
    expect(containsCyrillic('SALE-MANAISH_BEEF_GF')).toBe(false)
  })

  it('returns true for mixed scripts', () => {
    expect(containsCyrillic('Manakish мясо')).toBe(true)
  })

  it('handles empty string', () => {
    expect(containsCyrillic('')).toBe(false)
  })

  it('detects ё (yo) which is sometimes excluded from а-я ranges', () => {
    expect(containsCyrillic('ёлка')).toBe(true)
  })
})

describe('transliterate', () => {
  it('transliterates the dish names CEO actually asked about', () => {
    expect(transliterate('манакиш')).toBe('manakish')
    expect(transliterate('манаиш')).toBe('manaish')
    expect(transliterate('борщ')).toBe('borshch')
  })

  it('preserves Latin chars verbatim', () => {
    expect(transliterate('Manakish Beef (GF)')).toBe('Manakish Beef (GF)')
  })

  it('handles mixed scripts and whitespace', () => {
    expect(transliterate('манаиш с мясом')).toBe('manaish s myasom')
  })

  it('handles uppercase first letter (best-effort case preservation)', () => {
    expect(transliterate('Манакиш')).toBe('Manakish')
    expect(transliterate('Шеф')).toBe('Shef')
  })

  it('drops soft and hard signs', () => {
    expect(transliterate('объект')).toBe('obekt')
    expect(transliterate('пельмень')).toBe('pelmen')
  })

  it('returns empty string for empty input', () => {
    expect(transliterate('')).toBe('')
  })

  it('preserves numbers and punctuation', () => {
    expect(transliterate('борщ-2')).toBe('borshch-2')
    expect(transliterate('хлеб (1кг)')).toBe('khleb (1kg)')
  })
})
