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
})
