import shishkaLogo from '../assets/shishka-logo.png'
import './OpeningRoadmap.css'

type MustdoStatus = 'done' | 'in_progress' | 'idle'

interface MustdoItem {
  status: MustdoStatus
  label: string
  who: string
  id: string
  due?: string
}

interface BlockerItem {
  title: string
  age: string
  why: string
  who: string
  phase: string
}

const MUSTDO: MustdoItem[] = [
  { status: 'done', label: 'Final tasting — shakshuka variant B', who: 'BAS', id: 'MC-0041' },
  { status: 'in_progress', label: "Lock za'atar dough hydration %", who: 'BAS', id: 'MC-0042', due: '· DUE TODAY' },
  { status: 'in_progress', label: 'Chicken bowl — reduce sauce salinity by 8%', who: 'BAS', id: 'MC-0043', due: '· DUE SUN' },
  { status: 'idle', label: 'CEO & Bas signoff on final 12 dishes', who: 'LESYA', id: 'MC-0044', due: '· DUE MON' },
  { status: 'idle', label: 'Announce experiment moratorium to kitchen team', who: 'LESYA', id: 'MC-0045' },
]

const BLOCKERS: BlockerItem[] = [
  {
    title: 'Cold prep station SOP blocked by layout',
    age: '5d',
    why: 'Cannot finalize cold prep SOP until L2 floor layout is locked. Layout locks when architect returns final drawings.',
    who: 'BAS → CEO',
    phase: 'PHASE 01',
  },
  {
    title: 'Fiber install — provider rescheduled twice',
    age: '3d',
    why: 'ToT marked install "pending" without a new date. Without internet, POS + KDS can\'t commission on time.',
    who: 'COO → PROVIDER',
    phase: 'PHASE 03',
  },
]

const STATUS_BADGE: Record<MustdoStatus, string> = {
  done: 'DONE',
  in_progress: 'DOING',
  idle: 'TODO',
}

export function OpeningRoadmap() {
  return (
    <div className="roadmap-shell">
      {/* Topbar */}
      <div className="r-topbar">
        <div className="r-brand">
          <img className="r-brand-icon" src={shishkaLogo} alt="Shishka pine cone" />
          <div>
            <div className="r-brand-text">SHISHKA</div>
            <div className="r-brand-sub">Healthy Kitchen</div>
          </div>
        </div>
        <div className="r-top-meta">
          <div className="r-item-today">
            <div className="r-k">Today</div>
            <div className="r-v">Sat 25 Apr</div>
          </div>
          <div>
            <div className="r-k">Recipe Lock</div>
            <div className="r-v">Tue 28 Apr</div>
          </div>
        </div>
      </div>

      {/* PART ONE — Calendar */}
      <div className="r-section-head">
        <span className="r-num">PART ONE</span>
        <h2>The <em>Calendar</em></h2>
        <span className="r-spacer" />
        <span className="r-tag">TODAY → SOFT OPENING</span>
      </div>

      <section className="r-calendar">
        <div className="r-cal-track">
          <div className="r-cal-line">
            <div className="r-cal-days">
              <div className="r-t r-maj"><span>Apr 25</span></div>
              <div className="r-t" />
              <div className="r-t r-maj"><span>Apr 28</span></div>
              <div className="r-t" />
              <div className="r-t r-maj"><span>May 05</span></div>
              <div className="r-t" />
              <div className="r-t r-maj"><span>May 12</span></div>
              <div className="r-t" />
              <div className="r-t r-maj"><span>May 22</span></div>
              <div className="r-t" />
              <div className="r-t r-maj"><span>Jun 05</span></div>
            </div>
          </div>
          <div className="r-cal-markers">
            <div className="r-marker r-today r-pin-left" style={{ left: '0%' }}>
              <div className="r-m-flag" />
              <div className="r-m-pin" />
              <div className="r-m-label">Today</div>
              <div className="r-m-date">Sat 25 Apr</div>
            </div>
            <div className="r-marker r-menu" style={{ left: '18%' }}>
              <div className="r-m-flag" />
              <div className="r-m-pin" />
              <div className="r-m-label">Recipe Lock</div>
              <div className="r-m-date">Tue 28 Apr</div>
            </div>
            <div className="r-marker r-trial" style={{ left: '50%' }}>
              <div className="r-m-flag" />
              <div className="r-m-pin" />
              <div className="r-m-label">Test Batch 1</div>
              <div className="r-m-date">Tue 12 May</div>
            </div>
            <div className="r-marker r-trial" style={{ left: '78%' }}>
              <div className="r-m-flag" />
              <div className="r-m-pin" />
              <div className="r-m-label">Dry-run Service</div>
              <div className="r-m-date">Fri 22 May</div>
            </div>
            <div className="r-marker r-open r-pin-right" style={{ left: '100%' }}>
              <div className="r-m-flag" />
              <div className="r-m-pin" />
              <div className="r-m-label">Soft Opening</div>
              <div className="r-m-date">Fri 05 Jun</div>
            </div>
          </div>
        </div>
      </section>

      {/* FOCUS ROW — Primary + Blockers */}
      <div className="r-focus-row">
        {/* PRIMARY */}
        <section className="r-primary">
          <div className="r-overline-strong">
            <span className="r-dot" />
            PRIMARY FOCUS · TO SHIP BEFORE LOCK
          </div>

          <div className="r-primary-grid">
            <div>
              <h1 className="r-primary-title">Before Recipe <em>Lock</em></h1>
              <div className="r-primary-sub">
                Everything that must be finished before Tuesday, April 28 — the day the menu is frozen.
              </div>
              <div className="r-countdown-big">
                <div className="r-cd-number">03</div>
                <div className="r-cd-unit">days <em>remaining</em></div>
                <div className="r-cd-lockdate">
                  <span className="r-cd-when">Locks Tue 28 Apr · 9:00 AM</span>
                  <span className="r-cd-tz">ICT</span>
                </div>
              </div>
            </div>

            <div>
              <div className="r-mustdo-head">
                <span className="r-caption">The five things standing between us and a locked menu.</span>
              </div>
              <ol className="r-mustdo">
                {MUSTDO.map((item) => (
                  <li key={item.id} className="r-mi" data-status={item.status}>
                    <span className="r-mi-dot" />
                    <div className="r-mi-body">
                      <div className="r-mi-label">{item.label}</div>
                      <div className="r-mi-meta">
                        <span className="r-mi-who">{item.who}</span>
                        <span className="r-mi-id">{item.id}</span>
                        {item.due && <span className="r-mi-due">{item.due}</span>}
                      </div>
                    </div>
                    <span className="r-mi-badge">{STATUS_BADGE[item.status]}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* BLOCKERS */}
        <section className="r-blockers-card">
          <div className="r-overline-blockers">
            <span className="r-dot" />
            STOPPERS · {BLOCKERS.length} OPEN
          </div>
          <h3>Blockers &amp; <em>Stoppers</em></h3>
          <div className="r-blockers-sub">Everything waiting on someone else before the team can move.</div>

          {BLOCKERS.map((blocker) => (
            <article key={blocker.title} className="r-blocker-row">
              <div className="r-br-title">{blocker.title}</div>
              <span className="r-br-age">{blocker.age}</span>
              <p className="r-br-why">{blocker.why}</p>
              <div className="r-br-meta">
                <span className="r-br-who">{blocker.who}</span>
                <span className="r-br-phase">{blocker.phase}</span>
                <span className="r-br-link">VIEW ↗</span>
              </div>
            </article>
          ))}

          {/* Wax seal */}
          <div className="r-seal-big" aria-hidden="true">
            <svg viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="#9B1C21" />
              <circle cx="32" cy="32" r="23" fill="none" stroke="#F0EAD6" strokeWidth="0.6" opacity="0.6" />
              <text x="32" y="30" textAnchor="middle" fontFamily="Alegreya SC, serif" fontWeight="800" fontSize="7.5" fill="#F0EAD6" letterSpacing="1.2">STOPPER</text>
              <text x="32" y="40" textAnchor="middle" fontFamily="Alegreya, serif" fontStyle="italic" fontWeight="500" fontSize="9" fill="#F0EAD6">· {BLOCKERS.length} ·</text>
            </svg>
          </div>
        </section>
      </div>
    </div>
  )
}
