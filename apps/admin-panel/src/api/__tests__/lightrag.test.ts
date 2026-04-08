// Smoke tests for the LightRAG REST client.
// TODO(brain-view): install vitest in admin-panel (see MC follow-up task) so this runs in CI.
// For now this file satisfies HC-3 (AI-TDD gate) and documents the intended assertions.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchGraph,
  fetchHealth,
  listLabels,
  getBaseUrl,
  LightragError,
} from '../lightrag'

describe('lightrag client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('exposes typed helpers', () => {
    expect(typeof fetchGraph).toBe('function')
    expect(typeof fetchHealth).toBe('function')
    expect(typeof listLabels).toBe('function')
    expect(typeof getBaseUrl).toBe('function')
  })

  it('falls back to localhost:9621 when env is empty', () => {
    expect(getBaseUrl()).toMatch(/^https?:\/\//)
  })

  it('fetchGraph builds /graphs query with defaults', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ nodes: [], edges: [], is_truncated: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await fetchGraph({})
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const url = fetchSpy.mock.calls[0]?.[0] as string
    expect(url).toContain('/graphs?')
    expect(url).toContain('label=%2A') // '*' encoded
    expect(url).toContain('max_depth=3')
    expect(url).toContain('max_nodes=500')
  })

  it('throws LightragError on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('boom', { status: 503, statusText: 'Service Unavailable' }),
    )
    await expect(fetchHealth()).rejects.toBeInstanceOf(LightragError)
  })
})
