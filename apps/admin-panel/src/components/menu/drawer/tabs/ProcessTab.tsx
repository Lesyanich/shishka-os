import type { ReactNode } from 'react'
import {
  ShoppingCart,
  ChefHat,
  Factory,
  UtensilsCrossed,
  ChevronRight,
  Package,
  Clock,
} from 'lucide-react'
import type { MenuItem } from '../../../../hooks/useMenuData'
import type { DishRecipeStep } from '../../../../hooks/useDishRecipeSteps'
import type { AssemblyComponent, DishCardData, DishPackagingLine } from '../../../../hooks/useDishCard'
import { bucketStepsByStation } from '../../../../lib/recipeStation'
import { StepCard } from '../sections/StepCard'
import { WasteExpiryStrip } from '../sections/WasteExpiryStrip'

/* ── station tones (colour = station) ──────────────────────────── */

type Tone = 'buy' | 'l1' | 'l2' | 'serve'

const TONE: Record<Tone, { accent: string; border: string; dot: string }> = {
  buy: { accent: 'text-slate-300', border: 'border-l-slate-400/60', dot: 'bg-slate-400' },
  l1: { accent: 'text-emerald-300', border: 'border-l-emerald-400/60', dot: 'bg-emerald-400' },
  l2: { accent: 'text-amber-300', border: 'border-l-amber-400/60', dot: 'bg-amber-400' },
  serve: { accent: 'text-sky-300', border: 'border-l-sky-400/60', dot: 'bg-sky-400' },
}

function Stage({
  tone,
  icon,
  title,
  subtitle,
  count,
  children,
}: {
  tone: Tone
  icon: ReactNode
  title: string
  subtitle?: string
  count?: number
  children: ReactNode
}) {
  const t = TONE[tone]
  return (
    <section className={`rounded-r-xl border-l-2 ${t.border} bg-surface-2/30 pl-4 pr-3 py-3`}>
      <div className="flex items-center gap-2">
        <span className={t.accent}>{icon}</span>
        <h3 className={`text-sm font-semibold uppercase tracking-wide ${t.accent}`}>{title}</h3>
        {count != null && (
          <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[9px] font-bold text-cream/60">
            {count}
          </span>
        )}
        {subtitle && <span className="text-[10px] text-cream/40">{subtitle}</span>}
      </div>
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

/** A nested component's prep block: clickable title + its station steps. */
function ComponentBlock({
  name,
  componentId,
  steps,
  onNavigate,
  emptyLabel,
}: {
  name: string
  componentId: string
  steps: DishRecipeStep[]
  onNavigate?: (id: string) => void
  emptyLabel: string
}) {
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => onNavigate?.(componentId)}
        disabled={!onNavigate}
        className="flex items-center gap-1 text-[11px] font-medium text-cream/75 underline-offset-2 transition enabled:hover:text-forest-soft enabled:hover:underline disabled:cursor-default"
        title={onNavigate ? 'Open this component card' : undefined}
      >
        <ChevronRight className="h-3 w-3 text-cream/40" />
        {name}
      </button>
      {steps.length === 0 ? (
        <p className="pl-4 text-[11px] italic text-cream/40">{emptyLabel}</p>
      ) : (
        <div className="space-y-1.5 pl-4">
          {steps.map((s) => (
            <StepCard key={s.id} step={s} compact />
          ))}
        </div>
      )}
    </div>
  )
}

export interface ProcessTabProps {
  item: MenuItem
  dishCard: DishCardData | null
  /** Dish-direct components (raw + PF), from v_dish_assembly_components. */
  components: AssemblyComponent[]
  packaging: DishPackagingLine[]
  recipeSteps: DishRecipeStep[]
  recipeStepsLoading: boolean
  /** PF component steps keyed by component id. */
  stepsByComponent: Map<string, DishRecipeStep[]>
  componentStepsLoading: boolean
  onNavigateToItem?: (id: string) => void
}

/**
 * Dish-anchored "Full Process" — walks the BOM to show the complete
 * buy→prep→assemble→serve journey for a SALE dish, one column per station,
 * colour = station. NO data duplication: every step is stitched live from
 * recipes_flow (dish + component PFs), components from the assembly view, and
 * packaging/serve from the dish card.
 */
export function ProcessTab({
  item,
  dishCard,
  components,
  packaging,
  recipeSteps,
  recipeStepsLoading,
  stepsByComponent,
  componentStepsLoading,
  onNavigateToItem,
}: ProcessTabProps) {
  const rawComponents = components.filter((c) => c.component_type === 'raw_ingredient')
  const pfComponents = components.filter((c) => c.component_type === 'semi_finished')

  // Dish's own steps split by station. Untagged dishes → treat every step as
  // assembly (a SALE dish's own steps are its plating/assembly work).
  const dishBuckets = bucketStepsByStation(recipeSteps)
  const dishL1 = dishBuckets.tagged ? dishBuckets.l1 : []
  const dishL2 = dishBuckets.tagged ? dishBuckets.l2 : recipeSteps

  // Per-PF-component station buckets.
  const compBuckets = pfComponents.map((c) => ({
    c,
    ...bucketStepsByStation(stepsByComponent.get(c.component_id) ?? []),
  }))
  const hasCompL1 = compBuckets.some((b) => b.l1.length > 0)
  const hasCompL2 = compBuckets.some((b) => b.l2.length > 0)

  const serveChips = [
    dishCard?.container_l2 ? { icon: <Package className="h-3 w-3 text-cream/40" />, label: dishCard.container_l2 } : null,
    dishCard?.customer_eta_min != null
      ? { icon: <Clock className="h-3 w-3 text-cream/40" />, label: `~${dishCard.customer_eta_min} min ETA` }
      : null,
    dishCard?.has_cutlery ? { icon: '🍴', label: 'Cutlery' } : null,
    dishCard?.has_lid_sticker ? { icon: '🏷️', label: 'Lid sticker' } : null,
  ].filter(Boolean) as { icon: ReactNode; label: string }[]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-cream">Full Process</h2>
        <p className="mt-0.5 text-xs text-cream/55">{item.name}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-cream/45">
          <span className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${TONE.buy.dot}`} /> Buy</span>
          <span className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${TONE.l1.dot}`} /> L1 prep</span>
          <span className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${TONE.l2.dot}`} /> L2 assemble</span>
          <span className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${TONE.serve.dot}`} /> Serve</span>
        </div>
      </div>

      {/* 1 · BUY */}
      <Stage
        tone="buy"
        icon={<ShoppingCart className="h-4 w-4" />}
        title="Buy"
        subtitle="raw inputs · receive & cold-hold"
        count={rawComponents.length}
      >
        {rawComponents.length === 0 ? (
          <p className="text-[11px] italic text-cream/40">
            No raw inputs at dish level — all inputs come pre-prepped (see L1 below).
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {rawComponents.map((c) => (
              <div
                key={c.component_id}
                className="flex items-center justify-between rounded-lg border border-surface-3 bg-surface-2/50 px-2.5 py-1.5"
              >
                <span className="min-w-0 truncate text-[11px] text-cream/80">
                  {c.component_emoji ? `${c.component_emoji} ` : ''}
                  {c.component_short_name ?? c.component_name}
                </span>
                <span className="ml-1 shrink-0 text-[10px] text-cream/45">
                  {c.qty_per_portion} {c.base_unit ?? ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </Stage>

      {/* 2 · L1 PREP */}
      <Stage
        tone="l1"
        icon={<ChefHat className="h-4 w-4" />}
        title="L1 Prep"
        subtitle="kitchen + storage · make the components"
      >
        {componentStepsLoading ? (
          <p className="text-[11px] text-cream/40">Loading component recipes…</p>
        ) : pfComponents.length === 0 && dishL1.length === 0 ? (
          <p className="text-[11px] italic text-cream/40">No prep-kitchen steps for this dish.</p>
        ) : (
          <div className="space-y-3">
            {compBuckets
              .filter((b) => b.l1.length > 0 || !hasCompL1)
              .map((b) => (
                <ComponentBlock
                  key={b.c.component_id}
                  name={b.c.component_short_name ?? b.c.component_name}
                  componentId={b.c.component_id}
                  steps={b.l1}
                  onNavigate={onNavigateToItem}
                  emptyLabel="Prep recipe not documented — open its card to add steps."
                />
              ))}
            {dishL1.length > 0 && (
              <ComponentBlock
                name={`${item.name} — final kitchen prep`}
                componentId={item.id}
                steps={dishL1}
                emptyLabel=""
              />
            )}
          </div>
        )}
      </Stage>

      {/* 3 · L2 ASSEMBLE */}
      <Stage
        tone="l2"
        icon={<Factory className="h-4 w-4" />}
        title="L2 Assemble"
        subtitle="service bar · thaw, plate & finish"
      >
        {recipeStepsLoading || componentStepsLoading ? (
          <p className="text-[11px] text-cream/40">Loading assembly steps…</p>
        ) : dishL2.length === 0 && !hasCompL2 ? (
          <p className="text-[11px] italic text-cream/40">No assembly steps documented.</p>
        ) : (
          <div className="space-y-3">
            {/* Auto-pulled component handling (thaw/butterfly) */}
            {compBuckets
              .filter((b) => b.l2.length > 0)
              .map((b) => (
                <ComponentBlock
                  key={b.c.component_id}
                  name={`Handle · ${b.c.component_short_name ?? b.c.component_name}`}
                  componentId={b.c.component_id}
                  steps={b.l2}
                  onNavigate={onNavigateToItem}
                  emptyLabel=""
                />
              ))}
            {/* Dish's own assembly steps */}
            {dishL2.length > 0 && (
              <div className="space-y-1.5">
                {dishL2.map((s) => (
                  <StepCard key={s.id} step={s} compact />
                ))}
              </div>
            )}
            {/* Ordered assembly recap (read-only mirror of the L2 editor) */}
            {dishCard?.assembly_order && dishCard.assembly_order.length > 0 && (
              <div className="rounded-lg border border-surface-3 bg-surface-2/50 px-3 py-2 text-[11px] text-cream/65">
                <span className="text-cream/40">Assembly order: </span>
                {dishCard.assembly_order.map((s) => s.text).join(' → ')}
              </div>
            )}
          </div>
        )}
      </Stage>

      {/* 4 · SERVE */}
      <Stage
        tone="serve"
        icon={<UtensilsCrossed className="h-4 w-4" />}
        title="Serve"
        subtitle="package, label & hand off"
      >
        <div className="space-y-2.5">
          {packaging.length > 0 ? (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {packaging.map((p) => (
                <div
                  key={p.bom_id}
                  className="flex items-center justify-between rounded-lg border border-surface-3 bg-surface-2/50 px-2.5 py-1.5"
                >
                  <span className="min-w-0 truncate text-[11px] text-cream/80">
                    {p.packaging_emoji ? `${p.packaging_emoji} ` : ''}
                    {p.packaging_short_name ?? p.packaging_name}
                  </span>
                  <span className="ml-1 shrink-0 text-[10px] text-cream/45">
                    {p.qty_per_portion} {p.base_unit ?? ''}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] italic text-brick-soft">
              No packaging set — add it on the L2 Assembler tab.
            </p>
          )}
          {serveChips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {serveChips.map((chip, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-surface-3 bg-surface-2/60 px-3 py-1.5 text-xs text-cream/70"
                >
                  {chip.icon} {chip.label}
                </span>
              ))}
            </div>
          )}
          {dishCard?.cold_addons_after_reheat && (
            <p className="text-[11px] text-cream/60">
              <span className="text-cream/40">Cold add-ons: </span>
              {dishCard.cold_addons_after_reheat}
            </p>
          )}
        </div>
      </Stage>

      {/* Standard waste / expiry guidance */}
      <WasteExpiryStrip shelfLifeDays={item.shelf_life_days} />
    </div>
  )
}
