import { Shield, ExternalLink, Hash } from 'lucide-react'
import type { MenuItem } from '../../../../hooks/useMenuData'
import type { DishScorecard } from '../../../../hooks/useDishScorecard'
import { DrawerScorecard } from '../../owner/DrawerScorecard'

interface OwnerTabProps {
  item: MenuItem
  scorecard: DishScorecard | null
  scorecardLoading: boolean
  scorecardError: string | null
}

function posStatusBadge(status: string) {
  switch (status) {
    case 'approved':
      return 'bg-[var(--color-royal-green)]/20 text-[color:var(--color-forest-soft)]'
    case 'synced':
      return 'bg-sky-900/40 text-sky-300'
    default:
      return 'bg-surface-3 text-cream/60'
  }
}

export function OwnerTab({
  item,
  scorecard,
  scorecardLoading,
  scorecardError,
}: OwnerTabProps) {
  return (
    <div className="space-y-6">
      {/* Version + Verified */}
      <section className="space-y-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          <Shield className="mr-1 inline h-3 w-3" />
          Card Version
        </h4>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-cream/70">
            <Hash className="h-2.5 w-2.5" />
            v{item.card_version}
          </span>
          {item.last_verified_at && (
            <span className="text-[10px] text-cream/40">
              verified{' '}
              {new Date(item.last_verified_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </section>

      {/* POS Status */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          POS Status
        </h4>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${posStatusBadge(item.pos_status)}`}
        >
          {item.pos_status}
        </span>
      </section>

      {/* Cost rollup */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          Cost Rollup
        </h4>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border border-surface-3 bg-surface-2/30 p-2 text-center">
            <div className="font-mono text-sm font-medium text-cream/90">
              {item.cost_per_unit != null
                ? `\u0E3F${item.cost_per_unit.toFixed(0)}`
                : '-'}
            </div>
            <div className="text-[10px] text-cream/40">Cost</div>
          </div>
          <div className="rounded-lg border border-surface-3 bg-surface-2/30 p-2 text-center">
            <div className="font-mono text-sm font-medium text-cream/90">
              {item.price != null ? `\u0E3F${item.price.toFixed(0)}` : '-'}
            </div>
            <div className="text-[10px] text-cream/40">Price</div>
          </div>
          <div className="rounded-lg border border-surface-3 bg-surface-2/30 p-2 text-center">
            <div className="font-mono text-sm font-medium text-cream/90">
              {item.cost_per_unit != null &&
              item.price != null &&
              item.price > 0
                ? `${((item.cost_per_unit / item.price) * 100).toFixed(1)}%`
                : '-'}
            </div>
            <div className="text-[10px] text-cream/40">Food Cost</div>
          </div>
        </div>
      </section>

      {/* Scorecard */}
      <DrawerScorecard
        scorecard={scorecard}
        isLoading={scorecardLoading}
        error={scorecardError}
      />

      {/* TTC Source URL */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          TTC Source
        </h4>
        {item.ttc_source_url ? (
          <a
            href={item.ttc_source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-forest-soft hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Source link
          </a>
        ) : (
          <span className="text-xs text-cream/40">Not set</span>
        )}
      </section>
    </div>
  )
}
