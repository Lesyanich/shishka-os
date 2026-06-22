import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check, Clock, Pencil, Trash2, AlertTriangle, Repeat, Send,
  Camera, Loader2, Link2, MessageSquare,
} from 'lucide-react'
import type { StaffTask } from '../../hooks/useStaffTasks'
import { useTaskPhotoUpload } from '../../hooks/useTaskPhotoUpload'
import {
  CATEGORY_LABEL,
  CATEGORY_STYLE,
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
  onEdit?: (task: StaffTask) => void
  onDelete?: (task: StaffTask) => void
  onPush?: (task: StaffTask) => void
  /** Open the task (click on its body) — view/edit its full details. */
  onOpen?: (task: StaffTask) => void
  /** Persist a changed photo set (after camera capture). */
  onPhotosChange?: (task: StaffTask, photoUrls: string[]) => void
  showDate?: boolean
}

export function TaskRow({
  task, onToggleDone, onEdit, onDelete, onPush, onOpen, onPhotosChange, showDate,
}: TaskRowProps) {
  const done = task.status === 'done'
  const overdue = isOverdue(task)
  const assignee = task.staff?.name ?? 'Unassigned'
  const navigate = useNavigate()
  const { upload, isUploading } = useTaskPhotoUpload()
  const fileRef = useRef<HTMLInputElement>(null)

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
    <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2.5">
      {/* Done toggle */}
      {onToggleDone && !task.is_template && (
        <button
          type="button"
          onClick={() => onToggleDone(task)}
          title={done ? 'Mark as to-do' : 'Mark as done'}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition ${
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
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`} />
          <span
            className={`truncate text-sm font-medium ${
              done ? 'text-slate-500 line-through' : 'text-slate-100'
            }`}
          >
            {task.title}
          </span>
          {task.is_template && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-300">
              <Repeat className="h-3 w-3" />
              {describeRecurrence(task)}
            </span>
          )}
          {!task.is_template && task.template_id && (
            <span
              className="inline-flex items-center rounded-full bg-indigo-500/15 px-1 py-0.5 text-indigo-300"
              title="Recurring task (from a template)"
            >
              <Repeat className="h-3 w-3" />
            </span>
          )}
        </div>

        {task.title_th && (
          <p className="truncate text-xs text-slate-400">{task.title_th}</p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
          {task.station !== 'general' && (
            <span className={`rounded-full px-1.5 py-0.5 font-semibold ${STATION_STYLE[task.station]}`}>
              {STATION_LABEL[task.station]}
            </span>
          )}
          <span className={`rounded-full px-1.5 py-0.5 ${CATEGORY_STYLE[task.category]}`}>
            {CATEGORY_LABEL[task.category]}
          </span>
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
          {!task.is_template && (
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

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        {onPhotosChange && !task.is_template && (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={isUploading}
              title="Add photo"
              className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-emerald-400 disabled:cursor-wait"
            >
              {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
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
          </>
        )}
        {onPush && !task.is_template && task.assigned_to && (
          <button
            type="button"
            onClick={() => onPush(task)}
            title="Send to Telegram"
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-sky-400"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(task)}
            title="Edit"
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(task)}
            title="Delete"
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-rose-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
