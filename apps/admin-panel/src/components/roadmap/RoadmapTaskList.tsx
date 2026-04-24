import { useNavigate } from 'react-router-dom'
import type { RoadmapTask } from '../../hooks/useOpeningRoadmap'
import { OwnerChip } from './OwnerChip'

/**
 * Task-row status used by the stylesheet's data-status selector. Collapses
 * RoadmapTask statuses onto the four visual states the prototype defines
 * (done / in_progress / blocked / idle).
 */
function taskStatusAttr(t: RoadmapTask): 'done' | 'in_progress' | 'blocked' | 'idle' {
  if (t.status === 'done') return 'done'
  if (t.status === 'in_progress') return 'in_progress'
  if (t.status === 'blocked' || t.isBlocker) return 'blocked'
  return 'idle'
}

const STATUS_RANK: Record<RoadmapTask['status'], number> = {
  blocked: 0,
  in_progress: 1,
  inbox: 2,
  backlog: 3,
  done: 4,
  cancelled: 5,
}

function sortTasks(tasks: readonly RoadmapTask[]): RoadmapTask[] {
  return [...tasks].sort((a, b) => {
    // Active blockers bubble to top
    const aB = a.isBlocker && a.status !== 'done' ? 0 : 1
    const bB = b.isBlocker && b.status !== 'done' ? 0 : 1
    if (aB !== bB) return aB - bB
    const aS = STATUS_RANK[a.status] ?? 3
    const bS = STATUS_RANK[b.status] ?? 3
    if (aS !== bS) return aS - bS
    return a.title.localeCompare(b.title)
  })
}

interface RoadmapTaskListProps {
  tasks: readonly RoadmapTask[]
}

export function RoadmapTaskList({ tasks }: RoadmapTaskListProps) {
  const navigate = useNavigate()
  const sorted = sortTasks(tasks)

  if (sorted.length === 0) {
    return (
      <p
        style={{
          fontFamily: 'var(--f-display)',
          fontStyle: 'italic',
          color: 'var(--cream-dim)',
          fontSize: 14,
          margin: '12px 0 4px',
        }}
      >
        No tasks yet — tag with <code>phase-N</code> in Mission Control.
      </p>
    )
  }

  return (
    <ul className="tasks">
      {sorted.map((t) => (
        <li key={t.id} style={{ listStyle: 'none' }}>
          <button
            type="button"
            className="task"
            data-status={taskStatusAttr(t)}
            onClick={() => navigate(`/mission?task=${t.id}`)}
            aria-label={`Open task ${t.title} in Mission Control`}
          >
            <span className="dot" aria-hidden />
            <OwnerChip owner={t.owner} />
            <span className="label">{t.title}</span>
            <span className="id">{t.id.slice(0, 8)}</span>
            <span className="link">OPEN ↗</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
