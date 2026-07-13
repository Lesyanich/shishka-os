import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Shared fake Supabase channel. `vi.hoisted` so the mock factory (hoisted above
// imports) can reference it safely.
const h = vi.hoisted(() => {
  const registered: Array<() => void> = []
  const subscribe = vi.fn()
  const removeChannel = vi.fn()
  const on = vi.fn()
  const channelObj = { on, subscribe }
  on.mockImplementation((_evt: string, _filter: unknown, cb: () => void) => {
    registered.push(cb)
    return channelObj
  })
  const channelFactory = vi.fn(() => channelObj)
  return { registered, subscribe, removeChannel, on, channelFactory }
})

vi.mock('../lib/supabase', () => ({
  supabase: {
    channel: h.channelFactory,
    removeChannel: h.removeChannel,
  },
}))

import { useCoalescedRealtimeRefetch } from './useCoalescedRealtimeRefetch'

describe('useCoalescedRealtimeRefetch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    h.registered.length = 0
    h.channelFactory.mockClear()
    h.on.mockClear()
    h.subscribe.mockClear()
    h.removeChannel.mockClear()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('subscribes once to every watched table on one named channel, and cleans up on unmount', () => {
    const onChange = vi.fn()
    const { unmount } = renderHook(() =>
      useCoalescedRealtimeRefetch('chan', [{ table: 'a' }, { table: 'b' }], onChange),
    )

    expect(h.channelFactory).toHaveBeenCalledWith('chan')
    expect(h.on).toHaveBeenCalledTimes(2) // one .on() per watched table
    expect(h.subscribe).toHaveBeenCalledTimes(1)

    unmount()
    expect(h.removeChannel).toHaveBeenCalledTimes(1)
  })

  it('coalesces a burst of change events into a single debounced onChange', () => {
    const onChange = vi.fn()
    renderHook(() => useCoalescedRealtimeRefetch('chan', [{ table: 'a' }], onChange, 200))

    // Simulate a multi-row transaction / echo: several events in the same tick.
    h.registered[0]()
    h.registered[0]()
    h.registered[0]()
    expect(onChange).not.toHaveBeenCalled() // still inside the debounce window

    vi.advanceTimersByTime(199)
    expect(onChange).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onChange).toHaveBeenCalledTimes(1) // exactly one refetch for the burst
  })

  it('runs the latest onChange closure without resubscribing when it changes identity', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) =>
        useCoalescedRealtimeRefetch('chan', [{ table: 'a' }], cb),
      { initialProps: { cb: first } },
    )

    const subscribesAfterMount = h.subscribe.mock.calls.length
    rerender({ cb: second })
    // A new closure must NOT tear down and rebuild the channel.
    expect(h.subscribe.mock.calls.length).toBe(subscribesAfterMount)

    h.registered[0]()
    vi.advanceTimersByTime(200)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
