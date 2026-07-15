import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check, Clock, AlertTriangle, Repeat, Camera, Loader2, Link2, MessageSquare,
} from 'lucide-react'
import type { StaffTask } from '../../hooks/useStaffTasks'
import { useTaskPhotoUpload } from '../../hooks/useTaskPhotoUpload'
import { useSignedTaskPhotoUrls } from '../../lib/taskPhotoUrls'
import {
  categoryMeta,
  PRIORITY_DOT,
  STATION_LABEL,
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

/** Compact "22 Jun" / "22 Jun 08:00" / "08:00" label for the card's when-chip. */
function whenLabel(task: StaffTask, showDate?: boolean): string {
  if (task.is_template) return ''
  const time = shortTime(task.due_time)
  if (showDate && task.due_date) {
    const d = new Date(`${task.due_date}T00:00:00`)
    const md = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    return time ? `${md} ${time}` : md
  }
  return time
}

/**
 * One task card — a compact checklist row tuned for a cook's phone.
 *
 * The whole card is ~64px: line 1 is the priority dot + a single English title
 * (wraps to two lines max); line 2 is one muted meta line (when · work-type ·
 * station · who). A coloured left stripe + icon name the work type at a glance.
 * English-only and short by design — full details, the Thai title, editing,
 * deleting and Telegram pushes live in the detail view opened by tapping the
 * card. The only in-place action is the camera (photo proof).
 */
export function TaskRow({ task, onToggleDone, onOpen, onPhotosChange, showDate }: TaskRowProps) {
  const done = task.status === 'done'
  const overdue = isOverdue(task)
  const assignee = task.staff?.name ?? null
  const navigate = useNavigate()
  const { upload, isUploading } = useTaskPhotoUpload()
  const { resolve: resolvePhoto } = useSignedTaskPhotoUrls(task.photo_urls)
  const fileRef = useRef<HTMLInputElement>(null)
  const catMeta = categoryMeta(task.category)
  const CatIcon = catMeta.icon
  const when = whenLabel(task, showDate)
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
      if (res.ok && res.path) added.push(res.path)
      else if (res.error) window.alert(res.error)
    }
    if (added.length) onPhotosChange(task, [...task.photo_urls, ...added])
  }

  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg border border-l-4 border-slate-800 bg-slate-900/60 px-3 py-2 ${catMeta.accent}`}
    >
      {/* Done toggle — tap target */}
      {onToggleDone && !task.is_template && (
        <button
          type="button"
          onClick={() => onToggleDone(task)}
          title={done ? 'Mark as to-do' : 'Mark as done'}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition ${
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
          {/* Line 1 — priority dot · title (wraps to 2 lines max) */}
          <div className="flex items-start gap-2">
            <span
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`}
              title={`Priority: ${task.priority}`}
            />
            <span
              className={`line-clamp-2 text-[15px] font-medium leading-tight ${
                done ? 'text-slate-500 line-through' : 'text-slate-100'
              }`}
            >
              {task.title}
            </span>
          </div>

          {/* Line 2 — one muted meta line: when · work-type · station · who */}
          <div className="mt-1 flex items-center gap-1.5 overflow-hidden pl-4 text-[11px] text-slate-400">
            {task.is_template ? (
              <span className="inline-flex shrink-0 items-center gap-1 font-medium text-indigo-300">
                <Repeat className="h-3 w-3" />
                {describeRecurrence(task)}
                <span className="text-slate-600">·</span>
              </span>
            ) : (
              when && (
                <span
                  className={`inline-flex shrink-0 items-center gap-1 font-medium tabular-nums ${
                    overdue ? 'text-rose-300' : 'text-slate-300'
                  }`}
                >
                  {overdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                  {when}
                  <span className="text-slate-600">·</span>
                </span>
              )
            )}
            <CatIcon className="h-3 w-3 shrink-0" />
            <span className="shrink-0">{catMeta.label}</span>
            {task.station !== 'general' && (
              <>
                <span className="text-slate-600">·</span>
                <span
                  className={`shrink-0 font-semibold ${
                    task.station === 'L1' ? 'text-orange-300' : 'text-cyan-300'
                  }`}
                  title={STATION_LABEL[task.station]}
                >
                  {task.station}
                </span>
              </>
            )}
            {assignee && (
              <>
                <span className="text-slate-600">·</span>
                <span className="truncate text-slate-300">{assignee}</span>
              </>
            )}
            {showStatusBadge && (
              <span className={`ml-1 shrink-0 rounded-full px-1.5 py-0.5 ${STATUS_STYLE[task.status]}`}>
                {STATUS_LABEL[task.status]}
              </span>
            )}
            {task.comment && (
              <MessageSquare className="ml-0.5 h-3 w-3 shrink-0 text-slate-500" aria-label="Has note" />
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
            {task.photo_urls.map((ref) => {
              // null while the signature is in flight or if signing failed — the
              // bucket is private, so the stored ref is not a usable fallback.
              const src = resolvePhoto(ref)
              return (
                <a key={ref} href={src ?? undefined} target="_blank" rel="noreferrer" className="block h-11 w-11 overflow-hidden rounded-md border border-slate-700">
                  {src
                    ? <img src={src} alt="report" className="h-full w-full object-cover" />
                    : <span className="block h-full w-full animate-pulse bg-slate-800" />}
                </a>
              )
            })}
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
