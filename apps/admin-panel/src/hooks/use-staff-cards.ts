import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface StaffCard {
  id: string
  name: string
  name_th: string | null
  role: string
  app_role: string
  phone: string | null
  is_active: boolean
  monthly_salary: number | null
  hire_date: string | null
  fire_date: string | null
  employment_type: string | null
  nationality: string | null
  work_permit_number: string | null
  work_permit_expiry: string | null
  sso_number: string | null
  tax_id: string | null
  probation_end_date: string | null
  created_at: string
  email: string | null
  pin_set_at: string | null
  auth_user_id: string | null
}

export interface LeaveBalance {
  id: string
  staff_id: string
  year: number
  leave_type: string
  entitlement: number
  used: number
  remaining: number
}

export interface StaffPatch {
  monthly_salary?: number | null
  employment_type?: string | null
  nationality?: string | null
  work_permit_number?: string | null
  work_permit_expiry?: string | null
  sso_number?: string | null
  tax_id?: string | null
  probation_end_date?: string | null
  hire_date?: string | null
}

export type AuthStatus = 'no_login' | 'linked' | 'pin_only'

export function deriveAuthStatus(card: StaffCard): AuthStatus {
  if (!card.auth_user_id) return 'no_login'
  if (card.app_role === 'cook') return 'pin_only'
  return 'linked'
}

export interface AuthMutationResult {
  ok: boolean
  error?: string
}

async function callEdgeFunction(
  name: string,
  body: Record<string, unknown>,
): Promise<AuthMutationResult> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    // supabase-js wraps non-2xx responses into FunctionsHttpError; surface server message when possible
    const fnError = error as { context?: { error?: string }; message?: string }
    const serverError = fnError.context?.error
    return { ok: false, error: serverError || fnError.message || 'request failed' }
  }
  const payload = data as { ok?: boolean; error?: string } | null
  if (payload?.ok) return { ok: true }
  return { ok: false, error: payload?.error || 'unknown response' }
}

export function useStaffCards() {
  const [staff, setStaff] = useState<StaffCard[]>([])
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const currentYear = new Date().getFullYear()

  const fetchData = useCallback(async () => {
    setIsLoading(true)

    const [staffRes, leavesRes] = await Promise.all([
      supabase
        .from('staff')
        .select('*')
        .order('is_active', { ascending: false })
        .order('name'),
      supabase
        .from('leave_balances')
        .select('*')
        .eq('year', currentYear),
    ])

    if (staffRes.data) setStaff(staffRes.data)
    if (leavesRes.data) setLeaveBalances(leavesRes.data)

    setIsLoading(false)
  }, [currentYear])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const updateStaff = useCallback(
    async (staffId: string, patch: StaffPatch) => {
      setStaff((prev) =>
        prev.map((s) => (s.id === staffId ? { ...s, ...patch } : s)),
      )

      const { error } = await supabase
        .from('staff')
        .update(patch)
        .eq('id', staffId)

      if (error) {
        await fetchData()
      }
    },
    [fetchData],
  )

  const inviteStaff = useCallback(
    async (staffId: string, email: string): Promise<AuthMutationResult> => {
      const res = await callEdgeFunction('staff-invite', {
        staff_id: staffId,
        email,
      })
      if (res.ok) await fetchData()
      return res
    },
    [fetchData],
  )

  const setStaffPin = useCallback(
    async (staffId: string, pin: string): Promise<AuthMutationResult> => {
      const res = await callEdgeFunction('staff-set-pin', {
        staff_id: staffId,
        pin,
      })
      if (res.ok) await fetchData()
      return res
    },
    [fetchData],
  )

  const resetStaffPassword = useCallback(
    async (staffId: string): Promise<AuthMutationResult> => {
      const res = await callEdgeFunction('staff-reset-password', {
        staff_id: staffId,
      })
      if (res.ok) await fetchData()
      return res
    },
    [fetchData],
  )

  return {
    staff,
    leaveBalances,
    isLoading,
    updateStaff,
    inviteStaff,
    setStaffPin,
    resetStaffPassword,
  }
}
