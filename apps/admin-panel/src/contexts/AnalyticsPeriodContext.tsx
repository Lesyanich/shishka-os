import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { periodRange, type PeriodRange, type PeriodWeeks } from '../lib/analytics'

/* ═══════════════════════════════════════════════════════════
   AnalyticsPeriodContext — the 4 / 8 / 13-week selector that
   every /analytics tab re-renders on (spec §5).

   The range is derived, never stored: one piece of state
   (`weeks`) means no tab can drift out of sync with another.
   ═══════════════════════════════════════════════════════════ */

interface AnalyticsPeriodValue {
  weeks: PeriodWeeks
  setWeeks: (w: PeriodWeeks) => void
  range: PeriodRange
}

const AnalyticsPeriodContext = createContext<AnalyticsPeriodValue | null>(null)

export function AnalyticsPeriodProvider({ children }: { children: ReactNode }) {
  const [weeks, setWeeks] = useState<PeriodWeeks>(8)

  // Recomputed from today's Bangkok date whenever the selector moves.
  const range = useMemo(() => periodRange(weeks), [weeks])

  const value = useMemo<AnalyticsPeriodValue>(() => ({ weeks, setWeeks, range }), [weeks, range])

  return <AnalyticsPeriodContext.Provider value={value}>{children}</AnalyticsPeriodContext.Provider>
}

export function useAnalyticsPeriod(): AnalyticsPeriodValue {
  const ctx = useContext(AnalyticsPeriodContext)
  if (!ctx) {
    throw new Error('useAnalyticsPeriod must be used inside <AnalyticsPeriodProvider>')
  }
  return ctx
}
