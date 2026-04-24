import { describe, expect, it } from 'vitest'
import { computeCountdown } from '../BeforeRecipeLock'

describe('BeforeRecipeLock', () => {
  it('exports BeforeRecipeLock component', async () => {
    const mod = await import('../BeforeRecipeLock')
    expect(typeof mod.BeforeRecipeLock).toBe('function')
  })

  describe('computeCountdown', () => {
    it('counts down to Bangkok 9AM lock', () => {
      // One hour before lock (08:00 ICT = 01:00 UTC on the same day)
      const oneHourBefore = new Date('2026-04-28T01:00:00Z')
      const cd = computeCountdown('2026-04-28', oneHourBefore)
      expect(cd.elapsed).toBe(false)
      expect(cd.days).toBe(0)
      expect(cd.hours).toBe(1)
      expect(cd.minutes).toBe(0)
      expect(cd.seconds).toBe(0)
    })

    it('marks elapsed once lock passes', () => {
      const after = new Date('2026-04-28T02:01:00Z') // one minute past lock
      const cd = computeCountdown('2026-04-28', after)
      expect(cd.elapsed).toBe(true)
      expect(cd.days).toBe(0)
      expect(cd.hours).toBe(0)
      expect(cd.minutes).toBe(0)
      expect(cd.seconds).toBe(0)
    })

    it('renders multi-day remaining correctly', () => {
      // 4 days and 2 hours before: 2026-04-24T00:00:00Z → lock 2026-04-28T02:00:00Z
      const now = new Date('2026-04-24T00:00:00Z')
      const cd = computeCountdown('2026-04-28', now)
      expect(cd.days).toBe(4)
      expect(cd.hours).toBe(2)
      expect(cd.elapsed).toBe(false)
    })
  })
})
