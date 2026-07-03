import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const uploadMock = vi.fn().mockResolvedValue({ error: null })

vi.mock('../lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: () => ({ data: { publicUrl: 'https://x/kb-images/p1/1.png' } }),
      }),
    },
  },
}))

import { useKbImageUpload } from './useKbImageUpload'

describe('useKbImageUpload', () => {
  it('rejects unsupported mime types without uploading', async () => {
    const { result } = renderHook(() => useKbImageUpload())
    const file = new File(['x'], 'a.txt', { type: 'text/plain' })
    let res: { ok: boolean } | undefined
    await act(async () => {
      res = await result.current.upload(file, 'p1')
    })
    expect(res?.ok).toBe(false)
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('rejects files larger than 8 MB', async () => {
    const { result } = renderHook(() => useKbImageUpload())
    const file = new File(['x'], 'big.png', { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: 9 * 1024 * 1024 })
    let res: { ok: boolean } | undefined
    await act(async () => {
      res = await result.current.upload(file, 'p1')
    })
    expect(res?.ok).toBe(false)
  })

  it('uploads a valid image and returns a public URL', async () => {
    const { result } = renderHook(() => useKbImageUpload())
    const file = new File(['x'], 'ok.png', { type: 'image/png' })
    let res: { ok: boolean; url?: string } | undefined
    await act(async () => {
      res = await result.current.upload(file, 'p1')
    })
    expect(res?.ok).toBe(true)
    expect(res?.url).toContain('kb-images')
    expect(uploadMock).toHaveBeenCalled()
  })
})
