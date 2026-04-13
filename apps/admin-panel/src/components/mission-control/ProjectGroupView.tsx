import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { BusinessTask, TaskStatus, TaskDomain } from '../../hooks/useBusinessTasks'
import { deriveProjectGroups } from '../../utils/taskGrouping'
import type { ProjectGroup } from '../../utils/taskGrouping'

const DOMAIN_EMOJI: Record<TaskDomain, string> = {
  kitchen: '🍳', procurement: '📦', finance: '💰', marketing: '📢',
  ops: '⚙️', sales: '💎', strategy: '🧭', tech: '💻',
}

const DOMAIN_ACCENT: Record<TaskDomain, { border: string; bg: string; text: string }> = {
  kitchen:     { border: 'border-l-orange-500', bg: 'bg-orange-500/5',  text: 'text-orange-400' },
  procurement: { border: 'border-l-yellow-500', bg: 'bg-yellow-500/5',  text: 'text-yellow-400' },
  finance:     { border: 'border-l-emerald-500', bg: 'bg-emerald-500/5', text: 'text-emerald-400' },
  marketing:   { border: 'border-l-pink-500',   bg: 'bg-pink-500/5',    text: 'text-pink-400' },
  ops:         { border: 'border-l-sky-500',    bg: 'bg-sky-500/5',     text: 'text-sky-400' },
  sales:       { border: 'border-l-violet-500', bg: 'bg-violet-500/5',  text: 'text-violet-400' },
  strategy:    { border: 'border-l-indigo-500', bg: 'bg-indigo-500/5',  text: 'text-indigo-400' },
  tech:        { border: 'border-l-cyan-500',   bg: 'bg-cyan-500/5',    text: 'text-cyan-400' },
}

const STATUS_BADGE: Record<TaskStatus, string> = {
  in_progress: 'bg-amber-500/15 text-amber-400 ring-amber-500/20',
  blocked:     'bg-red-500/15 text-red-400 ring-red-500/20',
  done:        'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20',
  inbox:       'bg-slate-500/15 text-slate-400 ring-slate-500/20',
  backlog:     'bg-blue-500/15 text-blue-400 ring-blue-500/20',
  cancelled:   'bg-slate-500/10 text-slate-500 ring-slate-500/15',
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  in_progress: 'active', blocked: 'blocked', done: 'done',
  inbox: 'inbox', backlog: 'backlog', cancelled: 'cancelled',
}

function taskEmoji(task: BusinessTask): string {
  const t = task.title.toLowerCase()
  if (t.includes('buy') || t.includes('purchase') || t.includes('order')) return '🛒'
  if (t.includes('fix') || t.includes('bug')) return '🔧'
  if (t.includes('design') || t.includes('ui') || t.includes('layout')) return '🎨'
  if (t.includes('test') || t.includes('qa')) return '🧪'
  if (t.includes('deploy') || t.includes('release')) return '🚀'
  if (t.includes('doc') || t.includes('write') || t.includes('spec')) return '📝'
  if (t.includes('migration') || t.includes('database') || t.includes('db')) return '🗄️'
  if (t.includes('menu') || t.includes('dish') || t.includes('recipe')) return '🍽️'
  if (t.includes('receipt') || t.includes('invoice') || t.includes('expense')) return '🧾'
  if (t.includes('schedule') || t.includes('plan')) return '📋'
  if (t.includes('furniture') || t.includes('equipment')) return '🪑'
  if (t.includes('clean') || t.includes('waste')) return '🧹'
  if (t.includes('staff') || t.includes('hire') || t.includes('train')) return '👥'
  return DOMAIN_EMOJI[task.domain] ?? '📌'
}

function projectEmoji(title: string): string {
  const t = title.toLowerCase()
  if (t.includes('kds') || t.includes('kitchen display')) return '📺'
  if (t.includes('kitchen ux') || t.includes('kitchen ui')) return '👨‍🍳'
  if (t.includes('procurement') || t.includes('opening')) return '🏗️'
  if (t.includes('brain') || t.includes('knowledge')) return '🧠'
  if (t.includes('receipt') || t.includes('ocr')) return '📸'
  if (t.includes('menu')) return '📖'
  if (t.includes('schedule') || t.includes('planner')) return '📅'
  if (t.includes('finance')) return '💰'
  if (t.includes('admin')) return '⚡'
  return '📂'
}

function ProgressBar({ tasks }: { tasks: BusinessTask[] }) {
  const total = tasks.length
  if (total === 0) return null
  const done = tasks.filter(c => c.status === 'done').length
  const inProgress = tasks.filter(c => c.status === 'in_progress').length
  const blocked = tasks.filter(c => c.status === 'blocked').length
  const rest = total - done - inProgress - blocked
  const pct = Math.round((done / total) * 100)

  return (
    <div className="flex items-center gap-3 w-full max-w-[200px]">
      <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-slate-800/80">
        {done > 0 && <div className="bg-emerald-400 transition-all duration-300" style={{ width: `${(done / total) * 100}%` }} />}
        {inProgress > 0 && <div className="bg-amber-400 transition-all duration-300" style={{ width: `${(inProgress / total) * 100}%` }} />}
        {blocked > 0 && <div className="bg-red-400 transition-all duration-300" style={{ width: `${(blocked / total) * 100}%` }} />}
        {rest > 0 && <div className="bg-slate-700 transition-all duration-300" style={{ width: `${(rest / total) * 100}%` }} />}
      </div>
      <span className="text-[11px] font-semibold tabular-nums text-slate-300 shrink-0">{pct}%</span>
    </div>
  )
}

function StatusSummary({ tasks }: { tasks: BusinessTask[] }) {
  const counts = new Map<TaskStatus, number>()
  for (const t of tasks) counts.set(t.status, (counts.get(t.status) ?? 0) + 1)
  const order: TaskStatus[] = ['in_progress', 'blocked', 'inbox', 'backlog', 'done']
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {order.map(status => {
        const count = counts.get(status)
        if (!count) return null
        return (
          <span key={status} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${STATUS_BADGE[status]}`}>
            {count} {STATUS_LABEL[status]}
          </span>
        )
      })}
    </div>
  )
}

function ChildRow({ task, onClick, isLast }: { task: BusinessTask; onClick: () => void; isLast: boolean }) {
  const emoji = taskEmoji(task)
  return (
    <div className="flex items-stretch">
      <div className="flex flex-col items-center w-6 shrink-0">
        <div className={`w-px bg-slate-700/50 ${isLast ? 'h-3' : 'flex-1'}`} />
        <div className="w-3 h-px bg-slate-700/50" />
        {!isLast && <div className="w-px bg-slate-700/50 flex-1" />}
      </div>
      <div onClick={onClick} className="group flex flex-1 cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-slate-800/50 transition-colors duration-150">
        <span className="text-sm shrink-0 leading-none" role="img">{emoji}</span>
        <span className="text-[12px] font-medium text-slate-200 truncate flex-1 group-hover:text-white transition-colors">{task.title}</span>
        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${STATUS_BADGE[task.status]}`}>{STATUS_LABEL[task.status]}</span>
        {task.priority === 'critical' && <span className="shrink-0 rounded-md bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-400 ring-1 ring-inset ring-red-500/20">!!!</span>}
        {task.priority === 'high' && <span className="shrink-0 text-[10px] font-medium text-orange-400">high</span>}
      </div>
    </div>
  )
}

function ProjectCard({ group, defaultExpanded, onOpenDetail }: { group: ProjectGroup; defaultExpanded: boolean; onOpenDetail: (task: BusinessTask) => void }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const Icon = expanded ? ChevronDown : ChevronRight
  const domain = group.parent.domain as TaskDomain
  const accent = DOMAIN_ACCENT[domain] ?? DOMAIN_ACCENT.tech
  const emoji = projectEmoji(group.parent.title)
  const childCount = group.children.length

  return (
    <div className={`rounded-xl border-l-[3px] ${accent.border} border border-slate-800/40 ${accent.bg} overflow-hidden transition-all duration-200`}>
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-white/[0.02] transition-colors duration-150">
        <span className="text-xl leading-none mt-0.5" role="img">{emoji}</span>
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-slate-50 truncate">{group.parent.title}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${accent.text} bg-white/5`}>{childCount} {childCount === 1 ? 'task' : 'tasks'}</span>
            <Icon className="h-4 w-4 text-slate-500 shrink-0 ml-auto" />
          </div>
          <div className="flex items-center gap-3">
            <ProgressBar tasks={group.children} />
            <StatusSummary tasks={group.children} />
          </div>
        </div>
      </button>
      {expanded && childCount > 0 && (
        <div className="px-4 pb-3 pt-0.5 ml-4 border-t border-slate-800/20">
          {group.children.map((task, i) => <ChildRow key={task.id} task={task} onClick={() => onOpenDetail(task)} isLast={i === childCount - 1} />)}
        </div>
      )}
      {expanded && childCount === 0 && (
        <div className="px-4 pb-3 pt-1 ml-4 border-t border-slate-800/20">
          <p className="text-[11px] text-slate-600 italic pl-6">No child tasks yet</p>
        </div>
      )}
    </div>
  )
}

export interface ProjectGroupViewProps {
  tasks: BusinessTask[]
  allTasks?: BusinessTask[]
  onOpenDetail: (task: BusinessTask) => void
}

export function ProjectGroupView({ tasks, allTasks, onOpenDetail }: ProjectGroupViewProps) {
  const { projects, orphans } = useMemo(() => deriveProjectGroups(tasks, allTasks), [tasks, allTasks])

  if (projects.length === 0 && orphans.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-800/60 bg-slate-900/20 px-6 py-10">
        <p className="text-[12px] text-slate-600">No tasks to display</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {projects.map(group => (
        <ProjectCard key={group.parent.id} group={group} defaultExpanded={group.children.some(c => c.status === 'in_progress' || c.status === 'blocked')} onOpenDetail={onOpenDetail} />
      ))}
      {orphans.length > 0 && (
        <div className="rounded-xl border border-slate-800/40 bg-slate-900/20 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800/30">
            <span className="text-lg leading-none" role="img">{'📌'}</span>
            <span className="text-[13px] font-semibold text-slate-400">Standalone Tasks</span>
            <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-semibold text-slate-300">{orphans.length}</span>
          </div>
          <div className="px-4 py-2">
            {orphans.map((task, i) => <ChildRow key={task.id} task={task} onClick={() => onOpenDetail(task)} isLast={i === orphans.length - 1} />)}
          </div>
        </div>
      )}
    </div>
  )
}
