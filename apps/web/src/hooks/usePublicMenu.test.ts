import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePublicMenu } from './usePublicMenu.ts'

// Thenable query builder: from().select().order().order() resolves to {data,error}.
vi.mock('../lib/supabase.ts', () => {
  const rows = [
    { id: '1', name: 'Beef', category_code: 'man', category_name: 'Manaish', price: 69, tags: [], allergens: [] },
    { id: '2', name: 'Latte', category_code: 'cof', category_name: 'Coffee', price: 80, tags: [], allergens: [] },
    { id: '3', name: 'Truffle', category_code: 'man', category_name: 'Manaish', price: 79, tags: [], allergens: [] },
  ]
  const builder = {
    select: () => builder,
    order: () => builder,
    then: (resolve: (v: { data: typeof rows; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  }
  return { supabase: { from: () => builder } }
})

describe('usePublicMenu', () => {
  it('groups dishes by category', async () => {
    const { result } = renderHook(() => usePublicMenu())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBeNull()
    expect(result.current.categories).toHaveLength(2)
    const man = result.current.categories.find((c) => c.code === 'man')
    expect(man?.dishes).toHaveLength(2)
  })
})
