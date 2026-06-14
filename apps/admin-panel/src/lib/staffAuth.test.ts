import { describe, it, expect } from 'vitest'
import { staffNameToEmail, STAFF_EMAIL_DOMAIN } from './staffAuth'

describe('staffNameToEmail', () => {
  it('maps a plain name to a synthetic staff email', () => {
    expect(staffNameToEmail('Alex')).toBe(`alex@${STAFF_EMAIL_DOMAIN}`)
    expect(staffNameToEmail('Hein')).toBe(`hein@${STAFF_EMAIL_DOMAIN}`)
    expect(staffNameToEmail('Mint')).toBe(`mint@${STAFF_EMAIL_DOMAIN}`)
  })

  it('is case-insensitive and trims/strips non-alphanumerics', () => {
    expect(staffNameToEmail('  ALEX  ')).toBe(`alex@${STAFF_EMAIL_DOMAIN}`)
    expect(staffNameToEmail('Al ex')).toBe(`alex@${STAFF_EMAIL_DOMAIN}`)
  })
})
