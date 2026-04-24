import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DAY_1_CATEGORIES, readinessSummary } from './dishes-config'

/** Fixed 13-tick ruler — shared shape for phase ruler + menu legend placeholders. */
function Chevron() {
  return (
    <svg
      className="cat-chev"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export function DishAccordion() {
  const navigate = useNavigate()
  const [openSet, setOpenSet] = useState<Set<string>>(
    () =>
      new Set(
        DAY_1_CATEGORIES.filter((c) => c.defaultOpen).map((c) => c.name),
      ),
  )

  function toggle(name: string) {
    setOpenSet((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <>
      <div className="menu-head">
        <span className="caption">THE 12 · DAY-1 MENU</span>
        <span className="legend">
          <span className="lc">
            <i />
            LOCKED
          </span>
          <span className="tn">
            <i />
            TUNING
          </span>
          <span className="op">
            <i />
            OPEN
          </span>
        </span>
      </div>

      <div className="menu">
        {DAY_1_CATEGORIES.map((cat) => {
          const { label: readyLabel, kind: readyKind } = readinessSummary(
            cat.dishes,
          )
          const isOpen = openSet.has(cat.name)
          const headId = `dishcat-head-${cat.name.replace(/\W+/g, '-').toLowerCase()}`
          const bodyId = `dishcat-body-${cat.name.replace(/\W+/g, '-').toLowerCase()}`

          return (
            <div
              key={cat.name}
              className={`cat${isOpen ? ' is-open' : ''}`}
              data-ready={readyKind}
            >
              <button
                type="button"
                className="cat-head"
                onClick={() => toggle(cat.name)}
                aria-expanded={isOpen}
                aria-controls={bodyId}
                id={headId}
              >
                <Chevron />
                <span className="cat-name">{cat.name}</span>
                <span className="cat-count">
                  {cat.dishes.length} {cat.dishes.length === 1 ? 'dish' : 'dishes'}
                </span>
                <span className="cat-readiness">{readyLabel}</span>
              </button>
              <div
                className="cat-body"
                id={bodyId}
                role="region"
                aria-labelledby={headId}
                aria-hidden={!isOpen}
              >
                <div className="inner">
                  <ul>
                    {cat.dishes.map((d) => (
                      <li
                        key={d.code}
                        data-lock={d.lock}
                        onClick={() => navigate(`/menu#dish-${d.code}`)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            navigate(`/menu#dish-${d.code}`)
                          }
                        }}
                      >
                        <span className="bullet" aria-hidden />
                        <span className="rd" aria-hidden />
                        <span className="d-name">
                          {d.name}
                          {d.note && <span className="d-note"> · {d.note}</span>}
                        </span>
                        <span className="d-status">{d.lock.toUpperCase()}</span>
                        <span className="d-link" aria-hidden>
                          ↗
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
