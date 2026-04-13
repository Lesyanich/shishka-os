import { useState } from 'react'
import { useProductionTargets } from '../hooks/useProductionTargets'
import { useScheduleRuns } from '../hooks/useScheduleRuns'
import { useEquipmentBookings } from '../hooks/useEquipmentBookings'
import { TargetForm } from '../components/scheduling/TargetForm'
import { TargetList } from '../components/scheduling/TargetList'
import { ScheduleConflictPanel } from '../components/scheduling/ScheduleConflictPanel'
import { EquipmentCapacityBar } from '../components/scheduling/EquipmentCapacityBar'
import type { ScheduleResult } from '../types/scheduling'

export function ProductionTargets() {
  const [date, setDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })
  const [lastResult, setLastResult] = useState<ScheduleResult | null>(null)

  const targets = useProductionTargets(date)
  const schedule = useScheduleRuns(date)
  const equipmentBookings = useEquipmentBookings(date)

  const dayStartMs = new Date(`${date}T00:00:00`).getTime()

  const handleGenerate = async () => {
    const result = await schedule.generateSchedule(date)
    setLastResult(result)
    if (result.ok && result.conflict_count === 0) {
      await schedule.assignStaff(result.run_id)
      await schedule.activateRun(result.run_id)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Production Targets</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
        />
      </div>

      <TargetForm date={date} onAdd={targets.addTarget} />
      <TargetList
        targets={targets.targets}
        isLoading={targets.isLoading}
        onUpdate={targets.updateTarget}
        onDelete={targets.deleteTarget}
        onConfirmAll={() => targets.confirmAll(date)}
      />

      <div className="flex gap-4">
        <button
          onClick={handleGenerate}
          disabled={targets.targets.filter(t => t.status === 'confirmed').length === 0}
          className="rounded-lg bg-emerald-600 px-6 py-3 text-lg font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          Generate Schedule
        </button>
      </div>

      {lastResult && lastResult.conflict_count > 0 && (
        <ScheduleConflictPanel
          conflicts={lastResult.conflicts}
          onAcceptAll={async () => {
            await schedule.assignStaff(lastResult.run_id)
            await schedule.activateRun(lastResult.run_id)
            setLastResult(null)
          }}
          onReviewManually={() => setLastResult(null)}
        />
      )}

      {schedule.runs.length > 0 && (
        <div className="rounded-lg border border-zinc-800 p-4">
          <h3 className="mb-2 text-sm font-medium text-zinc-400">Schedule History</h3>
          {schedule.runs.map(run => (
            <div key={run.id} className="flex items-center justify-between py-2 text-sm text-zinc-300">
              <span>{new Date(run.generated_at).toLocaleTimeString()}</span>
              <span>{run.task_count} tasks, {run.conflict_count} conflicts</span>
              <span className={run.status === 'active' ? 'text-emerald-400' : 'text-zinc-500'}>{run.status}</span>
            </div>
          ))}
        </div>
      )}

      {equipmentBookings.bookings.length > 0 && (
        <div className="rounded-lg border border-zinc-800 p-4 space-y-3">
          <h3 className="text-sm font-medium text-zinc-400">Equipment Timeline</h3>
          {Object.entries(equipmentBookings.byEquipment).map(([eqId, eqBookings]) => {
            const name = eqBookings[0]?.equipment?.name ?? eqId
            return (
              <EquipmentCapacityBar
                key={eqId}
                bookings={eqBookings}
                equipmentName={name}
                dayStartMs={dayStartMs}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
