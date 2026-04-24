import { useMemo, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useOpeningRoadmap } from '../hooks/useOpeningRoadmap'
import { OPENING_PHASES } from '../components/roadmap/roadmap-config'
import { RoadmapHeader } from '../components/roadmap/RoadmapHeader'
import { PhaseCard } from '../components/roadmap/PhaseCard'
import { RoadmapTaskRow } from '../components/roadmap/RoadmapTaskRow'

export function OpeningRoadmap() {
  const {
    phases,
    unassignedTasks,
    overallProgress,
    totalBlockers,
    isLoading,
    error,
    refetch,
  } = useOpeningRoadmap()

  // Auto-expand: first non-done phase is the "current" one
  const currentPhaseId = useMemo(() => {
    for (const p of phases) {
      if (p.status !== 'done') return p.config.id
    }
    return phases[phases.length - 1]?.config.id ?? 0
  }, [phases])

  // Track which phases are expanded — current phase starts expanded
  const [expandedSet, setExpandedSet] = useState<Set<number>>(() => new Set())

  // Derived: a phase is expanded if it's in the set OR if it's the current
  // phase and the user hasn't explicitly toggled it
  const [userToggled, setUserToggled] = useState<Set<number>>(() => new Set())

  function isExpanded(phaseId: number): boolean {
    if (userToggled.has(phaseId)) return expandedSet.has(phaseId)
    // Default: expand current, collapse done, expand others
    if (phaseId === currentPhaseId) return true
    const phase = phases.find((p) => p.config.id === phaseId)
    return phase?.status !== 'done'
  }

  function togglePhase(phaseId: number) {
    setUserToggled((prev) => new Set(prev).add(phaseId))
    setExpandedSet((prev) => {
      const next = new Set(prev)
      if (isExpanded(phaseId)) {
        next.delete(phaseId)
      } else {
        next.add(phaseId)
      }
      return next
    })
  }

  // Lock Day from Phase 0 config
  const lockDay = OPENING_PHASES.find((p) => p.lockDay)?.lockDay

  /* ─── Loading state ─── */
  if (isLoading && phases.every((p) => p.tasks.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 ring-1 ring-zinc-800">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
          </div>
        </div>
        <p className="mt-4 text-xs text-zinc-500">Loading roadmap...</p>
      </div>
    )
  }

  /* ─── Error state ─── */
  if (error && phases.every((p) => p.tasks.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-950/40 ring-1 ring-red-800/40">
          <AlertTriangle className="h-6 w-6 text-red-400" />
        </div>
        <p className="mt-4 text-sm font-medium text-red-300">Failed to load roadmap</p>
        <p className="mt-1 text-xs text-zinc-500">{error}</p>
        <button
          onClick={refetch}
          className="mt-4 rounded-lg bg-zinc-800 px-4 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
        >
          Try again
        </button>
      </div>
    )
  }

  /* ─── Task summary line ─── */
  const totalTasks = phases.reduce((sum, p) => sum + p.tasks.length, 0)
  const doneTasks = phases.reduce(
    (sum, p) => sum + p.tasks.filter((t) => t.status === 'done').length,
    0,
  )

  return (
    <div className="relative mx-auto flex max-w-3xl flex-col gap-5">
      {/* Subtle ambient gradient behind the page */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-48 left-1/3 h-96 w-96 rounded-full bg-emerald-500/[0.02] blur-[100px]" />
      </div>

      {/* Header */}
      <RoadmapHeader
        overallProgress={overallProgress}
        totalBlockers={totalBlockers}
        lockDay={lockDay}
        onRefresh={refetch}
        isLoading={isLoading}
      />

      {/* Task counter */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-zinc-600">
          {doneTasks}/{totalTasks} tasks completed across {phases.length} phases
        </p>
        {unassignedTasks.length > 0 && (
          <p className="text-xs text-amber-600">
            {unassignedTasks.length} untagged
          </p>
        )}
      </div>

      {/* Phase timeline */}
      <div className="flex flex-col">
        {phases.map((phase, i) => (
          <PhaseCard
            key={phase.config.id}
            phase={phase}
            isExpanded={isExpanded(phase.config.id)}
            isCurrent={phase.config.id === currentPhaseId}
            onToggle={() => togglePhase(phase.config.id)}
            index={i}
            isLast={i === phases.length - 1}
          />
        ))}
      </div>

      {/* Unassigned tasks warning */}
      {unassignedTasks.length > 0 && (
        <div className="rounded-xl border border-amber-800/30 bg-amber-950/10 p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-semibold text-amber-300">
              {unassignedTasks.length} task{unassignedTasks.length !== 1 ? 's' : ''} without phase tag
            </span>
          </div>
          <p className="mb-3 text-xs text-zinc-500">
            Tag with phase-0 through phase-5 in Mission Control to assign.
          </p>
          <div className="flex flex-col gap-0.5">
            {unassignedTasks.map((task) => (
              <RoadmapTaskRow key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}

      {/* Bottom breathing room */}
      <div className="h-8" />
    </div>
  )
}
