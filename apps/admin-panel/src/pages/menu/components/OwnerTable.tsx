import { Fragment, useEffect, useOptimistic, useState, useCallback, useMemo, useRef } from 'react'
import { Check, X, Star, StarOff, ChevronDown, ChevronRight, GitBranch } from 'lucide-react'
import type { MenuDish, MenuSubcategory, PortionUnit } from '../../../hooks/useMenuDishes'
import type { MenuBomChild, MenuItem, NomenclatureKind } from '../../../hooks/useMenuData'
import type { TypeFilterValue } from '../../../components/menu/owner/TypeFilter'
import { useExpandedRows } from '../../../hooks/useExpandedRows'
import { InlineEditCell } from '../../../components/menu/owner/InlineEditCell'
import { DishExpandedCard } from './DishExpandedCard'

interface OwnerTableProps {
  items: MenuItem[]
  typeFilter: TypeFilterValue
  selectedCategory: string | null
  subcategories: Map<string, MenuSubcategory[]>
  childrenByParent: Map<string, MenuBomChild[]>
  dualTypeIds: Set<string>
  onUpdate: (id: string, patch: Partial<Pick<MenuDish, 'name' | 'description' | 'price' | 'is_available' | 'is_featured' | 'portion_size' | 'portion_unit'>>) => Promise<{ ok: boolean; error?: string }>
  /** Parent-provided: true when a recent inline commit failed for this id. */
  isFailed?: (id: string) => boolean
  /** Parent-provided: last error message (used as row-level tooltip). */
  errorFor?: (id: string) => string | undefined
  /** Imperative trigger: when this id changes, auto-expand that row and scroll to it. */
  autoExpandId?: string | null
}

const KIND_BADGE: Record<NomenclatureKind, { label: string; cls: string }> = {
  SALE: {
    label: 'SALE',
    cls: 'bg-[var(--color-royal-green)]/25 text-[color:var(--color-forest-soft)] ring-1 ring-inset ring-[var(--color-forest-soft)]/40',
  },
  PF: {
    label: 'PF',
    cls: 'bg-[var(--color-amber-watch)]/20 text-[color:var(--color-amber-watch)] ring-1 ring-inset ring-[var(--color-amber-watch)]/40',
  },
  MOD: {
    label: 'MOD',
    cls: 'bg-[var(--color-royal-red)]/20 text-[color:var(--color-brick-soft)] ring-1 ring-inset ring-[var(--color-brick-soft)]/40',
  },
}

function KindBadge({ kind, dual }: { kind: NomenclatureKind; dual: boolean }) {
  if (dual) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-cream)] ring-1 ring-inset ring-white/20"
        style={{
          fontFamily: 'var(--font-display-sc)',
          backgroundImage:
            'linear-gradient(90deg, var(--color-royal-green) 0%, var(--color-royal-green) 49%, var(--color-amber-watch) 51%, var(--color-amber-watch) 100%)',
        }}
        title="Dual-type: sold as SALE and used as PF ingredient"
      >
        PF·SALE
      </span>
    )
  }
  const { label, cls } = KIND_BADGE[kind]
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}
      style={{ fontFamily: 'var(--font-display-sc)' }}
    >
      {label}
    </span>
  )
}

function foodCostColor(pct: number): string {
  if (pct < 30) return 'text-emerald-400 bg-emerald-500/10'
  if (pct <= 45) return 'text-amber-400 bg-amber-500/10'
  return 'text-rose-400 bg-rose-500/10'
}

function formatThb(v: number | null): string {
  if (v == null) return '-'
  return `\u0E3F${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function hasNutrition(dish: MenuDish): boolean {
  return dish.calories != null || dish.protein != null || dish.carbs != null || dish.fat != null
}

function formatPortion(dish: MenuDish): string {
  if (dish.portion_size == null || dish.portion_unit == null) return '-'
  return `${dish.portion_size}${dish.portion_unit}`
}

function pricePer100(price: number | null, portionSize: number | null, portionUnit: PortionUnit | null): number | null {
  if (price == null || portionSize == null || portionSize <= 0) return null
  if (portionUnit === 'pcs') return null
  return (price / portionSize) * 100
}

interface PortionEditState {
  id: string
  size: string
  unit: PortionUnit
}

type GroupItem =
  | { type: 'l2-header'; subcategory: MenuSubcategory; dishCount: number }
  | { type: 'dish'; dish: MenuItem }

export function OwnerTable({
  items,
  typeFilter,
  selectedCategory,
  subcategories,
  childrenByParent,
  dualTypeIds,
  onUpdate,
  isFailed,
  errorFor,
  autoExpandId,
}: OwnerTableProps) {
  const filtered = selectedCategory
    ? items.filter((d) => d.category_id === selectedCategory)
    : items

  const [optimisticDishes, setOptimistic] = useOptimistic(
    filtered,
    (state: MenuItem[], update: { id: string; patch: Partial<MenuItem> }) =>
      state.map((d) => (d.id === update.id ? { ...d, ...update.patch } : d)),
  )

  const [portionEditing, setPortionEditing] = useState<PortionEditState | null>(null)
  // Tech-card expand (single row) — kept for backward compat until the
  // Detail Drawer sub-task replaces it.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // PF drill-down (multi-row). Independent from tech-card expand.
  const pfExpanded = useExpandedRows()

  // Imperative auto-expand: when parent sets autoExpandId to a new value,
  // expand that row and scroll it into view. Fires once per id change.
  const lastAutoExpandId = useRef<string | null>(null)
  useEffect(() => {
    if (autoExpandId && autoExpandId !== lastAutoExpandId.current) {
      lastAutoExpandId.current = autoExpandId
      setExpandedId(autoExpandId)
      setTimeout(() => {
        const el = document.querySelector<HTMLElement>(`[data-dish-row="${autoExpandId}"]`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [autoExpandId])

  const toggleExpand = useCallback((dishId: string) => {
    setExpandedId((prev) => (prev === dishId ? null : dishId))
  }, [])

  /** Optimistic patch + remote update. Revert is automatic: on failure
   * the upstream refetch in useMenuData rewrites `items`, which flushes
   * the optimistic overlay. Row-level flash comes from `isFailed`. */
  const commitPatch = useCallback(
    async (
      id: string,
      patch: Partial<
        Pick<
          MenuDish,
          'name' | 'description' | 'price' | 'is_available' | 'is_featured' | 'portion_size' | 'portion_unit'
        >
      >,
    ) => {
      setOptimistic({ id, patch })
      await onUpdate(id, patch)
    },
    [onUpdate, setOptimistic],
  )

  const toggleField = useCallback(
    async (dish: MenuDish, field: 'is_available' | 'is_featured') => {
      await commitPatch(dish.id, { [field]: !dish[field] })
    },
    [commitPatch],
  )

  const startPortionEdit = useCallback((dish: MenuDish) => {
    setPortionEditing({
      id: dish.id,
      size: dish.portion_size?.toString() ?? '',
      unit: dish.portion_unit ?? 'g',
    })
  }, [])

  const cancelPortionEdit = useCallback(() => {
    setPortionEditing(null)
  }, [])

  const savePortionEdit = useCallback(async () => {
    if (!portionEditing) return
    const original = filtered.find((d) => d.id === portionEditing.id)
    if (!original) return

    const newSize = portionEditing.size ? Number(portionEditing.size) : null
    const newUnit = newSize != null ? portionEditing.unit : null

    if (newSize === original.portion_size && newUnit === original.portion_unit) {
      setPortionEditing(null)
      return
    }

    setOptimistic({ id: portionEditing.id, patch: { portion_size: newSize, portion_unit: newUnit } })
    setPortionEditing(null)
    await onUpdate(portionEditing.id, { portion_size: newSize, portion_unit: newUnit })
  }, [portionEditing, filtered, onUpdate, setOptimistic])

  const handlePortionKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') savePortionEdit()
      if (e.key === 'Escape') cancelPortionEdit()
    },
    [savePortionEdit, cancelPortionEdit],
  )

  // Group dishes with L2 subcategory headers.
  // A dish's category_id may point to either an L1 category OR an L2 subcategory
  // (the join returns whatever row matches). Render an L2 header only when at
  // least one dish actually references that L2 — prevents empty dividers.
  const groupedDishes = useMemo((): GroupItem[] => {
    const relevantL1Ids = selectedCategory
      ? [selectedCategory]
      : (Array.from(new Set(optimisticDishes.map((d) => d.category_id).filter(Boolean))) as string[])

    const groups: GroupItem[] = []
    const claimed = new Set<string>()

    for (const catId of relevantL1Ids) {
      const l2s = subcategories.get(catId) ?? []
      const directDishes = optimisticDishes.filter((d) => d.category_id === catId)

      if (l2s.length === 0) {
        for (const dish of directDishes) {
          groups.push({ type: 'dish', dish })
          claimed.add(dish.id)
        }
        continue
      }

      // Dishes directly under the L1 (no L2 match) render first without a header
      for (const dish of directDishes) {
        groups.push({ type: 'dish', dish })
        claimed.add(dish.id)
      }

      // Then each non-empty L2: header + its dishes
      for (const l2 of l2s) {
        const l2Dishes = optimisticDishes.filter((d) => d.category_id === l2.id)
        if (l2Dishes.length === 0) continue
        groups.push({ type: 'l2-header', subcategory: l2, dishCount: l2Dishes.length })
        for (const dish of l2Dishes) {
          groups.push({ type: 'dish', dish })
          claimed.add(dish.id)
        }
      }
    }

    // Add dishes without a category OR not claimed above
    for (const dish of optimisticDishes) {
      if (!claimed.has(dish.id) && dish.category_id == null) {
        groups.push({ type: 'dish', dish })
      }
    }

    return groups
  }, [optimisticDishes, subcategories, selectedCategory])

  if (optimisticDishes.length === 0) {
    const emptyCopy =
      typeFilter === 'all'
        ? 'No items in this category.'
        : `No ${typeFilter} items in this category.`
    return (
      <div className="flex flex-col items-center justify-center py-20 text-sm text-slate-500">
        <span>{emptyCopy}</span>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/50 text-left text-[10px] uppercase tracking-wider text-slate-500">
            <th className="px-2 py-2.5" style={{ width: 28 }}></th>
            <th className="px-2 py-2.5" style={{ width: 28 }}></th>
            <th className="px-3 py-2.5">Name</th>
            <th className="px-3 py-2.5">Type</th>
            <th className="px-3 py-2.5">Description</th>
            <th className="px-3 py-2.5">Category</th>
            <th className="px-3 py-2.5 text-right">Portion</th>
            <th className="px-3 py-2.5 text-right">Price</th>
            <th className="px-3 py-2.5 text-right">&#x0E3F;/100g</th>
            <th className="px-3 py-2.5 text-right">Cost</th>
            <th className="px-3 py-2.5 text-right">Food Cost %</th>
            <th className="px-3 py-2.5 text-right">Margin</th>
            <th className="px-3 py-2.5 text-center">Available</th>
            <th className="px-3 py-2.5 text-center">Featured</th>
          </tr>
        </thead>
        <tbody>
          {groupedDishes.map((item) => {
            if (item.type === 'l2-header') {
              return (
                <tr key={`l2-${item.subcategory.id}`} className="bg-slate-900/30">
                  <td colSpan={14} className="px-3 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      {item.subcategory.name}
                    </span>
                  </td>
                </tr>
              )
            }

            const dish = item.dish
            const cost = dish.cost_per_unit
            const price = dish.price ?? 0
            const hasCost = cost != null
            const foodCostPct = hasCost && price > 0 ? (cost / price) * 100 : 0
            const margin = hasCost ? price - cost : 0

            const isExpanded = expandedId === dish.id
            const bomChildren = childrenByParent.get(dish.id) ?? []
            const isDrilled = pfExpanded.isExpanded(dish.id)
            const isDual = dualTypeIds.has(dish.id)
            const rowFailed = isFailed?.(dish.id) ?? false
            const rowError = errorFor?.(dish.id)

            return (
              <Fragment key={dish.id}>
              <tr
                data-dish-row={dish.id}
                title={rowError}
                className={`border-b border-slate-800/50 transition ${
                  isExpanded ? 'bg-slate-800/40' : 'hover:bg-slate-800/30'
                } ${rowFailed ? 'animate-[inline-flash_1200ms_ease-out]' : ''}`}
              >
                {/* Expand toggle (tech card) */}
                <td className="px-2 py-2">
                  <button
                    onClick={() => toggleExpand(dish.id)}
                    className="rounded p-1 text-slate-500 transition hover:bg-slate-700 hover:text-slate-200"
                    title={isExpanded ? 'Collapse' : 'Expand tech card'}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                </td>

                {/* BOM drill-down toggle — only for items that reference children */}
                <td className="px-2 py-2">
                  {bomChildren.length > 0 ? (
                    <button
                      onClick={() => pfExpanded.toggle(dish.id)}
                      className={`rounded p-1 transition ${
                        isDrilled
                          ? 'bg-[var(--color-amber-watch)]/20 text-[color:var(--color-amber-watch)]'
                          : 'text-slate-500 hover:bg-slate-700 hover:text-slate-200'
                      }`}
                      title={
                        isDrilled
                          ? `Hide ${bomChildren.length} BOM children`
                          : `Show ${bomChildren.length} BOM children`
                      }
                    >
                      <GitBranch className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <span className="inline-block h-5 w-5" aria-hidden />
                  )}
                </td>

                {/* Name */}
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <InlineEditCell<string | null>
                      value={dish.name}
                      onCommit={(next) => {
                        if (next != null && next !== dish.name) {
                          void commitPatch(dish.id, { name: next })
                        }
                      }}
                      variant="text"
                      ariaLabel={`Edit name for ${dish.name}`}
                      className="font-medium text-[color:var(--color-cream)]"
                      isFailed={rowFailed}
                    />
                    {!hasNutrition(dish) && (
                      <span className="inline-flex rounded-full bg-slate-700 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
                        No KBJU
                      </span>
                    )}
                  </span>
                </td>

                {/* Type badge */}
                <td className="px-3 py-2">
                  <KindBadge kind={dish.kind} dual={isDual} />
                </td>

                {/* Description */}
                <td className="max-w-[200px] px-3 py-2 text-slate-400">
                  {dish.description ? (
                    <span title={dish.description} className="block truncate">
                      {dish.description.length > 40
                        ? dish.description.slice(0, 40) + '...'
                        : dish.description}
                    </span>
                  ) : (
                    <span className="text-slate-600">-</span>
                  )}
                </td>

                {/* Category */}
                <td className="px-3 py-2">
                  {dish.category_name ? (
                    <span className="inline-flex rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                      {dish.category_name}
                    </span>
                  ) : (
                    <span className="text-slate-600">-</span>
                  )}
                </td>

                {/* Portion */}
                <td className="px-3 py-2 text-right">
                  {portionEditing?.id === dish.id ? (
                    <div className="flex items-center justify-end gap-1">
                      <input
                        value={portionEditing.size}
                        onChange={(e) => setPortionEditing({ ...portionEditing, size: e.target.value })}
                        onKeyDown={handlePortionKeyDown}
                        className="w-16 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-right text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                        type="number"
                        min={0}
                        autoFocus
                      />
                      <select
                        value={portionEditing.unit}
                        onChange={(e) => setPortionEditing({ ...portionEditing, unit: e.target.value as PortionUnit })}
                        className="rounded border border-slate-600 bg-slate-800 px-1 py-1 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                      >
                        <option value="g">g</option>
                        <option value="ml">ml</option>
                        <option value="pcs">pcs</option>
                      </select>
                      <button onClick={savePortionEdit} className="rounded bg-emerald-600 p-0.5 text-white hover:bg-emerald-500">
                        <Check className="h-3 w-3" />
                      </button>
                      <button onClick={cancelPortionEdit} className="rounded bg-slate-700 p-0.5 text-slate-300 hover:bg-slate-600">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startPortionEdit(dish)}
                      className={`text-right ${dish.portion_size != null ? 'text-slate-300' : 'text-slate-600'}`}
                      title="Edit portion size"
                    >
                      {formatPortion(dish)}
                    </button>
                  )}
                </td>

                {/* Price */}
                <td className="px-3 py-2 text-right">
                  <InlineEditCell<number | null>
                    value={dish.price}
                    onCommit={(next) => {
                      if (next !== dish.price) {
                        void commitPatch(dish.id, { price: next })
                      }
                    }}
                    variant="number"
                    min={0}
                    step={1}
                    align="right"
                    ariaLabel={`Edit price for ${dish.name}`}
                    className="font-mono font-medium tabular-nums text-[color:var(--color-cream)]"
                    format={(v) => (v == null ? '-' : formatThb(v))}
                    isFailed={rowFailed}
                  />
                </td>

                {/* ฿/100g */}
                <td className="px-3 py-2 text-right">
                  {(() => {
                    const per100 = pricePer100(dish.price, dish.portion_size, dish.portion_unit)
                    return per100 != null ? (
                      <span className="text-slate-400">{formatThb(Math.round(per100))}</span>
                    ) : (
                      <span className="text-slate-600">&mdash;</span>
                    )
                  })()}
                </td>

                {/* Cost */}
                <td className="px-3 py-2 text-right">
                  {hasCost ? (
                    <span className="text-slate-400">{formatThb(cost)}</span>
                  ) : (
                    <span className="inline-flex rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                      No BOM
                    </span>
                  )}
                </td>

                {/* Food Cost % */}
                <td className="px-3 py-2 text-right">
                  {hasCost && price > 0 ? (
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${foodCostColor(foodCostPct)}`}>
                      {foodCostPct.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-slate-600">&mdash;</span>
                  )}
                </td>

                {/* Margin */}
                <td className="px-3 py-2 text-right">
                  {hasCost && price > 0 ? (
                    <span className={margin > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {formatThb(margin)}
                    </span>
                  ) : (
                    <span className="text-slate-600">&mdash;</span>
                  )}
                </td>

                {/* Available toggle */}
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => toggleField(dish, 'is_available')}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                      dish.is_available ? 'bg-emerald-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                        dish.is_available ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </td>

                {/* Featured toggle */}
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => toggleField(dish, 'is_featured')}
                    className={`transition ${
                      dish.is_featured ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    {dish.is_featured ? <Star className="h-4 w-4" /> : <StarOff className="h-4 w-4" />}
                  </button>
                </td>
              </tr>
              {isDrilled && bomChildren.length > 0 && (
                <BomChildRows
                  parentId={dish.id}
                  parentName={dish.name}
                  children={bomChildren}
                />
              )}
              {isExpanded && (
                <tr className="bg-slate-950/60">
                  <td colSpan={14} className="p-0">
                    <DishExpandedCard dish={dish} />
                  </td>
                </tr>
              )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

interface BomChildRowsProps {
  parentId: string
  parentName: string
  children: MenuBomChild[]
}

/** Renders BOM children as indented table rows beneath the parent dish.
 * Tree-character prefix (└─) + Alegreya body font for an editorial,
 * dimmed look that clearly reads as "inside this recipe". Rows are
 * presentational-only in the foundation; future sub-tasks (inline edit,
 * detail drawer) will add interactivity. */
function BomChildRows({ parentId, parentName, children }: BomChildRowsProps) {
  return (
    <>
      {children.map((c, idx) => {
        const isLast = idx === children.length - 1
        const prefix = isLast ? '└─' : '├─'
        const child = c.child
        const kind = child?.kind ?? null
        const unit = child?.base_unit ?? ''
        const costContribution =
          child?.cost_per_unit != null
            ? c.quantityPerUnit *
              child.cost_per_unit *
              (1 + (c.yieldLossPct ?? 0) / 100)
            : null
        return (
          <tr
            key={`${parentId}-child-${c.id}`}
            className="bg-slate-950/40 text-[color:var(--color-cream)]/60"
            data-bom-child-of={parentId}
          >
            <td className="px-2 py-1.5" />
            <td className="px-2 py-1.5" />
            <td className="px-3 py-1.5">
              <span className="flex items-center gap-2">
                <span
                  className="font-mono text-[10px] text-slate-600"
                  aria-hidden
                  title={`Child of ${parentName}`}
                >
                  {prefix}
                </span>
                <span
                  className="italic"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {child?.name ?? <span className="text-rose-400">missing</span>}
                </span>
              </span>
            </td>
            <td className="px-3 py-1.5">
              {kind && (
                <span
                  className="inline-flex rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider opacity-70"
                  style={{ fontFamily: 'var(--font-display-sc)' }}
                >
                  {kind}
                </span>
              )}
            </td>
            <td className="px-3 py-1.5 text-slate-600" colSpan={2}>
              <span className="font-mono text-[10px] tabular-nums">
                {c.quantityPerUnit.toFixed(2)}
                {unit ? ` ${unit}` : ''}
                {c.yieldLossPct != null && c.yieldLossPct > 0 && (
                  <span className="ml-2 text-rose-400/60">
                    +{c.yieldLossPct}% loss
                  </span>
                )}
              </span>
            </td>
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5 text-right">
              {costContribution != null && (
                <span className="font-mono text-[10px] tabular-nums text-slate-500">
                  {'\u0E3F'}
                  {costContribution.toFixed(1)}
                </span>
              )}
            </td>
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5" />
          </tr>
        )
      })}
    </>
  )
}
