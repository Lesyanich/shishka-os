import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

/**
 * The access rule is enforced by the database (migration 454). What this hook
 * owns: the Fire payload (a future last day must NOT deactivate), client-side
 * login/PIN validation, and surfacing the server's own error text.
 */

const rpc = vi.fn()
const update = vi.fn()
const eq = vi.fn()

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => ({ update: (...args: unknown[]) => { update(...args); return { eq } } }),
  },
}))

beforeEach(() => {
  rpc.mockReset()
  update.mockReset()
  eq.mockReset()
  rpc.mockResolvedValue({ data: [], error: null })
  eq.mockResolvedValue({ error: null })
})

describe('firePayload', () => {
  it('ends access now when the last working day is already behind us', async () => {
    const { firePayload } = await import('./use-staff-access')
    expect(firePayload('2026-10-01', '2026-10-09')).toEqual({ fire_date: '2026-10-01', is_active: false })
  })

  it('keeps the row active through a notice period (today or later)', async () => {
    const { firePayload } = await import('./use-staff-access')
    expect(firePayload('2026-10-09', '2026-10-09')).toEqual({ fire_date: '2026-10-09' })
    expect(firePayload('2026-10-17', '2026-10-09')).toEqual({ fire_date: '2026-10-17' })
  })
})

describe('login helpers', () => {
  it('suggests the same login the server would derive from the name', async () => {
    const { suggestLogin, LOGIN_PATTERN } = await import('./use-staff-access')
    expect(suggestLogin('Noe Noe')).toBe('noenoe')
    expect(suggestLogin('Nuk')).toBe('nuk')
    expect(LOGIN_PATTERN.test(suggestLogin('Pa'))).toBe(false) // too short — the owner types one
  })

  it('labels the four login states', async () => {
    const { loginStatusLabel } = await import('./use-staff-access')
    const base = { staff_id: 's', login_email: 'nuk@staff.shishka.local', has_pin: true }
    expect(loginStatusLabel(undefined).kind).toBe('none')
    expect(loginStatusLabel({ ...base, last_sign_in_at: null, is_blocked: true }).kind).toBe('blocked')
    expect(loginStatusLabel({ ...base, last_sign_in_at: null, is_blocked: false }).kind).toBe('never')
    expect(loginStatusLabel({ ...base, last_sign_in_at: '2026-09-29T06:17:39Z', is_blocked: false }))
      .toEqual({ kind: 'active', text: 'Last sign-in 2026-09-29' })
  })

  it('formats the Bangkok date, not UTC', async () => {
    const { bangkokToday } = await import('./use-staff-access')
    // 23:30 UTC on the 8th is already the 9th in Bangkok (UTC+7).
    expect(bangkokToday(new Date('2026-10-08T23:30:00Z'))).toBe('2026-10-09')
  })
})

describe('useStaffAccess', () => {
  it('loads login status keyed by staff id', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ staff_id: 'a', login_email: 'a@staff.shishka.local', last_sign_in_at: null, is_blocked: false, has_pin: true }],
      error: null,
    })
    const { useStaffAccess } = await import('./use-staff-access')
    const { result } = renderHook(() => useStaffAccess())
    await waitFor(() => expect(result.current.isLoadingStatus).toBe(false))
    expect(rpc).toHaveBeenCalledWith('fn_staff_login_status')
    expect(result.current.loginStatus.a.login_email).toBe('a@staff.shishka.local')
  })

  it('rejects a bad login or PIN before calling the server', async () => {
    const { useStaffAccess } = await import('./use-staff-access')
    const { result } = renderHook(() => useStaffAccess())
    await waitFor(() => expect(result.current.isLoadingStatus).toBe(false))
    rpc.mockClear()

    expect(await result.current.setLogin('s', 'nu', '1234')).toMatchObject({ ok: false })
    expect(await result.current.setLogin('s', 'nuk', '12a4')).toMatchObject({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sends the login lower-cased and returns what the server settled on', async () => {
    const { useStaffAccess } = await import('./use-staff-access')
    const { result } = renderHook(() => useStaffAccess())
    await waitFor(() => expect(result.current.isLoadingStatus).toBe(false))
    rpc.mockResolvedValueOnce({ data: 'nuk', error: null })

    let res: Awaited<ReturnType<typeof result.current.setLogin>> | undefined
    await act(async () => {
      res = await result.current.setLogin('s', ' Nuk ', '1234')
    })
    expect(rpc).toHaveBeenCalledWith('fn_set_staff_pin', { p_staff_id: 's', p_pin: '1234', p_login: 'nuk' })
    expect(res).toEqual({ ok: true, login: 'nuk' })
  })

  it('surfaces the trigger message verbatim', async () => {
    const { useStaffAccess } = await import('./use-staff-access')
    const { result } = renderHook(() => useStaffAccess())
    await waitFor(() => expect(result.current.isLoadingStatus).toBe(false))
    eq.mockResolvedValueOnce({ error: { message: 'Cannot remove the last active owner' } })

    const res = await result.current.fire('owner-id', '2026-01-01')
    expect(res).toEqual({ ok: false, error: 'Cannot remove the last active owner' })
  })

  it('fire writes the payload for the chosen last day', async () => {
    const { useStaffAccess } = await import('./use-staff-access')
    const { result } = renderHook(() => useStaffAccess())
    await waitFor(() => expect(result.current.isLoadingStatus).toBe(false))

    await act(async () => {
      await result.current.fire('s', '2026-01-01')
    })
    expect(update).toHaveBeenCalledWith({ fire_date: '2026-01-01', is_active: false })
    expect(eq).toHaveBeenCalledWith('id', 's')
  })

  it('reveals a PIN only through the owner RPC and surfaces its refusal', async () => {
    const { useStaffAccess } = await import('./use-staff-access')
    const { result } = renderHook(() => useStaffAccess())
    await waitFor(() => expect(result.current.isLoadingStatus).toBe(false))

    rpc.mockResolvedValueOnce({ data: '4821', error: null })
    expect(await result.current.revealPin('s')).toEqual({ ok: true, pin: '4821' })
    expect(rpc).toHaveBeenLastCalledWith('fn_staff_pin_reveal', { p_staff_id: 's' })

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Only owners can see staff PINs' } })
    expect(await result.current.revealPin('s')).toEqual({ ok: false, error: 'Only owners can see staff PINs' })

    rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await result.current.revealPin('s')).toMatchObject({ ok: false })
  })
})
