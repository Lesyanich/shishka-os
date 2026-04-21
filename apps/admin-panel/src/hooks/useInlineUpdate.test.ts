import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInlineUpdate } from './useInlineUpdate'

describe('useInlineUpdate', () => {
  it('passes through success and clears any prior error', async () => {
    const update = vi.fn().mockResolvedValue({ ok: true })
    const { result } = renderHook(() => useInlineUpdate(update, { flashMs: 50 }))

    await act(async () => {
      await result.current.commit('row-1', { price: 100 })
    })

    expect(update).toHaveBeenCalledWith('row-1', { price: 100 })
    expect(result.current.isFailed('row-1')).toBe(false)
    expect(result.current.errorFor('row-1')).toBeUndefined()
  })

  it('marks the id as failed on error and records message', async () => {
    const update = vi.fn().mockResolvedValue({ ok: false, error: 'boom' })
    const { result } = renderHook(() => useInlineUpdate(update, { flashMs: 50 }))

    await act(async () => {
      await result.current.commit('row-x', { price: 50 })
    })

    expect(result.current.isFailed('row-x')).toBe(true)
    expect(result.current.errorFor('row-x')).toBe('boom')
  })

  it('clear() resets flashes + errors', async () => {
    const update = vi.fn().mockResolvedValue({ ok: false, error: 'nope' })
    const { result } = renderHook(() => useInlineUpdate(update, { flashMs: 5000 }))

    await act(async () => {
      await result.current.commit('a', { name: 'x' })
      await result.current.commit('b', { name: 'y' })
    })
    expect(result.current.isFailed('a')).toBe(true)
    expect(result.current.isFailed('b')).toBe(true)

    act(() => result.current.clear('a'))
    expect(result.current.isFailed('a')).toBe(false)
    expect(result.current.isFailed('b')).toBe(true)

    act(() => result.current.clear())
    expect(result.current.isFailed('b')).toBe(false)
    expect(result.current.errorFor('b')).toBeUndefined()
  })
})
