import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Capture the args fn_pf_pack_card_save is called with so we can assert the
// payload shape (shelf_life_days must land at the nomenclature level, not under
// pf_pack_card — single source of truth, mig 307). Defined via vi.hoisted so it
// is initialized before the hoisted vi.mock factory references it.
const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(
    (..._args: unknown[]) => Promise.resolve({ data: { ok: true, new_version: 2 }, error: null }),
  ),
}))

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: rpcMock },
}))

type RpcArgs = [string, { p_pf_id: string; p_payload: Record<string, unknown> }]

import { usePfPackCardSave } from './usePfPackCardSave'

describe('usePfPackCardSave', () => {
  beforeEach(() => rpcMock.mockClear())

  it('exports usePfPackCardSave hook', () => {
    expect(typeof usePfPackCardSave).toBe('function')
  })

  it('routes shelf_life_days to nomenclature (payload top level), NOT pf_pack_card', async () => {
    const { result } = renderHook(() => usePfPackCardSave())

    await act(async () => {
      const res = await result.current.save('pf-id-1', 3, { shelf_life_days: 5 })
      expect(res.ok).toBe(true)
      expect(res.newVersion).toBe(2)
    })

    expect(rpcMock).toHaveBeenCalledTimes(1)
    const [fnName, args] = rpcMock.mock.calls[0] as unknown as RpcArgs
    expect(fnName).toBe('fn_pf_pack_card_save')
    expect(args.p_pf_id).toBe('pf-id-1')

    const payload = args.p_payload
    expect(payload.expected_version).toBe(3)
    // shelf_life_days at nomenclature level — this is what reaches batch expiry.
    expect(payload.shelf_life_days).toBe(5)
    // ...and it must NOT be smuggled inside the pf_pack_card upsert object.
    expect((payload.pf_pack_card as Record<string, unknown>).shelf_life_days).toBeUndefined()
  })

  it('keeps genuine pack-card columns under pf_pack_card', async () => {
    const { result } = renderHook(() => usePfPackCardSave())

    await act(async () => {
      await result.current.save('pf-id-2', 1, { storage_zone: 'Freezer A', portions_per_batch: 10 })
    })

    const [, args] = rpcMock.mock.calls[0] as unknown as RpcArgs
    const packCard = args.p_payload.pf_pack_card as Record<string, unknown>
    expect(packCard.storage_zone).toBe('Freezer A')
    expect(packCard.portions_per_batch).toBe(10)
    // No shelf_life_days at the top level when none was supplied.
    expect(args.p_payload.shelf_life_days).toBeUndefined()
  })
})
