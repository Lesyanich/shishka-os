import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLoyverseSync } from './useLoyverseSync'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }),
    },
  },
}))

describe('useLoyverseSync', () => {
  beforeEach(() => vi.clearAllMocks())

  it('initialises with empty syncMap', async () => {
    const { result } = renderHook(() => useLoyverseSync())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.syncMap.size).toBe(0)
  })

  it('builds syncMap keyed by nomenclature_id', async () => {
    const { supabase } = await import('../lib/supabase')
    const row = {
      nomenclature_id: 'abc',
      lv_has_photo: true,
      has_our_photo: false,
      lv_price: 100,
      our_price: 100,
      price_mismatch: false,
      lv_status: 'ok' as const,
      pulled_at: '2026-06-14T00:00:00Z',
      lv_image_url: 'https://example.com/img.jpg',
    }
    vi.mocked(supabase.from).mockReturnValueOnce({
      select: vi.fn().mockResolvedValue({ data: [row], error: null }),
    } as never)

    const { result } = renderHook(() => useLoyverseSync())
    await waitFor(() => expect(result.current.syncMap.size).toBe(1))
    expect(result.current.syncMap.get('abc')?.lv_has_photo).toBe(true)
  })

  it('exposes lastPulledAt from most recent pulled_at', async () => {
    const { supabase } = await import('../lib/supabase')
    vi.mocked(supabase.from).mockReturnValueOnce({
      select: vi.fn().mockResolvedValue({
        data: [
          { nomenclature_id: 'a', pulled_at: '2026-06-14T10:00:00Z', lv_status: 'ok', lv_has_photo: false, has_our_photo: false, lv_price: null, our_price: null, price_mismatch: false, lv_image_url: null },
          { nomenclature_id: 'b', pulled_at: '2026-06-14T12:00:00Z', lv_status: 'ok', lv_has_photo: false, has_our_photo: false, lv_price: null, our_price: null, price_mismatch: false, lv_image_url: null },
        ],
        error: null,
      }),
    } as never)

    const { result } = renderHook(() => useLoyverseSync())
    await waitFor(() => expect(result.current.lastPulledAt).toBeTruthy())
    expect(result.current.lastPulledAt).toBe('2026-06-14T12:00:00Z')
  })
})
