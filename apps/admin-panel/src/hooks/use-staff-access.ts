import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AppRole } from '../contexts/AppRoleContext'

/**
 * Access controls for one staff row: tier, login, firing.
 *
 * The rule lives in the database (migration 454): a login works only while an
 * active staff row points at it. Deactivating a row bans its auth user and
 * kills its sessions; a past fire_date is final. This hook only sends the
 * writes and shows what the DB says — the trigger messages are written for
 * humans, so they are surfaced verbatim instead of being rewritten here.
 */

export interface LoginStatus {
  staff_id: string
  login_email: string
  last_sign_in_at: string | null
  is_blocked: boolean
}

/** Tiers an owner can hand out from the UI. Owner stays SQL-only on purpose. */
export const ASSIGNABLE_ROLES: { value: Exclude<AppRole, 'owner'>; label: string; hint: string }[] = [
  { value: 'task_manager', label: 'Manager', hint: 'receipts, procurement, schedule, cashier, KDS, staff tasks' },
  { value: 'cook', label: 'Kitchen', hint: 'tasks, recipes, labels, own schedule' },
]

/** Mirrors fn_set_staff_pin: 3–20 Latin letters or digits, lower-cased. */
export const LOGIN_PATTERN = /^[a-z0-9]{3,20}$/
export const PIN_PATTERN = /^[0-9]{4}$/

/** Same formula as fn_set_staff_pin's fallback and lib/staffAuth.ts. */
export function suggestLogin(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** The login part the person types on the login screen, from a stored address. */
export function loginFromEmail(email: string): string {
  return email.split('@')[0] ?? email
}

/**
 * What the Fire action writes. fire_date is the LAST WORKING DAY: a day already
 * behind us ends access now; today or a future day keeps the row active and
 * the nightly job (fn_staff_retire_expired) retires it the morning after.
 */
export function firePayload(lastDay: string, today: string): { fire_date: string; is_active?: false } {
  return lastDay < today ? { fire_date: lastDay, is_active: false } : { fire_date: lastDay }
}

/** Bangkok calendar date, matching fn_bkk_today() on the server. */
export function bangkokToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export type LoginStatusLabel =
  | { kind: 'none'; text: 'No login yet' }
  | { kind: 'blocked'; text: 'Login blocked' }
  | { kind: 'never'; text: 'Never signed in' }
  | { kind: 'active'; text: string }

export function loginStatusLabel(status: LoginStatus | undefined): LoginStatusLabel {
  if (!status) return { kind: 'none', text: 'No login yet' }
  if (status.is_blocked) return { kind: 'blocked', text: 'Login blocked' }
  if (!status.last_sign_in_at) return { kind: 'never', text: 'Never signed in' }
  return { kind: 'active', text: `Last sign-in ${status.last_sign_in_at.slice(0, 10)}` }
}

export interface AccessResult {
  ok: boolean
  /** The login the server settled on (fn_set_staff_pin returns it). */
  login?: string
  error?: string
}

function message(err: { message?: string } | null | undefined, fallback: string): string {
  return err?.message?.trim() || fallback
}

export function useStaffAccess() {
  const [loginStatus, setLoginStatus] = useState<Record<string, LoginStatus>>({})
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)

  // One owner-only RPC for the whole page: auth.users is not readable from the
  // client, and a non-owner gets zero rows rather than an error.
  const refetchStatus = useCallback(async () => {
    const { data } = await supabase.rpc('fn_staff_login_status')
    const rows = (data ?? []) as LoginStatus[]
    setLoginStatus(Object.fromEntries(rows.map((r) => [r.staff_id, r])))
    setIsLoadingStatus(false)
  }, [])

  useEffect(() => {
    void refetchStatus()
  }, [refetchStatus])

  const setAppRole = useCallback(
    async (staffId: string, role: Exclude<AppRole, 'owner'>): Promise<AccessResult> => {
      const { error } = await supabase.from('staff').update({ app_role: role }).eq('id', staffId)
      return error ? { ok: false, error: message(error, 'Could not change the access level') } : { ok: true }
    },
    [],
  )

  const setLogin = useCallback(
    async (staffId: string, login: string, pin: string): Promise<AccessResult> => {
      const normalized = login.trim().toLowerCase()
      if (!LOGIN_PATTERN.test(normalized)) {
        return { ok: false, error: 'Login must be 3–20 Latin letters or digits' }
      }
      if (!PIN_PATTERN.test(pin)) {
        return { ok: false, error: 'PIN must be exactly 4 digits' }
      }
      const { data, error } = await supabase.rpc('fn_set_staff_pin', {
        p_staff_id: staffId,
        p_pin: pin,
        p_login: normalized,
      })
      if (error) return { ok: false, error: message(error, 'Could not set the login') }
      await refetchStatus()
      return { ok: true, login: (data as string | null) ?? normalized }
    },
    [refetchStatus],
  )

  const fire = useCallback(
    async (staffId: string, lastDay: string): Promise<AccessResult> => {
      if (!lastDay) return { ok: false, error: 'Pick the last working day' }
      const { error } = await supabase
        .from('staff')
        .update(firePayload(lastDay, bangkokToday()))
        .eq('id', staffId)
      if (error) return { ok: false, error: message(error, 'Could not record the leaving date') }
      await refetchStatus()
      return { ok: true }
    },
    [refetchStatus],
  )

  return { loginStatus, isLoadingStatus, refetchStatus, setAppRole, setLogin, fire }
}
