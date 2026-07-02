import { AlertTriangle, Pause } from 'lucide-react'
import type { DishRecipeStep } from '../../../../hooks/useDishRecipeSteps'

/* ── equipment / time helpers (shared across recipe-step surfaces) ── */

const EQUIP_EMOJI: Record<string, string> = {
  cooking: '🔥',
  oven: '🔥',
  prep: '🔪',
  refrigeration: '❄️',
  fermentation: '🧫',
  storage: '📦',
  service: '🍽️',
  beverage: '☕',
  infrastructure: '🔧',
  other: '✋',
}

export function equipEmoji(category: string | null): string {
  return EQUIP_EMOJI[category ?? 'other'] ?? '✋'
}

export function formatTime(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

/* ── StepCard ──────────────────────────────────────────────────────
 * Canonical recipe-step card. Shared by the L1 Cook tab, the L2 Assembler
 * "Service steps" block, and the dish-anchored Full Process view. `compact`
 * trims chrome for the dense nested walk (component sub-steps). */

export function StepCard({
  step,
  compact = false,
}: {
  step: DishRecipeStep
  compact?: boolean
}) {
  const isCcp = step.is_ccp
  const isPassive = step.is_passive

  const borderCls = isCcp
    ? 'border-amber-500/50'
    : isPassive
      ? 'border-dashed border-surface-3'
      : 'border-surface-3'

  const bgCls = isCcp
    ? 'bg-amber-950/25'
    : isPassive
      ? 'bg-surface-2/40'
      : 'bg-surface-2/70'

  return (
    <div className={`rounded-xl border ${compact ? 'px-3 py-2' : 'px-4 py-3'} ${borderCls} ${bgCls}`}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-bold text-cream/70">
            {step.step_number}
          </span>
          <span className="text-sm font-semibold text-cream">{step.operation_name}</span>
          {isCcp && (
            <span className="flex items-center gap-0.5 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
              <AlertTriangle className="h-2.5 w-2.5" /> CCP
            </span>
          )}
          {isPassive && (
            <span className="flex items-center gap-0.5 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-400">
              <Pause className="h-2.5 w-2.5" /> passive
            </span>
          )}
        </div>
        {step.duration_min != null && (
          <span className="shrink-0 text-xs font-medium text-cream/55">
            ⏱️ {formatTime(step.duration_min)}
          </span>
        )}
      </div>

      {/* Instruction text */}
      {step.instruction_text && (
        <p className="mt-2 text-xs leading-relaxed text-cream/75">{step.instruction_text}</p>
      )}

      {/* Temperature blocks (large for CCP) */}
      {(step.temperature_c != null || step.internal_temp_c != null) && (
        <div className="mt-2.5 flex gap-2">
          {step.temperature_c != null && (
            <div className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 ${isCcp ? 'border-amber-500/30 bg-amber-950/30' : 'border-surface-3 bg-surface-2/50'}`}>
              <span className={isCcp ? 'text-base' : 'text-sm'}>🔥</span>
              <div>
                <div className={`font-bold text-cream ${isCcp ? 'text-base' : 'text-xs'}`}>{step.temperature_c}°C</div>
                <div className="text-[9px] text-cream/40">equip</div>
              </div>
            </div>
          )}
          {step.internal_temp_c != null && (
            <div className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 ${isCcp ? 'border-amber-500/30 bg-amber-950/30' : 'border-surface-3 bg-surface-2/50'}`}>
              <span className={isCcp ? 'text-base' : 'text-sm'}>🌡️</span>
              <div>
                <div className={`font-bold text-cream ${isCcp ? 'text-base' : 'text-xs'}`}>{step.internal_temp_c}°C</div>
                <div className="text-[9px] text-cream/40">probe</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CCP check text */}
      {isCcp && step.ccp_check_text && (
        <p className="mt-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-300">
          ⚠️ {step.ccp_check_text}
        </p>
      )}

      {/* Equipment line */}
      {step.equipment_name && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-cream/50">
          <span>{equipEmoji(step.equipment_category)}</span>
          <span>{step.equipment_name}</span>
        </div>
      )}

      {/* Notes */}
      {step.notes && (
        <p className="mt-1.5 text-[10px] italic text-cream/40">{step.notes}</p>
      )}
    </div>
  )
}
