import { Monitor } from 'lucide-react'
import type { Equipment } from '../../hooks/useEquipment'
import type { ShiftTaskDraft } from './ShiftTaskEditor'

interface EquipmentAllocationProps {
  tasks: ShiftTaskDraft[]
  equipment: Equipment[]
  shiftStart: string
  shiftEnd: string
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function EquipmentAllocation({ tasks, equipment, shiftStart, shiftEnd }: EquipmentAllocationProps) {
  const assignedTasks = tasks.filter((t) => t.equipment_id)

  // Group by equipment
  const byEq = new Map<string, ShiftTaskDraft[]>()
  for (const t of assignedTasks) {
    const key = t.equipment_id!
    const group = byEq.get(key) ?? []
    group.push(t)
    byEq.set(key, group)
  }

  const startMin = timeToMin(shiftStart)
  const endMin = timeToMin(shiftEnd)
  const totalMin = Math.max(endMin - startMin, 60)

  if (assignedTasks.length === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3">
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-400">
        <Monitor className="h-3.5 w-3.5" />
        Equipment Allocation
      </h4>
      <div className="space-y-1.5">
        {Array.from(byEq.entries()).map(([eqId, eqTasks]) => {
          const eq = equipment.find((e) => e.id === eqId)
          return (
            <div key={eqId} className="flex items-center gap-2">
              <span className="w-20 shrink-0 truncate text-[11px] text-slate-500">
                {eq?.name ?? '?'}
              </span>
              <div className="relative h-5 flex-1 rounded bg-slate-800">
                {eqTasks.map((t, i) => {
                  const s = Math.max(timeToMin(t.start_time), startMin)
                  const e = Math.min(timeToMin(t.end_time), endMin)
                  const left = ((s - startMin) / totalMin) * 100
                  const width = Math.max(((e - s) / totalMin) * 100, 2)
                  return (
                    <div
                      key={i}
                      className="absolute top-0.5 bottom-0.5 rounded bg-emerald-500/50"
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${t.task_description || '?'} ${t.start_time}–${t.end_time}`}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
