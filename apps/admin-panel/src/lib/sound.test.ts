import { describe, it, expect, vi, afterEach } from 'vitest'

describe('sound', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('is a safe no-op when AudioContext is unavailable', async () => {
    vi.stubGlobal('AudioContext', undefined)
    const mod = await import('./sound')
    expect(() => mod.unlockAudio()).not.toThrow()
    expect(() => mod.playNewOrderChime()).not.toThrow()
  })

  it('plays a two-tone chime when AudioContext is available', async () => {
    const start = vi.fn()
    const stop = vi.fn()
    const connect = vi.fn()
    const createOscillator = vi.fn(() => ({
      type: 'sine',
      frequency: { value: 0 },
      connect,
      start,
      stop,
    }))
    const createGain = vi.fn(() => ({
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect,
    }))
    class FakeAudioContext {
      state = 'running'
      currentTime = 0
      destination = {}
      resume = vi.fn()
      createOscillator = createOscillator
      createGain = createGain
    }
    vi.stubGlobal('AudioContext', FakeAudioContext)

    const mod = await import('./sound')
    mod.playNewOrderChime()

    expect(createOscillator).toHaveBeenCalledTimes(2) // A5 + E6
    expect(start).toHaveBeenCalledTimes(2)
    expect(stop).toHaveBeenCalledTimes(2)
  })
})
