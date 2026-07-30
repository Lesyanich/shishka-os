import { describe, it, expect } from 'vitest'
import { previewHeadline, suspiciouslyFewUpdates } from './CatalogImportPanel'

describe('previewHeadline', () => {
  it('reports inserted and updated separately', () => {
    expect(previewHeadline({ ok: true, inserted: 74, updated: 531 })).toBe('74 new · 531 updated')
  })

  it('mentions skipped rows and in-list duplicates when there are any', () => {
    expect(
      previewHeadline({ ok: true, inserted: 1, updated: 2, skipped: 3, duplicates_in_payload: 4 }),
    ).toBe('1 new · 2 updated · 3 skipped · 4 duplicated in the list')
  })

  it('surfaces the error instead of a count when the call failed', () => {
    expect(previewHeadline({ ok: false, error: 'Not authorized' })).toBe('Not authorized')
    expect(previewHeadline(null)).toBeNull()
  })
})

describe('suspiciouslyFewUpdates', () => {
  it('flags a large list where nothing matched what we already hold', () => {
    // 600 rows in, 600 new, 0 updated — almost always a bad column mapping or
    // the wrong supplier, not a genuinely brand-new catalog.
    expect(suspiciouslyFewUpdates({ ok: true, received: 600, inserted: 600, updated: 0 })).toBe(true)
  })

  it('stays quiet when some rows updated', () => {
    expect(suspiciouslyFewUpdates({ ok: true, received: 600, inserted: 74, updated: 526 })).toBe(
      false,
    )
  })

  it('stays quiet for a genuinely small import', () => {
    expect(suspiciouslyFewUpdates({ ok: true, received: 3, inserted: 3, updated: 0 })).toBe(false)
  })

  it('stays quiet on failure', () => {
    expect(suspiciouslyFewUpdates({ ok: false, error: 'boom' })).toBe(false)
    expect(suspiciouslyFewUpdates(null)).toBe(false)
  })
})
