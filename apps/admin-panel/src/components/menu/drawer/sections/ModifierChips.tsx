import type { ModifierOption } from '../../../../hooks/useModifierOptions'

interface ModifierChipsProps {
  modifiers: ModifierOption[]
  isLoading: boolean
}

function formatDelta(delta: number): string {
  if (delta === 0) return ''
  return delta > 0 ? ` +\u0E3F${delta}` : ` -\u0E3F${Math.abs(delta)}`
}

export function ModifierChips({ modifiers, isLoading }: ModifierChipsProps) {
  if (isLoading)
    return <span className="text-xs text-cream/40">Loading modifiers...</span>
  if (modifiers.length === 0)
    return <span className="text-xs text-cream/40">No modifiers</span>

  return (
    <div className="flex flex-wrap gap-1.5">
      {modifiers.map((m) => (
        <span
          key={m.id}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
            m.is_default
              ? 'bg-[var(--color-royal-green)]/20 text-[color:var(--color-forest-soft)] ring-1 ring-inset ring-[var(--color-forest-soft)]/30'
              : 'bg-surface-3 text-cream/70'
          }`}
        >
          +{m.modifier_name}
          {m.price_delta !== 0 && (
            <span className="font-mono text-[9px] tabular-nums opacity-75">
              {formatDelta(m.price_delta)}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}
