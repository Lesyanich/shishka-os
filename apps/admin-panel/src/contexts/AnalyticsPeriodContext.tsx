import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import {
  customRange,
  periodRange,
  type PeriodRange,
  type PeriodWeeks,
} from '../lib/analytics'

/* ═══════════════════════════════════════════════════════════
   AnalyticsPeriodContext — the period every /analytics tab
   re-renders on.

   Two shapes of selection: one of the 4 / 8 / 13-week presets
   (spec §5), or an arbitrary from–to day range (CEO request
   2026-10-17). Only the selection is state; the range is
   always derived, so no tab can drift out of sync with
   another, and a preset keeps behaving exactly as before.
   ═══════════════════════════════════════════════════════════ */

export type PeriodSelection =
  | { mode: 'preset'; weeks: PeriodWeeks }
  | { mode: 'custom'; from: string; to: string }

interface AnalyticsPeriodValue {
  selection: PeriodSelection
  /** The preset's week count, or null while a custom range is active. */
  weeks: PeriodWeeks | null
  range: PeriodRange
  setWeeks: (w: PeriodWeeks) => void
  setCustomRange: (from: string, to: string) => void
  /** Back to the 8-week preset. */
  clearCustomRange: () => void
}

const DEFAULT_WEEKS: PeriodWeeks = 8

const AnalyticsPeriodContext = createContext<AnalyticsPeriodValue | null>(null)

export function AnalyticsPeriodProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<PeriodSelection>({
    mode: 'preset',
    weeks: DEFAULT_WEEKS,
  })

  // Recomputed from today's Bangkok date whenever the selection moves.
  const range = useMemo(
    () =>
      selection.mode === 'preset'
        ? periodRange(selection.weeks)
        : customRange(selection.from, selection.to),
    [selection],
  )

  const setWeeks = useCallback((weeks: PeriodWeeks) => {
    setSelection({ mode: 'preset', weeks })
  }, [])

  const setCustomRange = useCallback((from: string, to: string) => {
    setSelection({ mode: 'custom', from, to })
  }, [])

  const clearCustomRange = useCallback(() => {
    setSelection({ mode: 'preset', weeks: DEFAULT_WEEKS })
  }, [])

  const value = useMemo<AnalyticsPeriodValue>(
    () => ({
      selection,
      weeks: selection.mode === 'preset' ? selection.weeks : null,
      range,
      setWeeks,
      setCustomRange,
      clearCustomRange,
    }),
    [selection, range, setWeeks, setCustomRange, clearCustomRange],
  )

  return <AnalyticsPeriodContext.Provider value={value}>{children}</AnalyticsPeriodContext.Provider>
}

export function useAnalyticsPeriod(): AnalyticsPeriodValue {
  const ctx = useContext(AnalyticsPeriodContext)
  if (!ctx) {
    throw new Error('useAnalyticsPeriod must be used inside <AnalyticsPeriodProvider>')
  }
  return ctx
}
