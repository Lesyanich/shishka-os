import { useEffect, useState } from 'react'
import {
  Waypoints,
  ShieldCheck,
  AlertTriangle,
  MessageSquare,
  Clock,
  Loader2,
} from 'lucide-react'
import { fetchBrainPulse, type BrainPulse } from '../../../api/brainPulse'

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`}
    />
  )
}

export function BrainPulseBar() {
  const [pulse, setPulse] = useState<BrainPulse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchBrainPulse()
      .then(setPulse)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-[11px] text-slate-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading brain pulse...
      </div>
    )
  }

  if (!pulse) return null

  const regColor =
    pulse.regressionTotal === 0
      ? 'text-slate-500'
      : pulse.regressionPassed === pulse.regressionTotal
        ? 'text-emerald-400'
        : pulse.regressionPassed / pulse.regressionTotal >= 0.7
          ? 'text-amber-400'
          : 'text-red-400'

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-[11px]">
      {/* Server status */}
      <span className="flex items-center gap-1.5 text-slate-400">
        <Dot ok={pulse.l1Up} />
        MemPalace
      </span>

      {/* Knowledge size */}
      <span className="flex items-center gap-1.5 text-slate-400">
        <Waypoints className="h-3 w-3 text-slate-500" />
        <span className="text-slate-200">{pulse.l1Entities}</span> drawers ·{' '}
        <span className="text-slate-200">{pulse.l1Facts}</span> facts
      </span>

      {/* Regression tests */}
      <span className={`flex items-center gap-1.5 ${regColor}`}>
        <ShieldCheck className="h-3 w-3" />
        {pulse.regressionTotal === 0 ? (
          'no tests'
        ) : (
          <>
            {pulse.regressionPassed}/{pulse.regressionTotal} pass
          </>
        )}
      </span>

      {/* Gaps */}
      {pulse.gapCount > 0 && (
        <span className="flex items-center gap-1.5 text-amber-400">
          <AlertTriangle className="h-3 w-3" />
          {pulse.gapCount} gaps
        </span>
      )}

      {/* Avg quality */}
      {pulse.avgQuality30d != null && (
        <span className="flex items-center gap-1.5 text-slate-400">
          <MessageSquare className="h-3 w-3 text-slate-500" />
          avg{' '}
          <span
            className={
              pulse.avgQuality30d >= 4
                ? 'text-emerald-400'
                : pulse.avgQuality30d >= 3
                  ? 'text-amber-400'
                  : 'text-red-400'
            }
          >
            {pulse.avgQuality30d.toFixed(1)}
          </span>
          /5
        </span>
      )}

      {/* Last activity */}
      <span className="flex items-center gap-1.5 text-slate-400">
        <Clock className="h-3 w-3 text-slate-500" />
        {pulse.lastNightlyRun ? (
          <>
            nightly{' '}
            <span className="text-slate-300">{relativeTime(pulse.lastNightlyRun)}</span>
          </>
        ) : pulse.lastQueryTs ? (
          <>
            query <span className="text-slate-300">{relativeTime(pulse.lastQueryTs)}</span>
          </>
        ) : (
          <span className="text-slate-600">no activity</span>
        )}
      </span>
    </div>
  )
}
