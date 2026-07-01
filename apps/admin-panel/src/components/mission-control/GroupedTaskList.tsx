import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { BusinessTask, TaskStatus } from '../../hooks/useBusinessTasks'
import {
  type GroupBy,
  deriveTopicGroups,
  deriveAgentGroups,
  statusBreakdown,
  sortedGroups,
} from '../../utils/taskGrouping'

// ── Emoji helpers ───────────────────────────────────────────────────────────

const TOPIC_EMOJI: Record<string, string> = {
  'admin-panel': '⚡',
  'mc-ui': '🎛️',
  kds: '📺',
  kitchen: '🍳',
  finance: '💰',
  procurement: '📦',
  receipt: '🧾',
  brain: '🧠',
  menu: '📖',
  schedule: '📅',
  bom: '🧱',
  ux: '🎨',
  ops: '⚙️',
  tech: '💻',
  marketing: '📢',
  sales: '💎',
  strategy: '🧭',
  security: '🔒',
  inventory: '📊',
  equipment: '🔧',
}

const AGENT_EMOJI: Record<string, string> = {
  lesia: '👑',
  bas: '👤',
  'tech-lead': '🤖',
  coo: '🎯',
  code: '💻',
  chef: '👨‍🍳',
  finance: '💰',
  owner: '👑',
}

function topicEmoji(key: string): string {
  const lower = key.toLowerCase()
  for (const [pattern, emoji] of Object.entries(TOPIC_EMOJI)) {
    if (lower.includes(pattern)) return emoji
  }
  return '📁'
}

function agentEmoji(key: string): string {
  return AGENT_EMOJI[key.toLowerCase()] ?? '🤖'
}

// ── Status breakdown ────────────────────────────────────────────────────────

const STATUS_DOT_COLORS: Record<TaskStatus, string> = {
  inbox: 'bg-[var(--s-3)]',
  backlog: 'bg-honey-300',
  in_progress: 'bg-amber-watch',
  blocked: 'bg-[var(--color-royal-red)]',
  done: 'bg-[var(--color-royal-soft)]',
  cancelled: 'bg-[var(--s-3)]',
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: 'inbox',
  backlog: 'backlog',
  in_progress: 'active',
  blocked: 'blocked',
  done: 'done',
  cancelled: 'cancelled',
}

function StatusBreakdownBadges({ tasks }: { tasks: BusinessTask[] }) {
  const breakdown = statusBreakdown(tasks)
  const entries = (Object.entries(breakdown) as [TaskStatus, number][]).filter(
    ([, count]) => count > 0,
  )
  if (entries.length === 0) return null

  return (
    <span className="flex items-center gap-2 text-[10px] text-cream/45">
      {entries.map(([status, count]) => (
        <span key={status} className="inline-flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_COLORS[status]}`} />
          {count} {STATUS_LABELS[status]}
        </span>
      ))}
    </span>
  )
}

// ── Group Section ───────────────────────────────────────────────────────────

function GroupSection({
  groupKey,
  tasks,
  renderItem,
  defaultExpanded,
  emoji,
}: {
  groupKey: string
  tasks: BusinessTask[]
  renderItem: (task: BusinessTask) => React.ReactNode
  defaultExpanded: boolean
  emoji: string
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const Icon = expanded ? ChevronDown : ChevronRight

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--s-1)] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-[var(--s-2)] transition"
      >
        <span className="text-base leading-none" role="img">
          {emoji}
        </span>
        <Icon className="h-4 w-4 text-cream/45 shrink-0" />
        <span className="text-[13px] font-semibold text-cream capitalize">{groupKey}</span>
        <span className="rounded-full bg-[var(--s-3)] px-2 py-0.5 text-[10px] font-semibold text-cream/80">
          {tasks.length}
        </span>
        <StatusBreakdownBadges tasks={tasks} />
      </button>
      {expanded && (
        <div className="space-y-1 px-4 pb-3 pt-1 border-t border-[var(--line)]">
          {tasks.map((task) => renderItem(task))}
        </div>
      )}
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────

export function GroupedTaskList({
  tasks,
  groupBy,
  renderItem,
}: {
  tasks: BusinessTask[]
  groupBy: GroupBy
  renderItem: (task: BusinessTask) => React.ReactNode
}) {
  const groups = useMemo(() => {
    if (groupBy === 'none' || groupBy === 'project') return null
    const raw = groupBy === 'topic' ? deriveTopicGroups(tasks) : deriveAgentGroups(tasks)
    return sortedGroups(raw)
  }, [tasks, groupBy])

  if (groupBy === 'none' || groupBy === 'project' || !groups) {
    return <div className="space-y-2">{tasks.map((task) => renderItem(task))}</div>
  }

  if (tasks.length === 0) {
    return <p className="py-10 text-center text-sm text-cream/30">No tasks match this filter</p>
  }

  const emojiFn = groupBy === 'agent' ? agentEmoji : topicEmoji

  return (
    <div className="space-y-3">
      {groups.map(([key, groupTasks]) => (
        <GroupSection
          key={key}
          groupKey={key}
          tasks={groupTasks}
          renderItem={renderItem}
          defaultExpanded
          emoji={emojiFn(key)}
        />
      ))}
    </div>
  )
}
