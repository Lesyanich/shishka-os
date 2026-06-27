import { describe, it, expect } from 'vitest'
import { QuoteEntryModal } from './QuoteEntryModal'

// Smoke: import-time guard for the quote-entry modal.
describe('QuoteEntryModal', () => {
  it('exports a component function', () => {
    expect(typeof QuoteEntryModal).toBe('function')
    expect(QuoteEntryModal.name).toBe('QuoteEntryModal')
  })
})
