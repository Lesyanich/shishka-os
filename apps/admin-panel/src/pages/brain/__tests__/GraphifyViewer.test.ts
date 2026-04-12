// Smoke test — TODO(graphify-viewer): expand once vitest + RTL are installed.
import { describe, it, expect } from 'vitest'
import { GraphifyViewer } from '../GraphifyViewer'

describe('GraphifyViewer', () => {
  it('exports a function component', () => {
    expect(typeof GraphifyViewer).toBe('function')
  })
})
