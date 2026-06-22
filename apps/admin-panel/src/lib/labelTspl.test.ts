import { describe, it, expect } from 'vitest'
import { renderPrepLabelTSPL } from './labelTspl'

describe('renderPrepLabelTSPL', () => {
  const data = {
    name: 'Aquafaba Mayo (Coconut Oil, Egg-Free)',
    prepDate: new Date('2026-06-15T00:00:00'),
    shelfLifeDays: 3,
    weight: '1.5 kg',
    qr: 'AQUAFA-260615-165659',
    batchCode: 'AQUAFA-260615-165659',
  }

  it('emits a valid TSPL program with size, gap, print', () => {
    const out = renderPrepLabelTSPL(data, { id: '60x40', label: '', wMm: 60, hMm: 40 })
    expect(out).toContain('SIZE 60 mm,40 mm')
    expect(out).toContain('GAP 2 mm,0 mm')
    expect(out.trimEnd().endsWith('PRINT 1,1')).toBe(true)
  })

  it('includes weight, computed use-by, batch code and native QR', () => {
    const out = renderPrepLabelTSPL(data)
    expect(out).toContain('QTY    1.5 kg')
    expect(out).toContain('USE BY 18/06/26') // 15/06 + 3 days
    expect(out).toContain('AQUAFA-260615-165659')
    expect(out).toContain('QRCODE')
  })

  it('shows -- for use-by when shelf life is null', () => {
    const out = renderPrepLabelTSPL({ ...data, shelfLifeDays: null })
    expect(out).toContain('USE BY --')
  })

  it('neutralizes double quotes in the name', () => {
    const out = renderPrepLabelTSPL({ ...data, name: 'A "weird" name' })
    expect(out).not.toContain('"weird"')
  })

  describe('SALE consumer label (nutrition + ingredients)', () => {
    const sale = {
      name: 'Beetroot Hummus',
      prepDate: new Date('2026-06-15T00:00:00'),
      shelfLifeDays: 3,
      weight: '1 pcs',
      qr: 'BEETRO-260615-101010',
      batchCode: 'BEETRO-260615-101010',
      nutrition: { kcal: 343, protein: 14.3, fat: 18.4, carbs: 35.6 },
      ingredients: 'Chickpeas, beetroot, tahini, lemon, garlic, olive oil',
    }

    it('prints compact per-portion nutrition (ASCII)', () => {
      const out = renderPrepLabelTSPL(sale)
      expect(out).toContain('343kcal P14 F18 C36')
    })

    it('prints the ingredient list under an INGREDIENTS heading', () => {
      const out = renderPrepLabelTSPL(sale)
      expect(out).toContain('INGREDIENTS:')
      expect(out).toContain('Chickpeas')
    })

    it('keeps PREP / USE BY dates and batch code', () => {
      const out = renderPrepLabelTSPL(sale)
      expect(out).toContain('USE BY 18/06/26')
      expect(out).toContain('BEETRO-260615-101010')
      expect(out.trimEnd().endsWith('PRINT 1,1')).toBe(true)
    })

    it('omits the QR on the consumer label', () => {
      const out = renderPrepLabelTSPL(sale)
      expect(out).not.toContain('QRCODE')
    })
  })
})
