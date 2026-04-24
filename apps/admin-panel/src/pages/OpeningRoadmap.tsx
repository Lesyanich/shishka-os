import { useEffect, useMemo, useState } from 'react'
import { useOpeningRoadmap } from '../hooks/useOpeningRoadmap'
import { OPENING_PHASES } from '../components/roadmap/roadmap-config'
import { RoadmapTopbar } from '../components/roadmap/RoadmapTopbar'
import { CalendarRibbon } from '../components/roadmap/CalendarRibbon'
import { BeforeRecipeLock } from '../components/roadmap/BeforeRecipeLock'
import { BlockersCard } from '../components/roadmap/BlockersCard'
import { PhaseChapter } from '../components/roadmap/PhaseChapter'
import {
  computeCurrentPhaseId,
  defaultExpanded,
} from './OpeningRoadmap.helpers'
import './opening-roadmap.css'

// Re-export so existing test imports keep working.
export { computeCurrentPhaseId, defaultExpanded } from './OpeningRoadmap.helpers'

const TODAY_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
}

const MARGINALIA: Record<number, string> = {
  0: "Three dishes still open: shakshuka portioning, za'atar dough hydration, chicken bowl sauce. Once these freeze, no new experiments until Q3.",
  5: 'Target date: Fri 05 Jun 2026. 45-cover limit first weekend. Feedback forms on every receipt.',
}

export function OpeningRoadmap() {
  const {
    phases,
    overallProgress: _overallProgress,
    blockers,
    mustDo,
    isLoading,
    error,
    refetch,
  } = useOpeningRoadmap()
  void _overallProgress // retained on hook API for future use; not rendered here

  const currentPhaseId = useMemo(() => computeCurrentPhaseId(phases), [phases])

  // Per-user override: once a phase is toggled, the explicit state wins until reload.
  const [explicit, setExplicit] = useState<Record<number, boolean>>({})

  function isExpanded(phaseId: number, phaseStatus: string): boolean {
    if (phaseId in explicit) return explicit[phaseId]
    return defaultExpanded({ phaseId, phaseStatus, currentPhaseId })
  }

  function togglePhase(phaseId: number, phaseStatus: string) {
    setExplicit((prev) => ({
      ...prev,
      [phaseId]: !isExpanded(phaseId, phaseStatus),
    }))
  }

  // Today label — recomputed on mount; static is fine for a single session.
  const [todayLabel] = useState<string>(() =>
    new Date().toLocaleDateString('en-GB', TODAY_OPTIONS),
  )

  // Title the tab so it's findable in a multi-tab session.
  useEffect(() => {
    const prev = document.title
    document.title = 'Opening Roadmap · Shishka'
    return () => {
      document.title = prev
    }
  }, [])

  const lockDay =
    OPENING_PHASES.find((p) => p.lockDay)?.lockDay ?? '2026-04-28'

  /* ─── Initial load / error states ─── */
  const hasAnyTasks = phases.some((p) => p.tasks.length > 0)

  if (isLoading && !hasAnyTasks) {
    return (
      <div className="opening-roadmap-root">
        <div className="shell">
          <div className="rm-state">
            <div className="rm-state-label">LOADING ROADMAP</div>
            <div className="rm-state-detail">
              Reading business_tasks from Supabase…
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error && !hasAnyTasks) {
    return (
      <div className="opening-roadmap-root">
        <div className="shell">
          <div className="rm-state">
            <div className="rm-state-label">COULD NOT LOAD</div>
            <div className="rm-state-detail">{error}</div>
            <button type="button" onClick={refetch}>
              TRY AGAIN
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="opening-roadmap-root">
      <div className="shell">
        <RoadmapTopbar todayLabel={todayLabel} chapterLabel="04 · Opening" />

        <CalendarRibbon />

        <div className="focus-row reveal r3">
          <BeforeRecipeLock lockDay={lockDay} mustDo={mustDo} />
          <BlockersCard blockers={blockers} />
        </div>

        <div className="section-head reveal r4">
          <span className="num">PART TWO</span>
          <h2>
            The Six <em>Chapters</em>
          </h2>
          <span className="spacer" />
        </div>

        <div className="body-grid">
          <div className="phases reveal r4">
            {phases.map((phase, i) => (
              <PhaseChapter
                key={phase.config.id}
                phase={phase}
                isExpanded={isExpanded(phase.config.id, phase.status)}
                isCurrent={phase.config.id === currentPhaseId}
                isLast={i === phases.length - 1}
                onToggle={() => togglePhase(phase.config.id, phase.status)}
                marginalia={MARGINALIA[phase.config.id]}
                showDishAccordion={phase.config.id === 0}
              />
            ))}
          </div>
        </div>

        <footer className="foot">
          <div>
            <span className="serif">Opening Roadmap</span>
            &nbsp;·&nbsp; v1.3 &nbsp;·&nbsp;{' '}
            <span style={{ fontFamily: 'var(--f-mono)' }}>
              agents/designer/designs/roadmap-v1/
            </span>
          </div>
          <div>
            {error && (
              <button
                type="button"
                onClick={refetch}
                style={{
                  fontFamily: 'var(--f-sc)',
                  letterSpacing: '0.22em',
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--brick-bright)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                RETRY ↻
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
