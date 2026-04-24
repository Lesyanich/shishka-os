import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { OwnerChip } from './OwnerChip'
import type { MustDoSummary, RoadmapTask } from '../../hooks/useOpeningRoadmap'

/**
 * Maps RoadmapTask status to the prototype's three-state dot.
 * 'done' → done (filled + check), 'in_progress' → doing (amber glow),
 * anything else (blocked, inbox, backlog) → idle ring.
 */
function dotStatus(status: RoadmapTask['status']): 'done' | 'in_progress' | 'idle' {
  if (status === 'done') return 'done'
  if (status === 'in_progress') return 'in_progress'
  return 'idle'
}

function badgeLabel(status: RoadmapTask['status']): string {
  if (status === 'done') return 'DONE'
  if (status === 'in_progress') return 'DOING'
  return 'TODO'
}

/**
 * Due-chip copy:
 *   - null due → no chip
 *   - overdue → "· OVERDUE"
 *   - today → "· DUE TODAY"
 *   - within 7 days → "· DUE {WEEKDAY}"
 *   - later → no chip (would add noise)
 */
function formatDueChip(
  due: string | null,
  now: Date,
): { text: string; overdue: boolean } | null {
  if (!due) return null
  const target = new Date(`${due}T00:00:00`)
  if (Number.isNaN(target.getTime())) return null

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const dayDiff = Math.round(
    (target.getTime() - startOfToday.getTime()) / 86_400_000,
  )

  if (dayDiff < 0) return { text: '· OVERDUE', overdue: true }
  if (dayDiff === 0) return { text: '· DUE TODAY', overdue: false }
  if (dayDiff <= 7) {
    const weekday = target
      .toLocaleDateString('en-US', { weekday: 'short' })
      .toUpperCase()
    return { text: `· DUE ${weekday}`, overdue: false }
  }
  return null
}

interface CountdownState {
  days: number
  hours: number
  minutes: number
  seconds: number
  elapsed: boolean
}

/**
 * Computes time-left until the lock instant. `lockDay` is treated as
 * Asia/Bangkok 09:00:00 (ICT / UTC+7). Exported for unit tests.
 */
export function computeCountdown(
  lockDay: string,
  now: Date,
): CountdownState {
  const target = new Date(`${lockDay}T09:00:00+07:00`)
  let ms = target.getTime() - now.getTime()
  const elapsed = ms <= 0
  if (elapsed) ms = 0
  return {
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms % 86_400_000) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
    seconds: Math.floor((ms % 60_000) / 1_000),
    elapsed,
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0')

interface BeforeRecipeLockProps {
  lockDay: string // ISO date "YYYY-MM-DD"
  mustDo: MustDoSummary
}

export function BeforeRecipeLock({ lockDay, mustDo }: BeforeRecipeLockProps) {
  const navigate = useNavigate()
  const [now, setNow] = useState<Date>(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const cd = computeCountdown(lockDay, now)

  return (
    <section className="primary" aria-labelledby="primary-title">
      <div className="overline-strong">
        <span className="dot" />
        PRIMARY FOCUS · TO SHIP BEFORE LOCK
      </div>

      <div className="primary-grid">
        <div className="primary-left">
          <h1 id="primary-title" className="primary-title">
            Before Recipe <em>Lock</em>
          </h1>
          <div className="primary-sub">
            Everything that must be finished before Tuesday, April 28 — the day the menu is frozen.
          </div>
          <div className="countdown-big" role="timer" aria-live="polite">
            <div className="cd-number">{pad2(cd.days)}</div>
            <div className="cd-unit">
              days <em>remaining</em>
            </div>
            <div className="cd-clock">
              {pad2(cd.hours)} : {pad2(cd.minutes)} : {pad2(cd.seconds)}
            </div>
            <div className="cd-lockdate">
              <span className="cd-lockdate-time">Locks Tue 28 Apr · 9:00 AM</span>
              <span className="cd-lockdate-tz">BANGKOK · ICT</span>
            </div>
          </div>
        </div>

        <div className="primary-right">
          <div className="mustdo-head">
            <span className="caption">
              The five things standing between us and a locked menu.
            </span>
            <span className="mustdo-progress">
              <b>{mustDo.done}</b> done · <b>{mustDo.doing}</b> doing · <b>{mustDo.todo}</b> to go
            </span>
          </div>

          {mustDo.items.length === 0 ? (
            <div className="mustdo">
              <div style={{ padding: '24px 20px', textAlign: 'center' }}>
                <span className="caption" style={{ fontStyle: 'italic' }}>
                  Nothing outstanding for Recipe Lock. 🎯
                </span>
              </div>
            </div>
          ) : (
            <ol className="mustdo">
              {mustDo.items.map((task) => {
                const due = formatDueChip(task.due_date, now)
                const ds = dotStatus(task.status)
                return (
                  <li key={task.id} style={{ listStyle: 'none' }}>
                    <button
                      type="button"
                      className="mi"
                      data-status={ds}
                      onClick={() => navigate(`/mission?task=${task.id}`)}
                      aria-label={`Open task ${task.title} in Mission Control`}
                    >
                      <span className="mi-dot" aria-hidden />
                      <div className="mi-body">
                        <div className="mi-label">{task.title}</div>
                        <div className="mi-meta">
                          <OwnerChip owner={task.owner} />
                          <span className="mi-id">{task.id.slice(0, 8)}</span>
                          {due && (
                            <span className={due.overdue ? 'mi-over' : 'mi-due'}>
                              {due.text}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="mi-badge">{badgeLabel(task.status)}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </div>
    </section>
  )
}
