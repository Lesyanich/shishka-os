import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toISODate } from '../lib/staffSchedule'
import { strongestActiveWarning, type StaffWarning, type WarningKind } from '../lib/punctuality'

export interface NewWarning {
  staff_id: string
  kind: WarningKind
  reason: string
  issued_on?: string
  doc_url?: string | null
  notes?: string | null
}

export interface UseStaffWarningsResult {
  warnings: StaffWarning[]
  /** Highest-severity warning still inside its 1-year window, per staff. */
  activeByStaff: Map<string, StaffWarning>
  isLoading: boolean
  isSaving: boolean
  error: string | null
  addWarning: (w: NewWarning) => Promise<boolean>
  removeWarning: (id: string) => Promise<boolean>
  refetch: () => void
}

/**
 * The disciplinary warnings register (`staff_warnings`, migration 367).
 * A written warning is what makes LPA §119(4) dismissal-for-cause available,
 * and it expires 1 year after the violation — `expires_on` is generated in
 * the DB, so the client never computes validity itself.
 */
export function useStaffWarnings(issuedBy: string | null): UseStaffWarningsResult {
  const [warnings, setWarnings] = useState<StaffWarning[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchWarnings = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('staff_warnings')
      .select('id, staff_id, kind, issued_on, expires_on, reason, doc_url, notes, issued_by, created_at')
      .order('issued_on', { ascending: false })

    if (fetchError) {
      console.error('[useStaffWarnings] fetch error', fetchError)
      setError(fetchError.message)
      setIsLoading(false)
      return
    }

    setWarnings((data ?? []) as StaffWarning[])
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchWarnings()
  }, [fetchWarnings])

  const addWarning = useCallback(
    async (w: NewWarning): Promise<boolean> => {
      setIsSaving(true)
      setError(null)

      const { error: insertError } = await supabase.from('staff_warnings').insert({
        staff_id: w.staff_id,
        kind: w.kind,
        reason: w.reason,
        issued_on: w.issued_on ?? toISODate(new Date()),
        doc_url: w.doc_url ?? null,
        notes: w.notes ?? null,
        issued_by: issuedBy,
      })

      setIsSaving(false)
      if (insertError) {
        console.error('[useStaffWarnings] insert error', insertError)
        setError(insertError.message)
        return false
      }

      await fetchWarnings()
      return true
    },
    [issuedBy, fetchWarnings],
  )

  const removeWarning = useCallback(
    async (id: string): Promise<boolean> => {
      setIsSaving(true)
      setError(null)

      const { error: deleteError } = await supabase.from('staff_warnings').delete().eq('id', id)

      setIsSaving(false)
      if (deleteError) {
        console.error('[useStaffWarnings] delete error', deleteError)
        setError(deleteError.message)
        return false
      }

      await fetchWarnings()
      return true
    },
    [fetchWarnings],
  )

  const activeByStaff = useMemo(() => {
    const today = toISODate(new Date())
    const map = new Map<string, StaffWarning>()
    const staffIds = new Set(warnings.map((w) => w.staff_id))
    for (const staffId of staffIds) {
      const strongest = strongestActiveWarning(
        warnings.filter((w) => w.staff_id === staffId),
        today,
      )
      if (strongest) map.set(staffId, strongest)
    }
    return map
  }, [warnings])

  return {
    warnings,
    activeByStaff,
    isLoading,
    isSaving,
    error,
    addWarning,
    removeWarning,
    refetch: fetchWarnings,
  }
}
