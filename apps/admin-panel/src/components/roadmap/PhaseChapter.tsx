import type { PhaseData } from '../../hooks/useOpeningRoadmap'
import type { PhaseStatus } from './roadmap-config'
import { DishAccordion } from './DishAccordion'
import { RoadmapTaskList } from './RoadmapTaskList'

/** 13-tick ruler — aesthetic only, matches prototype phase ruler exactly. */
const RULER_TICKS = [
  true, false, false, false,
  true, false, false, false,
  true, false, false, false,
  true,
]

const STATUS_CLASS: Record<PhaseStatus, string> = {
  done: 'status-done',
  in_progress: 'status-progress',
  blocked: 'status-blocked',
  not_started: 'status-idle',
}

const STATUS_LABEL: Record<PhaseStatus, string> = {
  done: 'Done',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  not_started: 'Not Started',
}

/**
 * `data-status` attribute consumed by CSS — collapses PhaseStatus onto the
 * four tokens the prototype styles branch on.
 */
function phaseStatusAttr(s: PhaseStatus): 'done' | 'in_progress' | 'blocked' | 'idle' {
  if (s === 'not_started') return 'idle'
  return s
}

interface PhaseChapterProps {
  phase: PhaseData
  isExpanded: boolean
  isCurrent: boolean
  isLast: boolean
  onToggle: () => void
  /** If provided, rendered above the task list as the chef's marginalia. */
  marginalia?: string
  /** Phase 0 hook — shows the dish-by-category accordion above the task list. */
  showDishAccordion?: boolean
}

export function PhaseChapter({
  phase,
  isExpanded,
  isCurrent,
  isLast,
  onToggle,
  marginalia,
  showDishAccordion,
}: PhaseChapterProps) {
  const { config, tasks, progress, blockerCount, status } = phase
  const statusAttr = phaseStatusAttr(status)
  const bodyId = `phase-body-${config.id}`
  const headId = `phase-head-${config.id}`

  const chipLabel =
    status === 'blocked' && blockerCount > 0
      ? `${blockerCount} ${blockerCount === 1 ? 'Blocker' : 'Blockers'}`
      : STATUS_LABEL[status]

  return (
    <article
      className={`phase${isExpanded ? ' is-open' : ''}`}
      data-status={statusAttr}
    >
      <div className="rail" aria-hidden="true">
        <div className="num-circle">
          <span>{config.id}</span>
        </div>
        {!isLast && <div className="line" />}
      </div>

      <div className="phase-card">
        <button
          type="button"
          className="ph-head"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={bodyId}
          id={headId}
        >
          <div className="ph-meta">
            <div className="ph-tag">
              <span className="hair" />
              PHASE {String(config.id).padStart(2, '0')} · {config.title.toUpperCase()}
              {isCurrent && (
                <span
                  className="chip status-progress"
                  style={{ marginLeft: 8 }}
                >
                  FOCUS
                </span>
              )}
            </div>
            <h3 className="ph-title">{config.title}</h3>
            <p className="ph-sub">{config.subtitle}</p>
          </div>
          <div className="ph-right">
            <span className={`chip ${STATUS_CLASS[status]}`}>{chipLabel}</span>
            <div className="ph-pct">
              {progress}
              <span className="unit">%</span>
            </div>
          </div>
          <svg
            className="chev"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        <div className="ph-ruler" aria-hidden="true">
          <div className="track" />
          <div className="fill" style={{ width: `${progress}%` }} />
          <div className="ticks">
            {RULER_TICKS.map((big, i) => (
              <span key={i} className={big ? 'tick big' : 'tick'} />
            ))}
          </div>
        </div>

        <div
          className="ph-body"
          id={bodyId}
          role="region"
          aria-labelledby={headId}
          aria-hidden={!isExpanded}
        >
          <div className="inner">
            <div className="ph-body-content">
              {marginalia && <p className="marginalia">{marginalia}</p>}
              {showDishAccordion && <DishAccordion />}
              <RoadmapTaskList tasks={tasks} />
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
