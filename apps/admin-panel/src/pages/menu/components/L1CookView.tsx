import { Fragment, useMemo, useState, type ReactNode } from 'react'
import {
  Package,
  Clock,
  Snowflake,
  AlertTriangle,
  ChefHat,
  ChevronDown,
  ChevronRight,
  Utensils,
  Pause,
  MessageCircle,
} from 'lucide-react'
import type { MenuItem, MenuBomChild } from '../../../hooks/useMenuData'
import type { PfPackCardData } from '../../../hooks/usePfPackCard'
import type { RecipeStepStats, MenuRecipeStep } from '../../../hooks/useMenuListEnrichment'
import type { DishCardData } from '../../../hooks/useDishCard'
import { formatDishName } from '../utils/formatDishName'
import { useBomIngredients } from '../../../hooks/useBomIngredients'
import { useDishRecipeSteps } from '../../../hooks/useDishRecipeSteps'
import { matchesType, type TypeFilterValue } from '../../../components/menu/owner/TypeFilter'
import { bucketStepsByStation } from '../../../lib/recipeStation'

/** L1 prep steps for a dish. When the recipe is station-tagged (manakish), the
 *  prep cook only needs the L1 production flow — press dough → top → blast-freeze
 *  → store — not the L2 service bake. Untagged dishes show every step. */
function prepSteps(steps: MenuRecipeStep[]): MenuRecipeStep[] {
  const { l1, tagged } = bucketStepsByStation(steps)
  return tagged ? l1 : steps
}

interface L1CookViewProps {
  items: MenuItem[]
  /** Product-type filter. L1 is the kitchen prep station, so this defaults to
   *  PF (заготовки) upstream; the cook can still flip to SALE/All. */
  typeFilter: TypeFilterValue
  selectedCategory: string | null
  /** Leaf subcategory drill-down within the selected section (matches on the
   *  dish's own category_id). null = whole section. */
  selectedSubcategory: string | null
  /** Free-text name search — narrows cards by dish name (case-insensitive). */
  searchQuery?: string
  /** null = show all, true = available only, false = unavailable only */
  availableFilter: boolean | null
  pfPackCardById: Map<string, PfPackCardData>
  recipeStatsById: Map<string, RecipeStepStats>
  dishCardById: Map<string, DishCardData>
  childrenByParent: Map<string, MenuBomChild[]>
  /** Inline recipe steps per dish — SALE cards show their L1 prep flow. */
  recipeStepsByDish?: Map<string, MenuRecipeStep[]>
  onOpenDish?: (id: string) => void
  /** When true: hides cost/price/food-cost data; shows comment button. */
  staffMode?: boolean
  /** Per-dish comment count — shown as badge on the comment button. */
  feedbackCountById?: Map<string, number>
  /** Called when the comment button is clicked. */
  onComment?: (dishId: string) => void
}

/* ── Clickable child-PF row (jump to a related prep) ───────── */

/** A BOM/ingredient row that becomes a click-through link when the child is a
 *  semi-finished PF (e.g. a marinade/base) and a navigation handler is available —
 *  clicking opens that PF in the drawer so the cook doesn't have to hunt it down. */
function ClickableIngredientRow({
  clickable,
  onClick,
  title,
  children,
}: {
  clickable: boolean
  onClick?: () => void
  title?: string
  children: ReactNode
}) {
  if (clickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className="-mx-1 flex w-full items-center gap-2 rounded px-1 text-left text-[11px] transition hover:bg-surface-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber-watch)]/60"
      >
        {children}
      </button>
    )
  }
  return <div className="flex items-center gap-2 text-[11px]">{children}</div>
}

/* ── PF recipe detail (lazy-loaded on expand) ──────────────── */

/** Full L1 cooking recipe — ingredients with proportions + process steps.
 * Lazy-loaded: mounted only when the card is expanded, so the BOM + recipe
 * queries fire on demand (same data path as the drawer's L1CookTab). */
function PfRecipeDetail({
  itemId,
  onOpenRelated,
}: {
  itemId: string
  onOpenRelated?: (id: string) => void
}) {
  const { ingredients, isLoading: ingLoading } = useBomIngredients(itemId)
  const { steps, isLoading: stepLoading } = useDishRecipeSteps(itemId)

  return (
    <div className="space-y-3 px-4 pb-3">
      {/* Ingredients with proportions */}
      <div>
        <h4 className="mb-1.5 text-[9px] uppercase tracking-widest text-cream/45">
          🧂 Ingredients
        </h4>
        {ingLoading ? (
          <p className="text-[11px] text-cream/40">Loading…</p>
        ) : ingredients.length === 0 ? (
          <p className="text-[11px] italic text-cream/35">No ingredients defined</p>
        ) : (
          <ul className="space-y-1">
            {ingredients.map((ing) => {
              const isPf = ing.product_code.startsWith('PF-')
              const isMod = ing.product_code.startsWith('MOD-')
              const badgeColor = isPf
                ? 'bg-[var(--color-amber-watch)]/20 text-[color:var(--color-amber-watch)]'
                : isMod
                  ? 'bg-violet-900/40 text-violet-300'
                  : 'bg-slate-700 text-slate-300'
              const badgeLabel = isPf ? 'PF' : isMod ? 'MOD' : 'RAW'
              const clickable = isPf && !!onOpenRelated
              return (
                <li key={ing.ingredient_id}>
                  <ClickableIngredientRow
                    clickable={clickable}
                    onClick={() => onOpenRelated?.(ing.ingredient_id)}
                    title={clickable ? `Open ${ing.name}` : undefined}
                  >
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider ${badgeColor}`}
                    >
                      {badgeLabel}
                    </span>
                    <span
                      className={`min-w-0 truncate ${clickable ? 'text-[color:var(--color-amber-watch)]' : 'text-cream/70'}`}
                    >
                      {ing.name}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-cream/50">
                      {ing.quantity}
                      {ing.base_unit ? ` ${ing.base_unit}` : ''}
                    </span>
                  </ClickableIngredientRow>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Process steps */}
      <div>
        <h4 className="mb-1.5 flex items-center gap-1 text-[9px] uppercase tracking-widest text-cream/45">
          <ChefHat className="h-2.5 w-2.5" />
          Steps
        </h4>
        {stepLoading ? (
          <p className="text-[11px] text-cream/40">Loading…</p>
        ) : steps.length === 0 ? (
          <p className="text-[11px] italic text-cream/35">No recipe steps defined</p>
        ) : (
          <ol className="space-y-1.5">
            {steps.map((s) => (
              <li
                key={s.id}
                className={`rounded-lg border px-2.5 py-1.5 ${
                  s.is_ccp
                    ? 'border-amber-500/40 bg-amber-950/20'
                    : 'border-surface-3 bg-surface-2/50'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[9px] font-bold text-cream/70">
                    {s.step_number}
                  </span>
                  <span className="text-[11px] font-semibold text-cream/85">
                    {s.operation_name}
                  </span>
                  {s.is_ccp && (
                    <span className="flex items-center gap-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[8px] font-bold text-amber-400">
                      <AlertTriangle className="h-2 w-2" /> CCP
                    </span>
                  )}
                  {s.is_passive && (
                    <span className="flex items-center gap-0.5 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[8px] font-medium text-sky-400">
                      <Pause className="h-2 w-2" /> passive
                    </span>
                  )}
                  {s.duration_min != null && (
                    <span className="ml-auto shrink-0 text-[10px] text-cream/50">
                      ⏱️ {s.duration_min}m
                    </span>
                  )}
                </div>
                {s.instruction_text && (
                  <p className="mt-1 text-[11px] leading-relaxed text-cream/65">
                    {s.instruction_text}
                  </p>
                )}
                {(s.temperature_c != null || s.internal_temp_c != null) && (
                  <div className="mt-1 flex gap-3 text-[10px] text-cream/55">
                    {s.temperature_c != null && <span>🔥 {s.temperature_c}°C</span>}
                    {s.internal_temp_c != null && (
                      <span>🌡️ {s.internal_temp_c}°C</span>
                    )}
                  </div>
                )}
                {s.is_ccp && s.ccp_check_text && (
                  <p className="mt-1 rounded bg-amber-500/10 px-1.5 py-1 text-[10px] font-medium text-amber-300">
                    ⚠️ {s.ccp_check_text}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

/* ── PF card (L1 cook — expandable full recipe) ────────────── */

interface PfCardProps {
  item: MenuItem
  card: PfPackCardData | undefined
  stats: RecipeStepStats | undefined
  onOpen?: () => void
  /** Opens a related child PF (e.g. its marinade/base) in the drawer. */
  onOpenRelated?: (id: string) => void
  staffMode?: boolean
  feedbackCount?: number
  onComment?: () => void
}

function PfCard({ item, card, stats, onOpen, onOpenRelated, staffMode, feedbackCount, onComment }: PfCardProps) {
  // Default expanded: the cook station shows recipes like a prep sheet.
  const [expanded, setExpanded] = useState(true)
  const portionInfo =
    card?.portions_per_batch != null && card?.portion_weight_g != null
      ? `${card.portions_per_batch} × ${card.portion_weight_g} g`
      : null
  const packInfo = card?.vacuum_bag_size
    ? `bag ${card.vacuum_bag_size}${card.portions_per_bag != null ? ` (${card.portions_per_bag}/bag)` : ''}`
    : null
  const tempRange =
    card?.storage_temp_min_c != null && card?.storage_temp_max_c != null
      ? `${card.storage_temp_min_c}–${card.storage_temp_max_c}°C`
      : null
  const stepCount = stats?.step_count ?? 0
  const ccpCount = stats?.ccp_count ?? 0
  const hasPhoto = !!card?.kitchen_photo_url

  const headerContent = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[var(--color-amber-watch)]/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[color:var(--color-amber-watch)]">
              PF
            </span>
            <h3 className="truncate text-sm font-medium text-cream">
              {item.name}
            </h3>
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-cream/40">
            {item.product_code}
          </p>
        </div>
        {hasPhoto && (
          <img
            src={card!.kitchen_photo_url!}
            alt={`${item.name} kitchen reference`}
            className="h-12 w-12 shrink-0 rounded-md object-cover"
            loading="lazy"
          />
        )}
      </div>

      {item.kitchen_note ? (
        <p className="line-clamp-2 text-xs text-cream/65">{item.kitchen_note}</p>
      ) : (
        <p className="text-xs italic text-cream/35">No kitchen note</p>
      )}

      <dl className="grid grid-cols-2 gap-2 text-[11px]">
        {portionInfo && (
          <div className="flex items-center gap-1.5 text-cream/65">
            <Package className="h-3 w-3 text-cream/40" />
            <span>{portionInfo}</span>
          </div>
        )}
        {packInfo && (
          <div className="flex items-center gap-1.5 text-cream/65">
            <Package className="h-3 w-3 text-cream/40" />
            <span className="truncate">{packInfo}</span>
          </div>
        )}
        {item.shelf_life_days != null && (
          <div className="flex items-center gap-1.5 text-cream/65">
            <Clock className="h-3 w-3 text-cream/40" />
            <span>{item.shelf_life_days} d shelf</span>
          </div>
        )}
        {tempRange && (
          <div className="flex items-center gap-1.5 text-cream/65">
            <Snowflake className="h-3 w-3 text-cream/40" />
            <span>{tempRange}</span>
          </div>
        )}
        {card?.storage_zone && (
          <div className="col-span-2 flex items-center gap-1.5 text-cream/65">
            <Snowflake className="h-3 w-3 text-cream/40" />
            <span className="truncate">{card.storage_zone}</span>
          </div>
        )}
      </dl>
    </>
  )

  return (
    <div className="flex flex-col rounded-xl border border-surface-3 bg-surface-2 text-left transition hover:border-amber-watch/40 hover:bg-surface-3">
      {onOpen && !staffMode ? (
        <button
          type="button"
          onClick={onOpen}
          className="group flex flex-col gap-3 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber-watch)]/60"
        >
          {headerContent}
        </button>
      ) : (
        <div className="flex flex-col gap-3 p-4">{headerContent}</div>
      )}

      {/* Recipe toggle — full L1 cooking instruction inline */}
      <div className="border-t border-surface-3">
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="flex w-full items-center gap-1.5 px-4 py-2 text-[11px] text-cream/55 transition hover:text-cream/80"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <ChefHat className="h-3 w-3" />
          {stepCount > 0
            ? `${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`
            : 'Recipe'}
          {ccpCount > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              {ccpCount} CCP
            </span>
          )}
          <span className="ml-auto text-[10px] text-cream/40">
            {expanded ? 'hide' : 'view recipe'}
          </span>
        </button>
        {expanded && (
          <PfRecipeDetail itemId={item.id} onOpenRelated={onOpenRelated} />
        )}
      </div>

      {/* Staff comment button */}
      {staffMode && onComment && (
        <div className="border-t border-surface-3 px-4 py-2">
          <button
            type="button"
            onClick={onComment}
            className="flex items-center gap-1.5 text-[11px] text-cream/50 transition hover:text-forest-soft"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {feedbackCount ? (
              <span className="font-medium text-forest-soft">
                {feedbackCount} comment{feedbackCount !== 1 ? 's' : ''}
              </span>
            ) : (
              'Add comment'
            )}
          </button>
        </div>
      )}
    </div>
  )
}

/* ── SALE recipe card with BOM tree ────────────────────────── */

interface SaleRecipeCardProps {
  item: MenuItem
  card: DishCardData | undefined
  stats: RecipeStepStats | undefined
  bomChildren: MenuBomChild[]
  steps?: MenuRecipeStep[]
  onOpen?: () => void
  /** Opens a related child PF (e.g. a marinade/base/component) in the drawer. */
  onOpenRelated?: (id: string) => void
  staffMode?: boolean
  feedbackCount?: number
  onComment?: () => void
}

function SaleRecipeCard({ item, stats, bomChildren, steps, onOpen, onOpenRelated, staffMode, feedbackCount, onComment }: SaleRecipeCardProps) {
  // Default expanded: the cook station shows recipes like a prep sheet.
  const [expanded, setExpanded] = useState(true)
  // L1 production flow: for a station-tagged manakish this is the prep half
  // (press → pre-bake → top → blast-freeze → store) — the L2 service bake is
  // hidden here, it lives on the L2 Assembly station.
  const l1Steps = prepSteps(steps ?? [])
  const stepCount = stats?.step_count ?? 0
  const ccpCount = stats?.ccp_count ?? 0
  const hasPhoto = !!item.image_url

  const costDisplay =
    !staffMode && item.cost_per_unit != null
      ? `฿${item.cost_per_unit.toFixed(0)}`
      : null
  const priceDisplay = item.price != null ? `฿${item.price}` : null
  const foodCostPct =
    !staffMode && item.price && item.cost_per_unit
      ? ((item.cost_per_unit / item.price) * 100).toFixed(0)
      : null

  const headerContent = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[var(--color-royal-green)]/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[color:var(--color-forest-soft)]">
              SALE
            </span>
            <h3 className="truncate text-sm font-medium text-cream">
              {formatDishName(item.staff_code, item.name)}
            </h3>
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-cream/40">
            {item.product_code}
          </p>
        </div>
        {hasPhoto && (
          <img
            src={item.image_url!}
            alt={item.name}
            className="h-12 w-12 shrink-0 rounded-md object-cover"
            loading="lazy"
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {priceDisplay && (
          <span className="text-cream/70">{priceDisplay}</span>
        )}
        {costDisplay && (
          <span className="text-cream/50">cost {costDisplay}</span>
        )}
        {foodCostPct && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
              Number(foodCostPct) < 30
                ? 'bg-emerald-900/40 text-emerald-300'
                : Number(foodCostPct) <= 45
                  ? 'bg-amber-900/40 text-amber-300'
                  : 'bg-red-900/40 text-red-300'
            }`}
          >
            FC {foodCostPct}%
          </span>
        )}
        <span className="flex items-center gap-1 text-cream/55">
          <ChefHat className="h-3 w-3" />
          {stepCount} {stepCount === 1 ? 'step' : 'steps'}
        </span>
        {ccpCount > 0 && (
          <span className="flex items-center gap-1 text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            {ccpCount} CCP
          </span>
        )}
      </div>
    </>
  )

  return (
    <div className="flex flex-col rounded-xl border border-surface-3 bg-surface-2 text-left transition hover:border-forest-soft/40 hover:bg-surface-3">
      {onOpen && !staffMode ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex flex-col gap-3 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-forest-soft)]/60"
        >
          {headerContent}
        </button>
      ) : (
        <div className="flex flex-col gap-3 p-4">{headerContent}</div>
      )}

      {/* BOM tree toggle */}
      {bomChildren.length > 0 && (
        <div className="border-t border-surface-3">
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="flex w-full items-center gap-1.5 px-4 py-2 text-[11px] text-cream/55 transition hover:text-cream/80"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <Utensils className="h-3 w-3" />
            {bomChildren.length} ingredient{bomChildren.length !== 1 ? 's' : ''}
          </button>
          {expanded && (
            <ul className="space-y-1 px-4 pb-3">
              {bomChildren.map((bom) => {
                const kindBadge = bom.childKind
                const badgeColor =
                  kindBadge === 'PF'
                    ? 'bg-[var(--color-amber-watch)]/20 text-[color:var(--color-amber-watch)]'
                    : kindBadge === 'MOD'
                      ? 'bg-violet-900/40 text-violet-300'
                      : 'bg-slate-700 text-slate-300'
                const clickable = kindBadge === 'PF' && !!onOpenRelated
                return (
                  <li key={bom.id}>
                    <ClickableIngredientRow
                      clickable={clickable}
                      onClick={() => onOpenRelated?.(bom.childId)}
                      title={clickable ? `Open ${bom.childName ?? ''}` : undefined}
                    >
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider ${badgeColor}`}
                      >
                        {kindBadge}
                      </span>
                      <span
                        className={`min-w-0 truncate ${clickable ? 'text-[color:var(--color-amber-watch)]' : 'text-cream/70'}`}
                      >
                        {bom.childName ?? bom.childId}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-cream/40">
                        ×{bom.quantityPerUnit}
                        {bom.childBaseUnit ? ` ${bom.childBaseUnit}` : ''}
                        {bom.yieldLossPct ? ` (−${bom.yieldLossPct}%)` : ''}
                      </span>
                    </ClickableIngredientRow>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* L1 production flow (press → pre-bake → top → blast-freeze → store).
          For station-tagged manakish the L2 service bake is intentionally hidden. */}
      {l1Steps.length > 0 && (
        <div className="border-t border-surface-3 px-4 py-2">
          <ol className="space-y-0.5">
            {l1Steps.map((s) => (
              <li
                key={s.step_order}
                className="flex gap-1.5 text-[11px] leading-snug text-cream/65"
              >
                <span className="font-mono text-[10px] text-cream/40">{s.step_order}.</span>
                <span className="min-w-0 flex-1">
                  {s.instruction_text ?? s.operation_name}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Staff comment button */}
      {staffMode && onComment && (
        <div className="border-t border-surface-3 px-4 py-2">
          <button
            type="button"
            onClick={onComment}
            className="flex items-center gap-1.5 text-[11px] text-cream/50 transition hover:text-forest-soft"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {feedbackCount ? (
              <span className="font-medium text-forest-soft">
                {feedbackCount} comment{feedbackCount !== 1 ? 's' : ''}
              </span>
            ) : (
              'Add comment'
            )}
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Category section header ───────────────────────────────── */

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="col-span-full flex items-center gap-2 pt-2 first:pt-0">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-cream/50">
        {title}
      </h2>
      <span className="font-mono text-[10px] tabular-nums text-cream/30">
        {count}
      </span>
      <div className="h-px flex-1 bg-surface-3" />
    </div>
  )
}

/* ── Main view ─────────────────────────────────────────────── */

export function L1CookView({
  items,
  typeFilter,
  selectedCategory,
  selectedSubcategory,
  searchQuery,
  availableFilter,
  pfPackCardById,
  recipeStatsById,
  dishCardById,
  childrenByParent,
  recipeStepsByDish,
  onOpenDish,
  staffMode,
  feedbackCountById,
  onComment,
}: L1CookViewProps) {
  // L1 = kitchen prep station. Honor the type filter (defaults to PF upstream,
  // so заготовки lead) plus category, subcategory drill-down, and availability.
  const filtered = useMemo(() => {
    const q = searchQuery?.trim().toLowerCase() ?? ''
    return items.filter((i) => {
      if (!matchesType(i, typeFilter)) return false
      if (selectedCategory && (i.section_id ?? i.category_id) !== selectedCategory) return false
      if (selectedSubcategory && i.category_id !== selectedSubcategory) return false
      if (availableFilter !== null && i.is_available !== availableFilter) return false
      if (q && !i.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, typeFilter, selectedCategory, selectedSubcategory, availableFilter, searchQuery])

  // Group by category for structured rendering
  const grouped = useMemo(() => {
    const catOrder = new Map<string, { name: string; items: MenuItem[] }>()
    const uncategorized: MenuItem[] = []

    for (const item of filtered) {
      if (!item.category_id || !item.category_name) {
        uncategorized.push(item)
        continue
      }
      const existing = catOrder.get(item.category_id)
      if (existing) {
        existing.items.push(item)
      } else {
        catOrder.set(item.category_id, {
          name: item.category_name,
          items: [item],
        })
      }
    }

    return { categories: Array.from(catOrder.values()), uncategorized }
  }, [filtered])

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-cream/50">
        <ChefHat className="h-10 w-10 text-cream/30" />
        <p className="text-sm">
          {searchQuery?.trim()
            ? `No dishes match "${searchQuery.trim()}".`
            : 'No items in this category.'}
        </p>
      </div>
    )
  }

  const renderItem = (item: MenuItem) => {
    if (item.kind === 'SALE') {
      return (
        <SaleRecipeCard
          key={item.id}
          item={item}
          card={dishCardById.get(item.id)}
          stats={recipeStatsById.get(item.id)}
          bomChildren={childrenByParent.get(item.id) ?? []}
          steps={recipeStepsByDish?.get(item.id)}
          onOpen={onOpenDish ? () => onOpenDish(item.id) : undefined}
          onOpenRelated={onOpenDish}
          staffMode={staffMode}
          feedbackCount={feedbackCountById?.get(item.id)}
          onComment={onComment ? () => onComment(item.id) : undefined}
        />
      )
    }
    return (
      <PfCard
        key={item.id}
        item={item}
        card={pfPackCardById.get(item.id)}
        stats={recipeStatsById.get(item.id)}
        onOpen={onOpenDish ? () => onOpenDish(item.id) : undefined}
        onOpenRelated={onOpenDish}
        staffMode={staffMode}
        feedbackCount={feedbackCountById?.get(item.id)}
        onComment={onComment ? () => onComment(item.id) : undefined}
      />
    )
  }

  // If only one type is selected, skip category grouping if only one category
  const showGroupHeaders =
    grouped.categories.length > 1 || grouped.uncategorized.length > 0

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {grouped.categories.map((group) => (
        <Fragment key={group.name}>
          {showGroupHeaders && (
            <SectionHeader title={group.name} count={group.items.length} />
          )}
          {group.items.map(renderItem)}
        </Fragment>
      ))}
      {grouped.uncategorized.length > 0 && (
        <>
          {showGroupHeaders && (
            <SectionHeader
              title="Uncategorized"
              count={grouped.uncategorized.length}
            />
          )}
          {grouped.uncategorized.map(renderItem)}
        </>
      )}
    </div>
  )
}
