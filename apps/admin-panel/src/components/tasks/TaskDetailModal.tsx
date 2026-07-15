import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X, Pencil, Check, Link2, Repeat, Clock, MessageSquare, Camera, Loader2,
  Trash2, Send, BookOpen,
} from 'lucide-react'
import type { StaffTask } from '../../hooks/useStaffTasks'
import { useTaskPhotoUpload } from '../../hooks/useTaskPhotoUpload'
import { useSignedTaskPhotoUrls } from '../../lib/taskPhotoUrls'
import {
  categoryMeta,
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
  /** Save a comment without leaving the read view. */
  onSaveComment?: (task: StaffTask, comment: string) => Promise<unknown> | void
  /** Attach photos without leaving the read view. */
  onPhotosChange?: (task: StaffTask, photoUrls: string[]) => void
  /** Delete the task (confirmed here, then the modal closes). */
  onDelete?: (task: StaffTask) => void
  /** Push the task to the assignee's Telegram (managers only). */
  onPush?: (task: StaffTask) => void
  /** Hide the Edit button when the viewer shouldn't change the task. */
  canEdit?: boolean
}

const SECTION_LABEL = 'mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500'
const COMMENT_INPUT =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none'

/**
 * Read-only task detail — opened when a card is tapped. Shows the instructions
 * (Notes), meta, link, photos and comment without any editable fields, so staff
 * can "open, read, close" without fumbling the form. An Edit button switches to
 * the full {@link TaskFormModal}.
 */
export function TaskDetailModal({
  task, onClose, onEdit, onToggleDone, onSaveComment, onPhotosChange, onDelete, onPush,
  canEdit = true,
}: TaskDetailModalProps) {
  const navigate = useNavigate()
  const done = task.status === 'done'
  const [comment, setComment] = useState(task.comment ?? '')
  const [savingComment, setSavingComment] = useState(false)
  const { upload, isUploading } = useTaskPhotoUpload()
  const { resolve: resolvePhoto } = useSignedTaskPhotoUrls(task.photo_urls)
  const fileRef = useRef<HTMLInputElement>(null)
  const commentDirty = comment.trim() !== (task.comment ?? '').trim()

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

  const saveComment = async () => {
    if (!onSaveComment) return
    setSavingComment(true)
    await onSaveComment(task, comment)
    setSavingComment(false)
  }

  const confirmDelete = () => {
    if (!onDelete) return
    if (window.confirm(`Delete "${task.title}"?`)) {
      onDelete(task)
      onClose()
    }
  }

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
          <span className={`rounded-full px-2 py-0.5 ${categoryMeta(task.category).style}`}>
            {categoryMeta(task.category).label}
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

        {/* Linked Handbook instructions page */}
        {task.kb_page?.slug && (
          <button
            type="button"
            onClick={() => navigate(`/handbook/${task.kb_page!.slug}`)}
            className="mb-4 ml-0 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 ring-1 ring-amber-500/20 transition hover:bg-amber-500/20 sm:ml-2"
          >
            <BookOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {task.kb_page.translations?.find((t) => t.lang === 'en')?.title ?? 'Instructions'}
            </span>
          </button>
        )}

        {/* Photos — view + attach without leaving read mode */}
        {(onPhotosChange || task.photo_urls.length > 0) && (
          <div className="mb-4">
            <h4 className={SECTION_LABEL}>Photos</h4>
            <div className="flex flex-wrap gap-2">
              {task.photo_urls.map((ref) => {
                // null while in flight / on failure — private bucket, the stored
                // ref is not a usable fallback.
                const src = resolvePhoto(ref)
                return (
                  <a key={ref} href={src ?? undefined} target="_blank" rel="noreferrer" className="block h-20 w-20 overflow-hidden rounded-lg border border-slate-700">
                    {src
                      ? <img src={src} alt="report" className="h-full w-full object-cover" />
                      : <span className="block h-full w-full animate-pulse bg-slate-800" />}
                  </a>
                )
              })}
              {onPhotosChange && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={isUploading}
                  className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-700 text-slate-500 transition hover:border-emerald-500/40 hover:text-emerald-400 disabled:cursor-wait"
                >
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  <span className="text-[9px]">{isUploading ? '…' : 'Add'}</span>
                </button>
              )}
            </div>
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

        {/* Comment — editable inline (no need to enter Edit) */}
        {(onSaveComment || task.comment) && (
          <div className="mb-4">
            <h4 className={SECTION_LABEL}>
              <MessageSquare className="mr-1 inline h-3 w-3" />
              Comment
            </h4>
            {onSaveComment ? (
              <>
                <textarea
                  className={`${COMMENT_INPUT} resize-y`}
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Remark / feedback while doing this task…"
                />
                <div className="mt-1.5 flex justify-end">
                  <button
                    type="button"
                    onClick={saveComment}
                    disabled={!commentDirty || savingComment}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
                  >
                    {savingComment ? 'Saving…' : 'Save comment'}
                  </button>
                </div>
              </>
            ) : (
              <p className="whitespace-pre-wrap rounded-lg bg-slate-800/50 px-3 py-2 text-sm text-slate-300">{task.comment}</p>
            )}
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
          {onPush && !task.is_template && task.assigned_to && (
            <button
              type="button"
              onClick={() => onPush(task)}
              title="Send to Telegram"
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-sky-400"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={confirmDelete}
              title="Delete task"
              className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-400"
            >
              <Trash2 className="h-4 w-4" />
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
