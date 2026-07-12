import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useStations } from '../hooks/useStations'
import { StationChecklistPanel } from '../components/procurement/StationChecklistPanel'

/** S3 — the cook-facing per-station count screen, deep-linked from a
 * `stock_check` staff task (linked_route `/count/<code>`). Resolves the station
 * by code and renders the shared StationChecklistPanel: staff count, then a
 * manager reviews/applies/routes on /count/session/:id. Cook-reachable. */
export function StationCountPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { stations, isLoading, error } = useStations()

  const station = stations.find((s) => s.code === code) ?? null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-cream/45">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading station…
      </div>
    )
  }

  if (error || !station) {
    return (
      <div className="shk-panel p-6">
        <h1 className="text-lg font-semibold text-cream">Station not found</h1>
        <p className="mt-1 text-sm text-cream/50">
          {error ?? `No active station with code “${code ?? ''}”.`}
        </p>
        <button
          type="button"
          onClick={() => navigate('/kitchen/my-tasks')}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-honey-300 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to tasks
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 lg:p-6">
      <div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs text-cream/50 transition hover:text-cream/80"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <h1 className="mt-2 text-xl font-semibold text-cream">Count · {station.name}</h1>
        <p className="mt-0.5 text-sm text-cream/50">
          Enter actual quantities, then start the count to record them.
        </p>
      </div>
      <StationChecklistPanel station={station} />
    </div>
  )
}
