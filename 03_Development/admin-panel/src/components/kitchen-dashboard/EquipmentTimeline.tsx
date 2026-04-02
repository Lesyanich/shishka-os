import { useState } from 'react'
import { Monitor } from 'lucide-react'
import type { DashboardEquipmentSlot } from '../../hooks/useKitchenDashboard'

const HOUR_START = 6
const HOUR_END = 23
const TOTAL_HOURS = HOUR_END - HOUR_START // 17 hours

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

interface EquipmentTimelineProps {
  slots: DashboardEquipmentSlot[]
}

interface SlotPopup {
  slot: DashboardEquipmentSlot
  x: number
  y: number
}

export function EquipmentTimeline({ slots }: EquipmentTimelineProps) {
  const [popup, setPopup] = useState<SlotPopup | null>(null)

  // Group slots by equipment
  const byEquipment = new Map<string, { name: string; category: string | null; slots: DashboardEquipmentSlot[] }>()
  for (const slot of slots) {
    const key = slot.equipment_id
    const existing = byEquipment.get(key)
    if (existing) {
      existing.slots.push(slot)
    } else {
      byEquipment.set(key, {
        name: slot.equipment?.name ?? 'Equipment',
        category: slot.equipment?.category ?? null,
        slots: [slot],
      })
    }
  }

  const equipmentRows = Array.from(byEquipment.entries())

  // Detect conflicts (overlapping slots on same equipment)
  const conflictSlotIds = new Set<string>()
  for (const [, row] of equipmentRows) {
    const sorted = [...row.slots].sort(
      (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time),
    )
    for (let i = 1; i < sorted.length; i++) {
      if (timeToMinutes(sorted[i].start_time) < timeToMinutes(sorted[i - 1].end_time)) {
        conflictSlotIds.add(sorted[i].id)
        conflictSlotIds.add(sorted[i - 1].id)
      }
    }
  }

  const startMin = HOUR_START * 60
  const totalMin = TOTAL_HOURS * 60

  function slotStyle(slot: DashboardEquipmentSlot) {
    const sMin = Math.max(timeToMinutes(slot.start_time), startMin)
    const eMin = Math.min(timeToMinutes(slot.end_time), HOUR_END * 60)
    const left = ((sMin - startMin) / totalMin) * 100
    const width = ((eMin - sMin) / totalMin) * 100
    return { left: `${left}%`, width: `${Math.max(width, 1)}%` }
  }

  function slotColor(slot: DashboardEquipmentSlot) {
    if (conflictSlotIds.has(slot.id)) return 'bg-rose-500/70 border border-rose-400'
    if (slot.shift_task_id) return 'bg-emerald-500/60'
    return 'bg-slate-600/60'
  }

  // Hour markers
  const hourMarkers = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => HOUR_START + i)

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-100">
        <Monitor className="h-5 w-5 text-amber-400" />
        Equipment Load
        <span className="ml-auto text-sm text-slate-500">{equipmentRows.length}</span>
      </h2>

      {equipmentRows.length === 0 ? (
        <p className="text-base text-slate-500">No scheduled slots</p>
      ) : (
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="min-w-[600px]">
            {/* Hour labels */}
            <div className="relative mb-1 h-5">
              {hourMarkers.map((h) => {
                const left = ((h - HOUR_START) / TOTAL_HOURS) * 100
                return (
                  <span
                    key={h}
                    className="absolute text-xs text-slate-500 -translate-x-1/2"
                    style={{ left: `${left}%` }}
                  >
                    {h}:00
                  </span>
                )
              })}
            </div>

            {/* Equipment rows */}
            {equipmentRows.map(([eqId, row]) => (
              <div key={eqId} className="mb-2 flex items-center gap-2">
                <div className="w-24 shrink-0 truncate text-sm text-slate-400">
                  {row.name}
                </div>
                <div className="relative h-8 flex-1 rounded bg-slate-800/50">
                  {/* Hour gridlines */}
                  {hourMarkers.map((h) => {
                    const left = ((h - HOUR_START) / TOTAL_HOURS) * 100
                    return (
                      <div
                        key={h}
                        className="absolute top-0 h-full w-px bg-slate-700/40"
                        style={{ left: `${left}%` }}
                      />
                    )
                  })}

                  {/* Slots */}
                  {row.slots.map((slot) => (
                    <div
                      key={slot.id}
                      className={`absolute top-0.5 bottom-0.5 rounded cursor-pointer ${slotColor(slot)}`}
                      style={slotStyle(slot)}
                      onClick={(e) => {
                        const rect = (e.target as HTMLElement).getBoundingClientRect()
                        setPopup(popup?.slot.id === slot.id ? null : { slot, x: rect.left, y: rect.bottom })
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Now indicator */}
            {(() => {
              const now = new Date()
              const nowMin = now.getHours() * 60 + now.getMinutes()
              if (nowMin < startMin || nowMin > HOUR_END * 60) return null
              const left = ((nowMin - startMin) / totalMin) * 100
              return (
                <div
                  className="absolute top-0 h-full w-0.5 bg-emerald-400/60"
                  style={{ left: `${left}%` }}
                />
              )
            })()}
          </div>
        </div>
      )}

      {/* Popup */}
      {popup && (
        <div
          className="fixed z-50 rounded-xl border border-slate-700 bg-slate-800 p-3 shadow-xl"
          style={{ left: Math.min(popup.x, window.innerWidth - 240), top: popup.y + 4 }}
        >
          <button
            type="button"
            onClick={() => setPopup(null)}
            className="absolute top-1 right-2 text-slate-500 text-sm"
          >
            x
          </button>
          <p className="text-base font-medium text-slate-100">
            {popup.slot.label ?? 'Slot'}
          </p>
          <p className="text-sm text-slate-400">
            {popup.slot.start_time.slice(0, 5)} — {popup.slot.end_time.slice(0, 5)}
          </p>
          <p className="text-sm text-slate-500">
            {popup.slot.equipment?.name}
          </p>
        </div>
      )}
    </section>
  )
}
