import { describe, it, expect } from 'vitest'
import { isCountableUnit, formatGramsAscii, packQtyLabel, packBatchWeight } from './packLabel'

describe('isCountableUnit', () => {
  it('treats pcs / portion as countable', () => {
    expect(isCountableUnit('pcs')).toBe(true)
    expect(isCountableUnit('portion')).toBe(true)
  })
  it('treats mass / volume / empty as not countable', () => {
    expect(isCountableUnit('kg')).toBe(false)
    expect(isCountableUnit('L')).toBe(false)
    expect(isCountableUnit('g')).toBe(false)
    expect(isCountableUnit(null)).toBe(false)
    expect(isCountableUnit(undefined)).toBe(false)
  })
})

describe('formatGramsAscii', () => {
  it('formats sub-kilogram amounts in grams', () => {
    expect(formatGramsAscii(480)).toBe('480 g')
    expect(formatGramsAscii(60)).toBe('60 g')
  })
  it('formats whole / fractional kilograms', () => {
    expect(formatGramsAscii(2000)).toBe('2 kg')
    expect(formatGramsAscii(1500)).toBe('1.50 kg')
  })
  it('is ASCII-only (no multibyte separators)', () => {
    expect(formatGramsAscii(480)).toMatch(/^[\x20-\x7E]+$/)
  })
})

describe('packQtyLabel', () => {
  it('appends the total weight when per-piece weight is known', () => {
    expect(packQtyLabel(8, 'pcs', 60)).toBe('8 pcs / 480 g')
  })
  it('falls back to the count alone when per-piece weight is missing', () => {
    expect(packQtyLabel(8, 'pcs', null)).toBe('8 pcs')
    expect(packQtyLabel(8, 'pcs', 0)).toBe('8 pcs')
  })
  it('uses an ASCII separator the printer can render', () => {
    expect(packQtyLabel(8, 'pcs', 60)).not.toContain('·')
    expect(packQtyLabel(8, 'pcs', 60)).toMatch(/^[\x20-\x7E]+$/)
  })
})

describe('packBatchWeight', () => {
  it('converts grams to kilograms for a mass base', () => {
    expect(packBatchWeight({ unit: 'kg', isCountable: false, gramsNum: 1500, piecesNum: null })).toBe(1.5)
  })
  it('stores the piece count for a countable base', () => {
    expect(packBatchWeight({ unit: 'pcs', isCountable: true, gramsNum: null, piecesNum: 8 })).toBe(8)
  })
  it('defaults to one unit otherwise (e.g. a volume prep)', () => {
    expect(packBatchWeight({ unit: 'L', isCountable: false, gramsNum: null, piecesNum: null })).toBe(1)
  })
})
