// Smoke test for brain barrel exports.
// TODO(brain-view): install vitest in admin-panel — see MC follow-up task.
import { describe, it, expect } from 'vitest'
import * as Brain from '../index'

describe('brain barrel', () => {
  it('re-exports BrainPage, LightragGraph, BrainPlaceholder', () => {
    expect(Brain.BrainPage).toBeDefined()
    expect(Brain.LightragGraph).toBeDefined()
    expect(Brain.BrainPlaceholder).toBeDefined()
  })
})
