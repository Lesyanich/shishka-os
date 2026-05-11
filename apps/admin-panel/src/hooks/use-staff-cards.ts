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
      // Optimistic
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

  return { staff, leaveBalances, isLoading, updateStaff }
}
