import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, FolderOpen, Inbox } from 'lucide-react'
import type { BusinessTask, TaskStatus } from '../../hooks/useBusinessTasks'
import { deriveProjectGroups } from '../../utils/taskGrouping'
import type { ProjectGroup } from '../../utils/taskGrouping'

// ── Status colors ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<TaskStatus, string> = {
  done: 'bg-emerald-400',
  in_progress: 'bg-amber-400',
  blocked: 'bg-red-400',
  inbox: 'bg-slate-500',
  backlog: 'bg-blue-400',
  cancelled: 'bg-slate-600',
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-slate-300',
  low: 'text-slate-500',
}

// ── Progress Bar ────────────────────────────────────────────────────────────

function ProgressBar({ children }: { children: ProjectGroup['children'] }) {
  const total = children.length
  if (total === 0) return null

  const done = children.filter(c => c.status === 'done').length
  const inProgress = children.filter(c => c.status === 'in_progress').length
  const blocked = children.filter(c => c.status === 'blocked').length
  const rest = total - done - inProgress - blocked

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
        {done > 0 && (
          <div className="bg-emerald-400" style={{ width: `${(done / total) * 100}%` }} />
        )}
        {inProgress > 0 && (
          <div className="bg-amber-400" style={{ width: `${(inProgress / total) * 100}%` }} />
        )}
        {blocked > 0 && (
          <div className="bg-red-400" style={{ width: `${(blocked / total) * 100}%` }} />
        )}
        {rest > 0 && (
          <div className="bg-slate-600" style={{ width: `${(rest / total) * 100}%` }} />
        )}
      </div>
      <span className="text-[10px] font-mono text-slate-400 shrink-0">
        {done}/{total}
      </span>
    </div>
  )
}

// ── Status Dots ─────────────────────────────────────────────────────────────

function StatusDots({ children }: { children: ProjectGroup['children'] }) {
  const counts = new Map<TaskStatus, number>()
  for (const c of children) {
    counts.set(c.status, (counts.get(c.status) ?? 0) + 1)
  }

  const entries = [...counts.entries()].filter(([, n]) => n > 0)
  if (entries.length === 0) return null

  const labels: Record<TaskStatus, string> = {
    done: 'done',
    in_progress: 'active',
    blocked: 'blocked',
    inbox: 'inbox',
    backlog: 'backlog',
    cancelled: 'cancelled',
  }

  return (
    <span className="flex items-center gap-2 text-[10px] text-slate-500">
      {entries.map(([status, count]) => (
        <span key={status} className="inline-flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_COLORS[status]}`} />
          {count} {labels[status]}
        </span>
      ))}
    </span>
  )
}

// ── Child Task Row ──────────────────────────────────────────────────────────

function ChildRow({ task, onClick }: { task: BusinessTask; onClick: () => void }) {
  const priorityColor = PRIORITY_COLORS[task.priority] ?? 'text-slate-400'

  return (
    <div
      onClick={onClick}
      className="group flex cursor-pointer items-center gap-3 rounded-lg border border-slate-800/30 bg-slate-900/40 px-3 py-2 hover:border-slate-700/50 hover:bg-slate-800/40 transition"
    >
      {/* Priority dot */}
      <span className={`h-2 w-2 rounded-full shrink-0 ${
        task.priority === 'critical' ? 'bg-red-400' :
        task.priority === 'high' ? 'bg-orange-400' :
        task.priority === 'medium' ? 'bg-blue-400' : 'bg-slate-500'
      }`} />
      {/* Title */}
      <span className="text-xs font-medium text-slate-100 truncate flex-1">{task.title}</span>
      {/* Status */}
      <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${
        task.status === 'in_progress' ? 'bg-amber-500/10 text-amber-400' :
        task.status === 'blocked' ? 'bg-red-500/10 text-red-400' :
        task.status === 'done' ? 'bg-emerald-500/10 text-emerald-400' :
        task.status === 'inbox' ? 'bg-slate-500/10 text-slate-400' :
        'bg-blue-500/10 text-blue-400'
      }`}>{task.status.replace('_', ' ')}</span>
      {/* Priority label */}
      <span className={`text-[9px] font-medium ${priorityColor}`}>{task.priority}</span>
    </div>
  )
}

// ── Project Accordion ───────────────────────────────────────────────────────

function ProjectAccordion({
  group,
  defaultExpanded,
  onOpenDetail,
}: {
  group: ProjectGroup
  defaultExpanded: boolean
  onOpenDetail: (task: BusinessTask) => void
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const Icon = expanded ? ChevronDown : ChevronRight

  return (
    <div className="rounded-xl border border-slate-800/50 bg-slate-900/30 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/30 transition"
      >
        <Icon className="h-4 w-4 text-slate-500 shrink-0" />
        <FolderOpen className="h-4 w-4 text-violet-400 shrink-0" />
        <span className="text-sm font-semibold text-slate-100 truncate flex-1">
          {group.parent.title}
        </span>
        <ProgressBar>{group.children}</ProgressBar>
      </button>

      {/* Status summary — always visible */}
      <div className="px-4 pb-2 -mt-1">
        <StatusDots>{group.children}</StatusDots>
      </div>

      {/* Children — only when expanded */}
      {expanded && group.children.length > 0 && (
        <div className="space-y-1 px-4 pb-3 pt-1 border-t border-slate-800/30">
          {group.children.map(task => (
            <ChildRow
              key={task.id}
              task={task}
              onClick={() => onOpenDetail(task)}
            />
          ))}
        </div>
      )}

      {expanded && group.children.length === 0 && (
        <div className="px-4 pb-3 pt-1 border-t border-slate-800/30">
          <p className="text-[11px] text-slate-600 italic">No child tasks</p>
        </div>
      )}
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export interface ProjectGroupViewProps {
  tasks: BusinessTask[]
  allTasks?: BusinessTask[]
  onOpenDetail: (task: BusinessTask) => void
}

export function ProjectGroupView({ tasks, allTasks, onOpenDetail }: ProjectGroupViewProps) {
  const { projects, orphans } = useMemo(() => deriveProjectGroups(tasks, allTasks), [tasks, allTasks])

  if (projects.length === 0 && orphans.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-800/60 bg-slate-900/20 px-6 py-8">
        <p className="text-[12px] text-slate-600">No tasks to display</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Project groups */}
      {projects.map(group => (
        <ProjectAccordion
          key={group.parent.id}
          group={group}
          defaultExpanded={group.children.some(c => c.status === 'in_progress' || c.status === 'blocked')}
          onOpenDetail={onOpenDetail}
        />
      ))}

      {/* Orphan tasks */}
      {orphans.length > 0 && (
        <div className="rounded-xl border border-slate-800/50 bg-slate-900/30 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <Inbox className="h-4 w-4 text-slate-500 shrink-0" />
            <span className="text-sm font-medium text-slate-400">Ungrouped</span>
            <span className="rounded-full bg-slate-700 px-1.5 text-[10px] text-slate-300">
              {orphans.length}
            </span>
          </div>
          <div className="space-y-1 px-4 pb-3 border-t border-slate-800/30 pt-2">
            {orphans.map(task => (
              <ChildRow
                key={task.id}
                task={task}
                onClick={() => onOpenDetail(task)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
