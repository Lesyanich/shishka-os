import { describe, expect, it } from 'vitest'
import { productCodeFromName, useCreateDish } from './useCreateDish'

describe('useCreateDish', () => {
  it('exports the hook', () => {
    expect(typeof useCreateDish).toBe('function')
  })

  it('generates SALE- product codes from mixed-alphabet names', () => {
    expect(productCodeFromName('Borsch Bio-Active')).toBe('SALE-BORSCH_BIO_ACTIVE')
    expect(productCodeFromName('Борщ с говядиной')).toBe('SALE-BORSCH_S_GOVYADINOY')
    expect(productCodeFromName('  Poke  Salmon  ')).toBe('SALE-POKE_SALMON')
    expect(productCodeFromName('')).toBe('SALE-')
  })
})
