import { describe, it, expect } from 'vitest'
import { stationOf } from './menuStation'
import type { MenuItem } from '../../../hooks/useMenuData'
import type { MenuRecipeStep } from '../../../hooks/useMenuListEnrichment'

function item(kind: MenuItem['kind']): MenuItem {
  // Only the fields stationOf reads matter; cast the rest.
  return { kind } as MenuItem
}

function step(location: string | null, order = 1): MenuRecipeStep {
  return {
    step_order: order,
    operation_name: 'op',
    instruction_text: null,
    location,
  }
}

describe('stationOf', () => {
  it('drinks fall back to L2 only (bar work, never prep)', () => {
    expect(stationOf(item('SALE'), undefined, true)).toEqual({ l1: false, l2: true })
  })

  it('PF prep batches fall back to L1 only', () => {
    expect(stationOf(item('PF'), undefined, false)).toEqual({ l1: true, l2: false })
  })

  it('SALE food falls back to both stations', () => {
    expect(stationOf(item('SALE'), [], false)).toEqual({ l1: true, l2: true })
  })

  it('stationed steps win over the fallback', () => {
    // A food dish whose steps are all Assembly → L2 only, fallback ignored.
    const steps = [step('L2', 1), step('L2', 2)]
    expect(stationOf(item('SALE'), steps, false)).toEqual({ l1: false, l2: true })
  })

  it('mixed steps mark both stations', () => {
    const steps = [step('L1', 1), step('L2', 2)]
    expect(stationOf(item('SALE'), steps, false)).toEqual({ l1: true, l2: true })
  })

  it('unstationed steps (null location) use the fallback', () => {
    const steps = [step(null, 1), step(null, 2)]
    expect(stationOf(item('PF'), steps, false)).toEqual({ l1: true, l2: false })
  })
})
