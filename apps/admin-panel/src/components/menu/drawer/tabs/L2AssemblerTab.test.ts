import { describe, it, expect } from 'vitest'
import { shelfLifeValid } from './L2AssemblerTab'

describe('L2AssemblerTab', () => {
  it('exports L2AssemblerTab component', async () => {
    const mod = await import('./L2AssemblerTab')
    expect(mod.L2AssemblerTab).toBeDefined()
  })
})

describe('shelfLifeValid', () => {
  it('accepts an absent shelf life — not every dish has one', () => {
    expect(shelfLifeValid(null)).toBe(true)
  })

  it('accepts whole days inside 1–365', () => {
    expect(shelfLifeValid(1)).toBe(true)
    expect(shelfLifeValid(3)).toBe(true)
    expect(shelfLifeValid(10)).toBe(true) // the sous-vide ceiling
    expect(shelfLifeValid(365)).toBe(true)
  })

  it('rejects the slips that would print a wrong use-by date', () => {
    expect(shelfLifeValid(0)).toBe(false)
    expect(shelfLifeValid(-1)).toBe(false)
    expect(shelfLifeValid(2.5)).toBe(false)
    expect(shelfLifeValid(900)).toBe(false)
    expect(shelfLifeValid(Number.NaN)).toBe(false)
  })
})
