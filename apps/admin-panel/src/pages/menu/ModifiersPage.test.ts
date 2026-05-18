import { describe, it, expect } from 'vitest'
import { ModifiersPage } from './ModifiersPage'

describe('ModifiersPage', () => {
  it('is exported as a function component', () => {
    expect(typeof ModifiersPage).toBe('function')
  })
})
