import { describe, it, expect } from 'vitest'
import type { BrainNote } from './brainInbox'

describe('brainInbox types', () => {
  it('BrainNote shape', () => {
    const note: BrainNote = {
      id: 'abc-123',
      text: 'Test note',
      category: null,
      status: 'pending',
      created_at: '2026-04-12T00:00:00Z',
    }
    expect(note.status).toBe('pending')
  })

  it('BrainNote with category', () => {
    const note: BrainNote = {
      id: 'def-456',
      text: 'Kitchen observation',
      category: 'kitchen',
      status: 'ingested',
      created_at: '2026-04-12T10:00:00Z',
    }
    expect(note.category).toBe('kitchen')
  })
})
