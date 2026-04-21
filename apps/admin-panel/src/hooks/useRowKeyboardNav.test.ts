import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { KeyboardEvent } from 'react'
import { useRowKeyboardNav } from './useRowKeyboardNav'

function fakeEvent(key: string, target?: HTMLElement): KeyboardEvent<HTMLDivElement> {
  const t = target ?? document.createElement('div')
  return {
    key,
    target: t,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as KeyboardEvent<HTMLDivElement>
}

describe('useRowKeyboardNav', () => {
  it('starts with no focus and exposes ordered navigation', () => {
    const { result } = renderHook(() =>
      useRowKeyboardNav({ ids: ['a', 'b', 'c'] }),
    )
    expect(result.current.focusedId).toBeNull()
    expect(result.current.focusedIndex).toBe(-1)

    act(() => result.current.focusFirst())
    expect(result.current.focusedId).toBe('a')

    act(() => result.current.focusNext())
    expect(result.current.focusedId).toBe('b')

    act(() => result.current.focusNext())
    act(() => result.current.focusNext())
    expect(result.current.focusedId).toBe('c') // clamped at end

    act(() => result.current.focusPrev())
    expect(result.current.focusedId).toBe('b')
  })

  it('handles j/k/ArrowDown/ArrowUp via onKeyDown', () => {
    const { result } = renderHook(() =>
      useRowKeyboardNav({ ids: ['a', 'b', 'c'] }),
    )
    const handler = result.current.containerProps.onKeyDown

    act(() => handler(fakeEvent('j')))
    expect(result.current.focusedId).toBe('a')
    act(() => handler(fakeEvent('ArrowDown')))
    expect(result.current.focusedId).toBe('b')
    act(() => handler(fakeEvent('k')))
    expect(result.current.focusedId).toBe('a')
    act(() => handler(fakeEvent('ArrowUp')))
    expect(result.current.focusedId).toBe('a') // clamped
  })

  it('invokes onEnter / onOpen / onEdit with focused id', () => {
    const onEnter = vi.fn()
    const onOpen = vi.fn()
    const onEdit = vi.fn()
    const { result } = renderHook(() =>
      useRowKeyboardNav({
        ids: ['x', 'y'],
        onEnter,
        onOpen,
        onEdit,
        initialFocusedId: 'y',
      }),
    )
    const handler = result.current.containerProps.onKeyDown

    act(() => handler(fakeEvent('Enter')))
    expect(onEnter).toHaveBeenCalledWith('y')
    act(() => handler(fakeEvent('o')))
    expect(onOpen).toHaveBeenCalledWith('y')
    act(() => handler(fakeEvent('e')))
    expect(onEdit).toHaveBeenCalledWith('y')
  })

  it('Escape clears focus and fires onEscape with previous id', () => {
    const onEscape = vi.fn()
    const { result } = renderHook(() =>
      useRowKeyboardNav({ ids: ['a', 'b'], onEscape, initialFocusedId: 'b' }),
    )
    act(() => result.current.containerProps.onKeyDown(fakeEvent('Escape')))
    expect(onEscape).toHaveBeenCalledWith('b')
    expect(result.current.focusedId).toBeNull()
  })

  it('ignores j/k/e/Enter when target is an editable input', () => {
    const onEnter = vi.fn()
    const { result } = renderHook(() =>
      useRowKeyboardNav({ ids: ['a', 'b'], onEnter, initialFocusedId: 'a' }),
    )
    const input = document.createElement('input')
    act(() =>
      result.current.containerProps.onKeyDown(fakeEvent('j', input)),
    )
    expect(result.current.focusedId).toBe('a') // unchanged

    act(() =>
      result.current.containerProps.onKeyDown(fakeEvent('Enter', input)),
    )
    expect(onEnter).not.toHaveBeenCalled()
  })

  it('snaps focus to first id when focused id disappears from list', () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) =>
        useRowKeyboardNav({ ids, initialFocusedId: 'b' }),
      { initialProps: { ids: ['a', 'b', 'c'] } },
    )
    expect(result.current.focusedId).toBe('b')
    rerender({ ids: ['a', 'c'] })
    expect(result.current.focusedId).toBe('a')
  })
})
