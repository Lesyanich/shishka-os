interface ProgressBarProps {
  total: number
  completed: number
  inProgress: number
}

export function ProgressBar({ total, completed, inProgress }: ProgressBarProps) {
  const pending = total - completed - inProgress
  const pctDone = total > 0 ? (completed / total) * 100 : 0
  const pctActive = total > 0 ? (inProgress / total) * 100 : 0
  const pctPending = total > 0 ? (pending / total) * 100 : 0

  return (
    <div className="space-y-1.5">
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-800">
        {pctDone > 0 && (
          <div className="bg-emerald-500 transition-all" style={{ width: `${pctDone}%` }} />
        )}
        {pctActive > 0 && (
          <div className="bg-sky-500 transition-all" style={{ width: `${pctActive}%` }} />
        )}
        {pctPending > 0 && (
          <div className="bg-slate-700 transition-all" style={{ width: `${pctPending}%` }} />
        )}
      </div>
      <p className="text-xs text-slate-400">
        <span className="font-semibold text-emerald-400">{completed}</span>/{total} done
        {inProgress > 0 && (
          <span> · <span className="text-sky-400">{inProgress}</span> active</span>
        )}
      </p>
    </div>
  )
}
