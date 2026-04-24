/**
 * Pure helpers for OpeningRoadmap.tsx — split out so tests can exercise
 * them without pulling in Supabase client init (see mirror pattern in
 * hooks/useOpeningRoadmap.helpers.ts).
 */

interface PhaseLike {
  config: { id: number }
  status: string
}

/**
 * Returns the id of the "current" phase — first non-done — so the initial
 * expand state focuses the team on the next unfinished chapter.
 */
export function computeCurrentPhaseId(phases: PhaseLike[]): number {
  for (const p of phases) {
    if (p.status !== 'done') return p.config.id
  }
  return phases[phases.length - 1]?.config.id ?? 0
}

/**
 * Default expansion rule:
 *   - Current phase → expanded
 *   - Done phases → collapsed
 *   - Others → expanded
 *
 * User toggles override this until the page unmounts.
 */
export function defaultExpanded(params: {
  phaseId: number
  phaseStatus: string
  currentPhaseId: number
}): boolean {
  if (params.phaseId === params.currentPhaseId) return true
  return params.phaseStatus !== 'done'
}
