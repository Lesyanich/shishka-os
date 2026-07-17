import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toISODate } from '../lib/staffSchedule'
import type { WarningKind, WarningProposal } from '../lib/punctuality'

export interface UseWarningProposalsResult {
  proposals: WarningProposal[]
  isLoading: boolean
  isSaving: boolean
  error: string | null
  /** Turn a proposal into a live warning (starts the 1-year §119(4) clock). */
  approve: (p: WarningProposal, kind: WarningKind, reason: string) => Promise<boolean>
  /** Record that the owner looked at it and decided not to warn. */
  dismiss: (p: WarningProposal, reason: string) => Promise<boolean>
  refetch: () => void
}

/**
 * Warning proposals (`v_warning_proposals`, mig 371) — staff-months that
 * crossed the unexcused-lateness threshold and have no decision on file.
 *
 * The system never issues a warning by itself: this hook only surfaces
 * candidates. Both outcomes write a `staff_warnings` row — approved (live) or
 * dismissed — because "we reviewed this and chose not to warn" is itself part
 * of the employment record, and it stops the same month resurfacing forever.
 */
export function useWarningProposals(issuedBy: string | null): UseWarningProposalsResult {
  const [proposals, setProposals] = useState<WarningProposal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProposals = useCallback(async () => {
    setIsLoading(true)
    const { data, error: fetchError } = await supabase
      .from('v_warning_proposals')
      .select('staff_id, period, late_count, no_punch_count, late_minutes_total, threshold')
      .order('period', { ascending: false })

    if (fetchError) {
      console.error('[useWarningProposals] fetch error', fetchError)
      setError(fetchError.message)
      setIsLoading(false)
      return
    }
    setProposals((data ?? []) as WarningProposal[])
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchProposals()
  }, [fetchProposals])

  const write = useCallback(
    async (
      p: WarningProposal,
      status: 'approved' | 'dismissed',
      kind: WarningKind,
      reason: string,
    ): Promise<boolean> => {
      setIsSaving(true)
      setError(null)
      const { error: insertError } = await supabase.from('staff_warnings').insert({
        staff_id: p.staff_id,
        kind,
        status,
        reason,
        // The violation date anchors the 1-year validity window; use the last
        // day of the month the proposal covers rather than "today", so a
        // decision taken late does not silently extend the warning's life.
        issued_on: monthEnd(p.period),
        for_period: p.period,
        issued_by: issuedBy,
      })
      setIsSaving(false)
      if (insertError) {
        console.error('[useWarningProposals] write error', insertError)
        setError(insertError.message)
        return false
      }
      await fetchProposals()
      return true
    },
    [issuedBy, fetchProposals],
  )

  const approve = useCallback(
    (p: WarningProposal, kind: WarningKind, reason: string) => write(p, 'approved', kind, reason),
    [write],
  )

  const dismiss = useCallback(
    (p: WarningProposal, reason: string) => write(p, 'dismissed', 'verbal', reason),
    [write],
  )

  return { proposals, isLoading, isSaving, error, approve, dismiss, refetch: fetchProposals }
}

/** Last calendar day of the month a proposal covers, capped at today. */
function monthEnd(periodIso: string): string {
  const [y, m] = periodIso.split('-').map(Number)
  const last = new Date(y, m, 0)
  const today = new Date()
  return toISODate(last < today ? last : today)
}
