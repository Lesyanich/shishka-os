import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useExpandedRows } from './useExpandedRows'

describe('useExpandedRows', () => {
  it('starts empty and supports toggle/open/close/clear', () => {
    const { result } = renderHook(() => useExpandedRows())
    expect(result.current.isExpanded('a')).toBe(false)
    expect(result.current.expandedIds.size).toBe(0)

    act(() => result.current.toggle('a'))
    expect(result.current.isExpanded('a')).toBe(true)

    act(() => result.current.toggle('a'))
    expect(result.current.isExpanded('a')).toBe(false)

    act(() => result.current.open('b'))
    act(() => result.current.open('b')) // idempotent
    expect(result.current.isExpanded('b')).toBe(true)
    expect(result.current.expandedIds.size).toBe(1)

    act(() => result.current.close('b'))
    expect(result.current.isExpanded('b')).toBe(false)

    act(() => {
      result.current.open('x')
      result.current.open('y')
    })
    act(() => result.current.clear())
    expect(result.current.expandedIds.size).toBe(0)
  })

  it('accepts an initial set of expanded ids', () => {
    const { result } = renderHook(() => useExpandedRows(['seed-1', 'seed-2']))
    expect(result.current.isExpanded('seed-1')).toBe(true)
    expect(result.current.isExpanded('seed-2')).toBe(true)
    expect(result.current.isExpanded('other')).toBe(false)
  })
})
