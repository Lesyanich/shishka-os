// Smoke test — TODO(brain-view): expand once vitest + RTL + canvas mocks are installed.
// Full coverage is non-trivial because react-force-graph-2d uses HTMLCanvasElement
// which needs canvas/jest-canvas-mock or jsdom-canvas in the test env.
import { describe, it, expect } from 'vitest'
import { LightragGraph } from '../LightragGraph'

describe('LightragGraph', () => {
  it('exports a function component', () => {
    expect(typeof LightragGraph).toBe('function')
  })
})
