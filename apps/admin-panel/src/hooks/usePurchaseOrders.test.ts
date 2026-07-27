import { describe, it, expect } from 'vitest'
import { stageOf, isNewForMe } from './usePurchaseOrders'

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

describe('stageOf', () => {
  it('collapses the eight statuses onto the five desk stages', () => {
    expect(stageOf('draft')).toBe('draft')
    expect(stageOf('submitted')).toBe('waiting')
    expect(stageOf('confirmed')).toBe('delivery')
    expect(stageOf('shipped')).toBe('delivery')
    expect(stageOf('partially_received')).toBe('receive')
    expect(stageOf('received')).toBe('receive')
    expect(stageOf('reconciled')).toBe('done')
    expect(stageOf('cancelled')).toBe('done')
  })
})

describe('isNewForMe', () => {
  const submittedByOther = { id: 'po-1', status: 'submitted' as const, created_by: OTHER }

  it('flags an order the other side just handed over', () => {
    expect(isNewForMe(submittedByOther, ME, new Set())).toBe(true)
  })

  it('stops flagging once the order has been opened', () => {
    expect(isNewForMe(submittedByOther, ME, new Set(['po-1']))).toBe(false)
  })

  it('never flags my own order — the badge means "for you"', () => {
    expect(isNewForMe({ ...submittedByOther, created_by: ME }, ME, new Set())).toBe(false)
  })

  it('only fires on submitted — a draft is invisible to the other side', () => {
    expect(isNewForMe({ ...submittedByOther, status: 'draft' }, ME, new Set())).toBe(false)
    expect(isNewForMe({ ...submittedByOther, status: 'confirmed' }, ME, new Set())).toBe(false)
  })

  it('stays quiet when either identity is unknown', () => {
    expect(isNewForMe(submittedByOther, null, new Set())).toBe(false)
    expect(isNewForMe({ ...submittedByOther, created_by: null }, ME, new Set())).toBe(false)
  })
})
