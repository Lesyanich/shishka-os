import { describe, it, expect } from 'vitest'
import { deriveAuthStatus, type StaffCard } from './use-staff-cards'

const base: StaffCard = {
  id: 'x',
  name: 'X',
  name_th: null,
  role: 'cook',
  app_role: 'cook',
  phone: null,
  is_active: true,
  monthly_salary: null,
  hire_date: null,
  fire_date: null,
  employment_type: null,
  nationality: null,
  work_permit_number: null,
  work_permit_expiry: null,
  sso_number: null,
  tax_id: null,
  probation_end_date: null,
  created_at: '',
  email: null,
  pin_set_at: null,
  auth_user_id: null,
}

describe('useStaffCards', () => {
  it('exports useStaffCards hook', async () => {
    const mod = await import('./use-staff-cards')
    expect(mod.useStaffCards).toBeDefined()
    expect(typeof mod.useStaffCards).toBe('function')
  })

  it('exports the auth-mutation surface', async () => {
    const mod = await import('./use-staff-cards')
    expect(typeof mod.deriveAuthStatus).toBe('function')
  })
})

describe('deriveAuthStatus', () => {
  it('returns no_login when staff is not linked', () => {
    expect(deriveAuthStatus({ ...base, auth_user_id: null })).toBe('no_login')
  })

  it('returns linked for owner-tier staff with an auth user', () => {
    expect(
      deriveAuthStatus({ ...base, app_role: 'owner', auth_user_id: 'u1' }),
    ).toBe('linked')
  })

  it('returns pin_only for cook-tier staff with an auth user', () => {
    expect(
      deriveAuthStatus({ ...base, app_role: 'cook', auth_user_id: 'u1' }),
    ).toBe('pin_only')
  })
})
