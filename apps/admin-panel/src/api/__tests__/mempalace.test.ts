import { describe, it, expect } from 'vitest'
import { getBaseUrl, MemPalaceError } from '../mempalace'

describe('mempalace API client', () => {
  it('exports getBaseUrl', () => {
    expect(typeof getBaseUrl).toBe('function')
  })

  it('MemPalaceError has correct name', () => {
    const err = new MemPalaceError('test', 500, '')
    expect(err.name).toBe('MemPalaceError')
    expect(err.status).toBe(500)
  })
})
