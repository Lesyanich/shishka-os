import { useNavigate } from 'react-router-dom'
import type { RoadmapBlocker } from '../../hooks/useOpeningRoadmap'

interface BlockersCardProps {
  blockers: readonly RoadmapBlocker[]
}

export function BlockersCard({ blockers }: BlockersCardProps) {
  const navigate = useNavigate()
  const count = blockers.length

  return (
    <section
      className="blockers-card"
      aria-labelledby="blockers-title"
    >
      <div className="overline-blockers">
        <span className="dot" />
        STOPPERS · {count} OPEN
      </div>
      <h3 id="blockers-title">
        Blockers &amp; <em>Stoppers</em>
      </h3>
      <div className="blockers-sub">
        Everything waiting on someone else before the team can move.
      </div>

      {count === 0 ? (
        <div className="no-blockers">
          Nothing stuck. Keep the line moving.
        </div>
      ) : (
        blockers.map((b) => (
          <button
            key={b.id}
            type="button"
            className="blocker-row"
            onClick={() => navigate(`/mission?task=${b.id}`)}
            aria-label={`Open blocker ${b.title}`}
          >
            <div className="br-title">{b.title}</div>
            <span className="br-age">{b.ageDays}d</span>
            {b.description && <p className="br-why">{b.description}</p>}
            <div className="br-meta">
              <span className="br-who">{b.ownerRaw ?? 'UNASSIGNED'}</span>
              {b.phase >= 0 && (
                <span className="br-phase">
                  PHASE {String(b.phase).padStart(2, '0')}
                </span>
              )}
              <span className="br-link">VIEW ↗</span>
            </div>
          </button>
        ))
      )}

      {count > 0 && (
        <div className="seal-big" aria-hidden="true">
          <svg viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="#9B1C21" />
            <circle
              cx="32"
              cy="32"
              r="23"
              fill="none"
              stroke="#F0EAD6"
              strokeWidth="0.6"
              opacity="0.6"
            />
            <text
              x="32"
              y="30"
              textAnchor="middle"
              fontFamily="Alegreya SC, serif"
              fontWeight="800"
              fontSize="7.5"
              fill="#F0EAD6"
              letterSpacing="1.2"
            >
              STOPPER
            </text>
            <text
              x="32"
              y="40"
              textAnchor="middle"
              fontFamily="Alegreya, serif"
              fontStyle="italic"
              fontWeight="500"
              fontSize="9"
              fill="#F0EAD6"
            >
              · {count} ·
            </text>
          </svg>
        </div>
      )}
    </section>
  )
}
