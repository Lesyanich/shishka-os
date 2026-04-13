import type { ScheduleConflict } from '../../types/scheduling'
import { ContaminationWarning } from './ContaminationWarning'
import { AlertTriangle, Check, Eye } from 'lucide-react'

interface ScheduleConflictPanelProps {
  conflicts: ScheduleConflict[]
  onAcceptAll: () => void
  onReviewManually: () => void
}

export function ScheduleConflictPanel({ conflicts, onAcceptAll, onReviewManually }: ScheduleConflictPanelProps) {
  if (conflicts.length === 0) return null

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-4">
      <div className="flex items-center gap-2 text-amber-400">
        <AlertTriangle className="h-5 w-5" />
        <h3 className="font-semibold">{conflicts.length} Scheduling Conflict{conflicts.length > 1 ? 's' : ''}</h3>
      </div>

      <div className="space-y-2">
        {conflicts.map((c, i) => (
          <div key={i} className="rounded border border-zinc-800 bg-zinc-900 p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white font-medium">{c.step}</span>
              <span className="text-zinc-400">
                {new Date(c.desired_start).toLocaleTimeString()} → {new Date(c.actual_start).toLocaleTimeString()}
              </span>
            </div>
            {c.buffer_reason.includes('category_change') && (
              <ContaminationWarning
                bufferReason={c.buffer_reason}
                bufferMin={parseInt(c.buffer_reason.match(/\d+/)?.[0] ?? '30')}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onAcceptAll}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          <Check className="h-4 w-4" /> Accept All Shifts
        </button>
        <button
          onClick={onReviewManually}
          className="flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
        >
          <Eye className="h-4 w-4" /> Review Manually
        </button>
      </div>
    </div>
  )
}
