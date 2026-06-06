import { describe, it, expect } from 'vitest'
import { supabase } from './supabase.ts'

describe('supabase anon client', () => {
  it('exposes a usable query builder', () => {
    expect(supabase).toBeDefined()
    expect(typeof supabase.from).toBe('function')
    expect(typeof supabase.from('v_public_menu').select).toBe('function')
  })
})
