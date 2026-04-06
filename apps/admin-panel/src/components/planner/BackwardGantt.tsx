import { useMemo, useState, useEffect } from 'react'
import type { ScheduledStep } from '../../lib/backwardSchedule'
import { Clock, Wrench, AlertTriangle } from 'lucide-react'

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])
  return isMobile
}

// Color palette for dishes
const DISH_COLORS = [
  'bg-emerald-500/50',
  'bg-sky-500/50',
  'bg-amber-500/50',
  'bg-violet-500/50',
  'bg-pink-500/50',
  'bg-teal-500/50',
  'bg-orange-500/50',
  'bg-indigo-500/50',
]

export interface EquipmentLocation {
  zone: string | null
  wall: string | null
}

interface BackwardGanttProps {
  steps: ScheduledStep[]
  equipmentLocations?: Map<string, EquipmentLocation>
}

export function BackwardGantt({ steps, equipmentLocations }: BackwardGanttProps) {
  const isMobile = useIsMobile()
  const [tooltip, setTooltip] = useState<{ step: ScheduledStep; x: number; y: number } | null>(null)

  // Determine time range (include setup_start)
  const { minTime, maxTime, totalMs } = useMemo(() => {
    if (steps.length === 0) return { minTime: 0, maxTime: 1, totalMs: 1 }
    const starts = steps.map((s) => (s.setup_start ?? s.scheduled_start).getTime())
    const ends = steps.map((s) => s.scheduled_end.getTime())
    const min = Math.min(...starts)
    const max = Math.max(...ends)
    return { minTime: min, maxTime: max, totalMs: max - min || 1 }
  }, [steps])

  // Group by equipment
  const equipmentRows = useMemo(() => {
    const map = new Map<string, { name: string; steps: ScheduledStep[] }>()
    const noEqSteps: ScheduledStep[] = []

    for (const s of steps) {
      if (!s.equipment_id) {
        noEqSteps.push(s)
        continue
      }
      const existing = map.get(s.equipment_id)
      if (existing) {
        existing.steps.push(s)
      } else {
        map.set(s.equipment_id, {
          name: s.step.equipment_name ?? 'Equipment',
          steps: [s],
        })
      }
    }

    if (noEqSteps.length > 0) {
      map.set('__manual__', { name: 'Manual Work', steps: noEqSteps })
    }

    return Array.from(map.entries())
  }, [steps])

  // Assign colors by dish
  const dishColorMap = useMemo(() => {
    const map = new Map<string, string>()
    const uniqueDishes = [...new Set(steps.map((s) => s.nomenclature_id))]
    uniqueDishes.forEach((id, i) => {
      map.set(id, DISH_COLORS[i % DISH_COLORS.length])
    })
    return map
  }, [steps])

  // Hour markers
  const hourMarkers = useMemo(() => {
    const markers: { label: string; left: number }[] = []
    const startDate = new Date(minTime)
    const hour = new Date(startDate)
    hour.setMinutes(0, 0, 0)
    if (hour.getTime() < minTime) hour.setHours(hour.getHours() + 1)

    while (hour.getTime() <= maxTime) {
      const left = ((hour.getTime() - minTime) / totalMs) * 100
      markers.push({
        label: hour.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        left,
      })
      hour.setHours(hour.getHours() + 1)
    }
    return markers
  }, [minTime, maxTime, totalMs])

  if (steps.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        Click 'Calculate' to build the Gantt chart
      </p>
    )
  }

  const fmt = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  // Mobile: vertical list grouped by equipment
  if (isMobile) {
    return (
      <div className="space-y-2">
        {equipmentRows.map(([eqId, row]) => (
          <div key={eqId} className="rounded-xl border border-slate-800 bg-slate-900/50">
            <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
              <Wrench className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-200">{row.name}</span>
              {eqId !== '__manual__' && equipmentLocations?.get(eqId) && (
                <span className={`text-[10px] ${
                  equipmentLocations.get(eqId)!.zone === 'Hot' ? 'text-red-400' :
                  equipmentLocations.get(eqId)!.zone === 'Cold' ? 'text-sky-400' :
                  'text-slate-500'
                }`}>
                  {equipmentLocations.get(eqId)!.wall ?? equipmentLocations.get(eqId)!.zone}
                </span>
              )}
            </div>
            <div className="divide-y divide-slate-800/50">
              {row.steps.map((s, i) => {
                const color = dishColorMap.get(s.nomenclature_id) ?? DISH_COLORS[0]
                return (
                  <div key={i} className={`flex items-center gap-3 px-3 py-2.5 ${s.has_conflict ? 'bg-rose-500/5' : ''}`}>
                    <div className={`h-3 w-3 rounded ${color} shrink-0`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-200 truncate">{s.step.operation_name}</p>
                      <p className="text-[11px] text-slate-500">{s.dish_name} · {s.step.duration_min} min</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
                      <Clock className="h-3 w-3" />
                      <span>{fmt(s.scheduled_start)}–{fmt(s.scheduled_end)}</span>
                    </div>
                    {s.has_conflict && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400" />}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Legend */}
        <div className="flex flex-wrap gap-2 text-[10px] text-slate-400">
          {[...new Set(steps.map((s) => s.nomenclature_id))].map((id) => {
            const step = steps.find((s) => s.nomenclature_id === id)!
            const color = dishColorMap.get(id) ?? DISH_COLORS[0]
            return (
              <span key={id} className="flex items-center gap-1">
                <span className={`inline-block h-2.5 w-2.5 rounded ${color}`} />
                {step.dish_name}
              </span>
            )
          })}
        </div>
      </div>
    )
  }

  // Desktop/tablet: Gantt chart
  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <div className="min-w-[700px]">
        {/* Hour labels */}
        <div className="relative mb-1 h-5">
          {hourMarkers.map((m, i) => (
            <span
              key={i}
              className="absolute text-[10px] text-slate-500 -translate-x-1/2"
              style={{ left: `${m.left}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>

        {/* Equipment rows */}
        {equipmentRows.map(([eqId, row]) => (
          <div key={eqId} className="mb-2 flex items-center gap-2">
            <div className="w-28 shrink-0 text-xs text-slate-400">
              <span className="block truncate">{row.name}</span>
              {eqId !== '__manual__' && equipmentLocations?.get(eqId) && (
                <span className={`text-[9px] ${
                  equipmentLocations.get(eqId)!.zone === 'Hot' ? 'text-red-400' :
                  equipmentLocations.get(eqId)!.zone === 'Cold' ? 'text-sky-400' :
                  'text-slate-500'
                }`}>
                  {equipmentLocations.get(eqId)!.wall ?? equipmentLocations.get(eqId)!.zone}
                </span>
              )}
            </div>
            <div className="relative h-8 flex-1 rounded bg-slate-800/50">
              {/* Hour gridlines */}
              {hourMarkers.map((m, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full w-px bg-slate-700/40"
                  style={{ left: `${m.left}%` }}
                />
              ))}

              {/* Step blocks */}
              {row.steps.map((s, i) => {
                const left = ((s.scheduled_start.getTime() - minTime) / totalMs) * 100
                const width = ((s.scheduled_end.getTime() - s.scheduled_start.getTime()) / totalMs) * 100
                const baseColor = dishColorMap.get(s.nomenclature_id) ?? DISH_COLORS[0]

                // Setup block (preheat) — rendered before the main block
                const hasSetup = s.setup_start != null
                const setupLeft = hasSetup
                  ? ((s.setup_start!.getTime() - minTime) / totalMs) * 100
                  : 0
                const setupWidth = hasSetup
                  ? ((s.scheduled_start.getTime() - s.setup_start!.getTime()) / totalMs) * 100
                  : 0

                return (
                  <div key={i}>
                    {/* Setup block */}
                    {hasSetup && setupWidth > 0 && (
                      <div
                        className="absolute top-0.5 bottom-0.5 rounded-l bg-slate-600"
                        style={{
                          left: `${setupLeft}%`,
                          width: `${Math.max(setupWidth, 0.5)}%`,
                          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.07) 3px, rgba(255,255,255,0.07) 6px)',
                        }}
                      />
                    )}

                    {/* Main step block */}
                    <div
                      className={`absolute top-0.5 bottom-0.5 rounded cursor-pointer ${
                        s.is_passive ? '' : baseColor
                      } ${s.has_conflict ? 'ring-2 ring-rose-500' : ''}`}
                      style={{
                        left: `${left}%`,
                        width: `${Math.max(width, 1)}%`,
                        ...(s.is_passive
                          ? {
                              backgroundColor: 'rgba(56, 189, 248, 0.2)',
                              backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(56, 189, 248, 0.15) 4px, rgba(56, 189, 248, 0.15) 8px)',
                            }
                          : {}),
                      }}
                      onMouseEnter={(e) => {
                        const rect = (e.target as HTMLElement).getBoundingClientRect()
                        setTooltip({ step: s, x: rect.left, y: rect.bottom })
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <span className="block truncate px-1 text-[9px] font-medium text-white leading-7">
                        {s.step.operation_name}
                        {s.batch_count > 1 && (
                          <span className="ml-1 rounded bg-white/20 px-1 text-[8px]">
                            x{s.batch_count}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-slate-400">
          {/* Dish colors */}
          {[...new Set(steps.map((s) => s.nomenclature_id))].map((id) => {
            const step = steps.find((s) => s.nomenclature_id === id)!
            const color = dishColorMap.get(id) ?? DISH_COLORS[0]
            return (
              <span key={id} className="flex items-center gap-1">
                <span className={`inline-block h-2.5 w-2.5 rounded ${color}`} />
                {step.dish_name}
              </span>
            )
          })}

          {/* Step type legend */}
          <span className="border-l border-slate-700 pl-3 flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded bg-amber-500/50" />
            Active step
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded"
              style={{
                backgroundColor: 'rgba(56, 189, 248, 0.2)',
                backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(56, 189, 248, 0.3) 2px, rgba(56, 189, 248, 0.3) 4px)',
              }}
            />
            Passive step
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded bg-slate-600"
              style={{
                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)',
              }}
            />
            Setup/Preheat
          </span>
          {steps.some((s) => s.has_conflict) && (
            <span className="flex items-center gap-1 text-rose-400">
              <span className="inline-block h-2.5 w-2.5 rounded ring-2 ring-rose-500 bg-slate-600" />
              Conflict
            </span>
          )}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 rounded-lg border border-slate-700 bg-slate-800 p-2.5 shadow-xl text-xs"
          style={{ left: Math.min(tooltip.x, window.innerWidth - 240), top: tooltip.y + 4 }}
        >
          <p className="font-medium text-slate-100">{tooltip.step.dish_name}</p>
          <p className="text-slate-300">{tooltip.step.step.operation_name}</p>
          <p className="text-slate-400">
            {tooltip.step.scheduled_start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            {' — '}
            {tooltip.step.scheduled_end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            {' · '}
            {tooltip.step.step.duration_min} min
          </p>
          {tooltip.step.step.equipment_name && (
            <p className="text-slate-500">
              Eq: {tooltip.step.step.equipment_name}
              {tooltip.step.equipment_id && equipmentLocations?.get(tooltip.step.equipment_id) && (
                <span className="ml-1">
                  ({equipmentLocations.get(tooltip.step.equipment_id)!.wall ?? equipmentLocations.get(tooltip.step.equipment_id)!.zone})
                </span>
              )}
            </p>
          )}
          {tooltip.step.step.temperature_c != null && (
            <p className="text-red-400">Temp: {tooltip.step.step.temperature_c}°C</p>
          )}
          {tooltip.step.is_passive && (
            <p className="text-sky-400">Passive (cook free)</p>
          )}
          {tooltip.step.batch_count > 1 && (
            <p className="text-amber-300">Batches: x{tooltip.step.batch_count}</p>
          )}
          {tooltip.step.has_conflict && (
            <p className="mt-1 text-rose-300">Equipment conflict!</p>
          )}
        </div>
      )}
    </div>
  )
}
