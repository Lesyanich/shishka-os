import { Eye, EyeOff, Copy } from 'lucide-react'
import type { MenuItem } from '../../../hooks/useMenuData'

interface DrawerActionRowProps {
  item: MenuItem
  onToggleAvailable?: (id: string, next: boolean) => void | Promise<void>
  onDuplicate?: (id: string) => void | Promise<void>
}

/** Bottom sticky action row. Save is omitted — inline edit already
 * auto-saves via useOptimistic. Hide toggles is_available (advisory
 * UX: dish disappears from customer view). Duplicate is a future
 * hook; disabled when no handler is provided. */
export function DrawerActionRow({
  item,
  onToggleAvailable,
  onDuplicate,
}: DrawerActionRowProps) {
  return (
    <footer className="shrink-0 border-t border-slate-800/80 bg-[var(--color-surface-2)]/60 px-5 py-3">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => onDuplicate?.(item.id)}
          disabled={!onDuplicate}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[var(--color-surface-1)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-cream)]/75 transition hover:border-slate-500 hover:text-[color:var(--color-cream)] disabled:cursor-not-allowed disabled:opacity-40"
          title="Duplicate this dish (coming soon)"
        >
          <Copy className="h-3.5 w-3.5" />
          Duplicate
        </button>
        <button
          type="button"
          onClick={() => onToggleAvailable?.(item.id, !item.is_available)}
          disabled={!onToggleAvailable}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            item.is_available
              ? 'border border-slate-700 bg-[var(--color-surface-1)] text-[color:var(--color-cream)]/75 hover:border-[var(--color-brick-soft)]/50 hover:text-[color:var(--color-brick-soft)]'
              : 'border border-[var(--color-forest-soft)]/40 bg-[var(--color-royal-green)]/15 text-[color:var(--color-forest-soft)] hover:border-[var(--color-forest-soft)]/80'
          } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {item.is_available ? (
            <>
              <EyeOff className="h-3.5 w-3.5" />
              Hide
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5" />
              Publish
            </>
          )}
        </button>
      </div>
    </footer>
  )
}
