import { describe, it, expect } from 'vitest'
import type { StaffMember } from './staff'

describe('StaffMember type', () => {
  it('satisfies interface', () => {
    const s: StaffMember = {
      id: '1', name: 'Test', name_th: null, role: 'cook',
      preferred_language: 'en', skill_level: 2, assigned_zone_id: null,
    }
    expect(s.id).toBe('1')
  })
})
