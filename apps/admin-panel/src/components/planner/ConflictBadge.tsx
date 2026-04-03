import { AlertTriangle } from 'lucide-react'

interface ConflictBadgeProps {
  count: number
}

export function ConflictBadge({ count }: ConflictBadgeProps) {
  if (count === 0) return null

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-xs font-medium text-rose-300">
      <AlertTriangle className="h-3 w-3" />
      {count} {count === 1 ? 'conflict' : 'conflicts'}
    </span>
  )
}
