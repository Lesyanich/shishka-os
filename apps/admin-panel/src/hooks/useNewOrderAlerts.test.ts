import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { ToastProvider } from '../components/ui/Toast'

// Hoisted mocks so the vi.mock factory can reference them safely.
const h = vi.hoisted(() => {
  const subscribe = vi.fn(() => ({ id: 'ch' }))
  const on = vi.fn(() => ({ subscribe }))
  const channel = vi.fn(() => ({ on }))
  const removeChannel = vi.fn()
  return { subscribe, on, channel, removeChannel }
})

vi.mock('../lib/supabase', () => ({
  supabase: { channel: h.channel, removeChannel: h.removeChannel },
}))

import { useNewOrderAlerts, AUTO_PRINT_KEY } from './useNewOrderAlerts'

function wrapper({ children }: { children: ReactNode }) {
  return createElement(ToastProvider, null, children)
}

describe('useNewOrderAlerts', () => {
  beforeEach(() => {
    h.channel.mockClear()
    h.on.mockClear()
    h.subscribe.mockClear()
    h.removeChannel.mockClear()
  })

  it('exposes a stable auto-print storage key', () => {
    expect(AUTO_PRINT_KEY).toBe('orders.autoPrintAssembly')
  })

  it('subscribes to an INSERT-only channel for new orders and cleans up on unmount', () => {
    const { unmount } = renderHook(() => useNewOrderAlerts(), { wrapper })

    expect(h.channel).toHaveBeenCalledWith('orders-new-alerts')
    expect(h.on).toHaveBeenCalledTimes(1)
    const [evt, cfg] = h.on.mock.calls[0]
    expect(evt).toBe('postgres_changes')
    expect(cfg).toMatchObject({ event: 'INSERT', table: 'orders', filter: 'status=eq.new' })
    expect(h.subscribe).toHaveBeenCalled()

    unmount()
    expect(h.removeChannel).toHaveBeenCalled()
  })
})
