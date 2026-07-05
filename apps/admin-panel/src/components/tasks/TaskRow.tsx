import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check, Clock, AlertTriangle, Repeat, Camera, Loader2, Link2, MessageSquare,
} from 'lucide-react'
import type { StaffTask } from '../../hooks/useStaffTasks'
import { useTaskPhotoUpload } from '../../hooks/useTaskPhotoUpload'
import {
  categoryMeta,
  PRIORITY_DOT,
  STATION_LABEL,
  STATION_STYLE,
  STATUS_LABEL,
  STATUS_STYLE,
  describeRecurrence,
  isOverdue,
  shortTime,
} from './taskMeta'

interface TaskRowProps {
  task: StaffTask
  onToggleDone?: (task: StaffTask) => void
  /** Open the task (tap its body) — full details, edit & delete live there. */
  onOpen?: (task: StaffTask) => void
  /** Persist a changed photo set (after camera capture). */
  onPhotosChange?: (task: StaffTask, photoUrls: string[]) => void
  showDate?: boolean
}

/**
 * One task card. Tuned for phone readability: a coloured left stripe + icon
 * names the work type at a glance, the title wraps (never truncates), and the
 * card carries only the fast in-place action (camera). Editing, deleting and
 * Telegram pushes happen in the detail view opened by tapping the card.
 */
export function TaskRow({ task, onToggleDone, onOpen, onPhotosChange, showDate }: TaskRowProps) {
  const done = task.status === 'done'
  const overdue = isOverdue(task)
  const assignee = task.staff?.name ?? 'Unassigned'
  const navigate = useNavigate()
  const { upload, isUploading } = useTaskPhotoUpload()
  const fileRef = useRef<HTMLInputElement>(null)
  const catMeta = categoryMeta(task.category)
  const CatIcon = catMeta.icon
  // todo/done read off the checkbox + strikethrough; only the exceptional
  // states still warrant an explicit badge.
  const showStatusBadge =
    !task.is_template && (task.status === 'skipped' || task.status === 'cancelled')

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!onPhotosChange || files.length === 0) return
    const added: string[] = []
    for (const file of files) {
      const res = await upload(file, task.id)
      if (res.ok && res.url) added.push(res.url)
      else if (res.error) window.alert(res.error)
    }
    if (added.length) onPhotosChange(task, [...task.photo_urls, ...added])
  }

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-l-4 border-slate-800 bg-slate-900/60 px-3 py-3 ${catMeta.accent}`}
    >
      {/* Done toggle — big tap target */}
      {onToggleDone && !task.is_template && (
        <button
          type="button"
          onClick={() => onToggleDone(task)}
          title={done ? 'Mark as to-do' : 'Mark as done'}
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition ${
            done
              ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
              : 'border-slate-700 text-transparent hover:border-emerald-500/40 hover:text-emerald-400/50'
          }`}
        >
          <Check className="h-4 w-4" />
        </button>
      )}

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div
          className={onOpen ? 'cursor-pointer' : undefined}
          onClick={onOpen ? () => onOpen(task) : undefined}
        >
          {/* Title row — wraps to two lines, never truncates */}
          <div className="flex items-start gap-2">
            <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`} />
            <span
              className={`line-clamp-2 text-[15px] font-medium leading-snug ${
                done ? 'text-slate-500 line-through' : 'text-slate-100'
              }`}
            >
              {task.title}
            </span>
            {task.is_template && (
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-300">
                <Repeat className="h-3 w-3" />
                {describeRecurrence(task)}
              </span>
            )}
          </div>

          {task.title_th && (
            <p className="mt-0.5 line-clamp-1 pl-4 text-xs text-slate-400">{task.title_th}</p>
          )}

          {/* Meta row — work type leads, then station / who / when */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium ${catMeta.style}`}
            >
              <CatIcon className="h-3 w-3" />
              {catMeta.label}
            </span>
            {task.station !== 'general' && (
              <span className={`rounded-full px-1.5 py-0.5 font-semibold ${STATION_STYLE[task.station]}`}>
                {STATION_LABEL[task.station]}
              </span>
            )}
            <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-slate-300">{assignee}</span>
            {!task.is_template && (task.due_time || (showDate && task.due_date)) && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ${
                  overdue ? 'bg-rose-500/15 text-rose-300' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {overdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                {showDate && task.due_date ? `${task.due_date} ` : ''}
                {shortTime(task.due_time)}
              </span>
            )}
            {showStatusBadge && (
              <span className={`rounded-full px-1.5 py-0.5 ${STATUS_STYLE[task.status]}`}>
                {STATUS_LABEL[task.status]}
              </span>
            )}
            {task.comment && (
              <span
                className="inline-flex items-center rounded-full bg-slate-700/40 px-1 py-0.5 text-slate-300"
                title={task.comment}
              >
                <MessageSquare className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>

        {/* Deep link chip */}
        {task.linked_route && (
          <button
            type="button"
            onClick={() => navigate(task.linked_route!)}
            className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-500/20 transition hover:bg-emerald-500/20"
          >
            <Link2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{task.linked_label ?? 'Open tab'}</span>
          </button>
        )}

        {/* Photo report thumbnails */}
        {task.photo_urls.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {task.photo_urls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="block h-12 w-12 overflow-hidden rounded-md border border-slate-700">
                <img src={url} alt="report" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Action — fast photo proof only; edit/delete/Telegram live in the detail view */}
      {onPhotosChange && !task.is_template && (
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isUploading}
            title="Add photo"
            className="rounded-md p-2 text-slate-500 transition hover:bg-slate-800 hover:text-emerald-400 disabled:cursor-wait"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={onPickFiles}
            className="hidden"
          />
        </div>
      )}
    </div>
  )
}
