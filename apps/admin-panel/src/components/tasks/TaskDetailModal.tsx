import { useNavigate } from 'react-router-dom'
import {
  X, Pencil, Check, Link2, Repeat, Clock, MessageSquare,
} from 'lucide-react'
import type { StaffTask } from '../../hooks/useStaffTasks'
import {
  CATEGORY_LABEL,
  CATEGORY_STYLE,
  PRIORITY_DOT,
  STATION_LABEL,
  STATION_STYLE,
  STATUS_LABEL,
  STATUS_STYLE,
  describeRecurrence,
  shortTime,
} from './taskMeta'

interface TaskDetailModalProps {
  task: StaffTask
  onClose: () => void
  onEdit: (task: StaffTask) => void
  onToggleDone?: (task: StaffTask) => void
  /** Hide the Edit button when the viewer shouldn't change the task. */
  canEdit?: boolean
}

const SECTION_LABEL = 'mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500'

/**
 * Read-only task detail — opened when a card is tapped. Shows the instructions
 * (Notes), meta, link, photos and comment without any editable fields, so staff
 * can "open, read, close" without fumbling the form. An Edit button switches to
 * the full {@link TaskFormModal}.
 */
export function TaskDetailModal({ task, onClose, onEdit, onToggleDone, canEdit = true }: TaskDetailModalProps) {
  const navigate = useNavigate()
  const done = task.status === 'done'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`} />
              <h2 className={`text-base font-semibold ${done ? 'text-slate-500 line-through' : 'text-slate-100'}`}>
                {task.title}
              </h2>
            </div>
            {task.title_th && <p className="mt-0.5 text-sm text-slate-400">{task.title_th}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Meta chips */}
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px]">
          {task.station !== 'general' && (
            <span className={`rounded-full px-2 py-0.5 font-semibold ${STATION_STYLE[task.station]}`}>
              {STATION_LABEL[task.station]}
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 ${CATEGORY_STYLE[task.category]}`}>
            {CATEGORY_LABEL[task.category]}
          </span>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">
            {task.staff?.name ?? 'Unassigned'}
          </span>
          {!task.is_template && (
            <span className={`rounded-full px-2 py-0.5 ${STATUS_STYLE[task.status]}`}>
              {STATUS_LABEL[task.status]}
            </span>
          )}
          {(task.is_template || task.template_id) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-indigo-300">
              <Repeat className="h-3 w-3" />
              {task.is_template ? describeRecurrence(task) : 'Recurring'}
            </span>
          )}
          {!task.is_template && (task.due_date || task.due_time) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-slate-400">
              <Clock className="h-3 w-3" />
              {task.due_date ?? ''} {shortTime(task.due_time)}
            </span>
          )}
        </div>

        {/* Notes · Instructions — the main content */}
        <div className="mb-4">
          <h4 className={SECTION_LABEL}>Notes · Instructions</h4>
          {task.description ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{task.description}</p>
          ) : (
            <p className="text-sm italic text-slate-600">No instructions.</p>
          )}
        </div>

        {/* Linked tab */}
        {task.linked_route && (
          <button
            type="button"
            onClick={() => navigate(task.linked_route!)}
            className="mb-4 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/20 transition hover:bg-emerald-500/20"
          >
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{task.linked_label ?? 'Open tab'}</span>
          </button>
        )}

        {/* Photos */}
        {task.photo_urls.length > 0 && (
          <div className="mb-4">
            <h4 className={SECTION_LABEL}>Photos</h4>
            <div className="flex flex-wrap gap-2">
              {task.photo_urls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="block h-20 w-20 overflow-hidden rounded-lg border border-slate-700">
                  <img src={url} alt="report" className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Comment */}
        {task.comment && (
          <div className="mb-4">
            <h4 className={SECTION_LABEL}>
              <MessageSquare className="mr-1 inline h-3 w-3" />
              Comment
            </h4>
            <p className="whitespace-pre-wrap rounded-lg bg-slate-800/50 px-3 py-2 text-sm text-slate-300">{task.comment}</p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex items-center justify-end gap-2">
          {onToggleDone && !task.is_template && (
            <button
              type="button"
              onClick={() => onToggleDone(task)}
              className={`mr-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                done
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500'
              }`}
            >
              <Check className="h-4 w-4" />
              {done ? 'Mark as to-do' : 'Mark done'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            Close
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => onEdit(task)}
              className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-600"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
