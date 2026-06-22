import { describe, it, expect } from 'vitest'
import { friendlyStaffError } from './staffErrors'

describe('friendlyStaffError', () => {
  it('explains the credential constraint in plain language', () => {
    const msg = friendlyStaffError({
      message: 'new row for relation "staff" violates check constraint "staff_role_credential_check"',
      code: '23514',
    })
    expect(msg).toMatch(/owners & managers need an email, cooks need a PIN/)
    expect(msg).not.toMatch(/check constraint/) // raw text hidden
  })

  it('maps other data-rule violations (check/fk/unique) generically', () => {
    expect(friendlyStaffError({ code: '23505', message: 'duplicate key' })).toMatch(/data rule/)
    expect(friendlyStaffError({ code: '23503', message: 'fk' })).toMatch(/data rule/)
  })

  it('maps expired-session / permission errors to a reload hint', () => {
    expect(friendlyStaffError({ code: '42501', message: 'permission denied' })).toMatch(/session looks out of date/i)
    expect(friendlyStaffError({ message: 'JWT expired' })).toMatch(/session looks out of date/i)
  })

  it('falls back to a prefixed message, never empty', () => {
    expect(friendlyStaffError({ message: 'boom' })).toBe("Couldn't save: boom")
    expect(friendlyStaffError(null)).toMatch(/Something went wrong/)
    expect(friendlyStaffError({})).toMatch(/Something went wrong/)
  })
})
