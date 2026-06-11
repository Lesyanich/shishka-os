import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'

// Mock the supabase client: from('price_tiers').select(...).eq(...) resolves to rows.
vi.mock('../lib/supabase.ts', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: [
              { tier_code: 'bundle4', discount_pct: 10 },
              { tier_code: 'bundle8', discount_pct: 15 },
              { tier_code: 'bundle12', discount_pct: 20 },
            ],
          }),
      }),
    }),
  },
}))

import { usePriceTiers } from './usePriceTiers.ts'

afterEach(cleanup)

describe('usePriceTiers', () => {
  it('maps tier_code → discount_pct once loaded', async () => {
    const { result } = renderHook(() => usePriceTiers())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.discounts).toEqual({ bundle4: 10, bundle8: 15, bundle12: 20 })
  })
})
