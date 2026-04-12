// Smoke test — TODO: expand with RTL render tests for search + categories
import { describe, it, expect } from 'vitest'
import { BrainKnowledgePage } from '../BrainKnowledgePage'

describe('BrainKnowledgePage', () => {
  it('exports a function component', () => {
    expect(typeof BrainKnowledgePage).toBe('function')
  })
})
