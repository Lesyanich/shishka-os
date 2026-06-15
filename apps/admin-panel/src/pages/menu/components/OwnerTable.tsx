import { Fragment, useEffect, useOptimistic, useState, useCallback, useMemo, useRef } from 'react'
import { Check, X, Star, StarOff, ChevronDown, ChevronRight, GitBranch, PanelRightOpen, Upload, Loader2, CheckCircle2, AlertCircle, Globe, EyeOff } from 'lucide-react'
import type { MenuDish, MenuSubcategory, PortionUnit } from '../../../hooks/useMenuDishes'
import type { MenuBomChild, MenuItem, NomenclatureKind } from '../../../hooks/useMenuData'
import { useLoyversePushDish } from '../../../hooks/useLoyversePushDish'
import type { ChannelMargin } from '../../../hooks/useChannelMargins'
import type { TypeFilterValue } from '../../../components/menu/owner/TypeFilter'
import { useExpandedRows } from '../../../hooks/useExpandedRows'
import { useRowKeyboardNav } from '../../../hooks/useRowKeyboardNav'
import { InlineEditCell } from '../../../components/menu/owner/InlineEditCell'
import { DishExpandedCard } from './DishExpandedCard'

interface OwnerTableProps {
  items: MenuItem[]
  typeFilter: TypeFilterValue
  selectedCategory: string | null
  subcategories: Map<string, MenuSubcategory[]>
  childrenByParent: Map<string, MenuBomChild[]>
  dualTypeIds: Set<string>
  onUpdate: (id: string, patch: Partial<Pick<MenuDish, 'name' | 'description' | 'price' | 'is_available' | 'is_featured' | 'portion_size' | 'portion_unit' | 'launch_phase' | 'stock_state'> & { is_web_visible: boolean }>) => Promise<{ ok: boolean; error?: string }>
  /** Parent-provided: true when a recent inline commit failed for this id. */
  isFailed?: (id: string) => boolean
  /** Parent-provided: last error message (used as row-level tooltip). */
  errorFor?: (id: string) => string | undefined
  /** 'o' — open detail drawer for focused row. Stub until drawer sub-task lands. */
  onOpenDrawer?: (id: string) => void
  /** Imperative trigger: when this id changes, auto-expand that row and scroll to it. */
  autoExpandId?: string | null
  /** Grab channel margin data keyed by nomenclature_id. */
  grabMargins?: Map<string, ChannelMargin>
  /** Called after a successful Loyverse push so the parent can refetch
   * (updates pos_status + loyverse_synced_at in the table). */
  onPushed?: () => void
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

/** 4-dot card-completeness indicator. Dots: customer description, cook note,
 * assembler note, POS status beyond draft. */
function CompletenessIndicator({ item }: { item: MenuItem }) {
  const dots = [
    { label: 'Customer', filled: !!item.customer_description },
    { label: 'Cook', filled: !!item.kitchen_note },
    { label: 'Assembler', filled: !!item.assembler_note },
    { label: 'POS', filled: item.pos_status !== 'draft' },
  ]
  return (
    <div
      className="flex items-center gap-1"
      title={dots.map((d) => `${d.label}: ${d.filled ? 'OK' : 'empty'}`).join(', ')}
    >
      {dots.map((d) => (
        <span
          key={d.label}
          className={`inline-block h-2 w-2 rounded-full ${d.filled ? 'bg-forest-soft' : 'bg-surface-3'}`}
        />
      ))}
    </div>
  )
}

/** Loyverse POS lifecycle badge. draft → approved → synced. */
const LOYVERSE_STATUS: Record<MenuItem['pos_status'], { label: string; cls: string }> = {
  draft: {
    label: 'Draft',
    cls: 'bg-surface-3/60 text-cream/60 ring-cream/20',
  },
  approved: {
    label: 'Approved',
    cls: 'bg-[var(--color-amber-watch)]/20 text-[color:var(--color-amber-watch)] ring-[var(--color-amber-watch)]/40',
  },
  synced: {
    label: 'Synced',
    cls: 'bg-[var(--color-royal-green)]/25 text-[color:var(--color-forest-soft)] ring-[var(--color-forest-soft)]/40',
  },
}

function LoyverseBadge({ status, itemId }: { status: MenuItem['pos_status']; itemId: string | null }) {
  const { label, cls } = LOYVERSE_STATUS[status] ?? LOYVERSE_STATUS.draft
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${cls}`}
      style={{ fontFamily: 'var(--font-display-sc)' }}
      title={itemId ? `Loyverse item ${itemId}` : 'Not linked to a Loyverse item yet'}
    >
      {label}
    </span>
  )
}

/** Website (showcase) visibility — driven solely by is_web_visible (mig 263),
 * decoupled from Loyverse/availability. SALE-only; PF/MOD never hit the site. */
const SITE_STATUS_STYLE = {
  live: 'bg-[var(--color-royal-green)]/25 text-[color:var(--color-forest-soft)] ring-[var(--color-forest-soft)]/40',
  // Live but needs attention: not orderable (is_available=false) or Loyverse-stale.
  warn: 'bg-[var(--color-amber-watch)]/20 text-[color:var(--color-amber-watch)] ring-[var(--color-amber-watch)]/40',
  hidden: 'bg-surface-3/60 text-cream/60 ring-cream/20',
} as const

/** Compact date + time for the last Loyverse sync, e.g. "02 Jun 14:30". */
function formatSyncedAt(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${date} ${time}`
}

/** Drift detector: a synced dish whose DB row changed AFTER its last Loyverse
 * push — i.e. the POS copy is stale and a re-push is needed. */
function isLoyverseStale(item: MenuItem): boolean {
  if (item.kind !== 'SALE' || !item.loyverse_synced_at || !item.updated_at) return false
  return new Date(item.updated_at).getTime() > new Date(item.loyverse_synced_at).getTime()
}

export type SiteBadgeState = 'live' | 'warn' | 'hidden' | 'na'

/** Website badge state for a dish (mig 263). Visibility is driven solely by
 * is_web_visible; 'warn' flags a dish that IS on the site but needs attention —
 * not orderable (is_available off) or Loyverse price stale. 'na' for non-SALE. */
export function siteBadgeState(item: MenuItem): SiteBadgeState {
  if (item.kind !== 'SALE') return 'na'
  if (!item.is_web_visible) return 'hidden'
  return isLoyverseStale(item) || !item.is_available ? 'warn' : 'live'
}

/** POS price drift: the price Loyverse currently holds differs from our DB price.
 * Returns the Loyverse price when it mismatches, else null (in sync / unknown). */
export function loyversePriceDrift(item: MenuItem): number | null {
  if (item.kind !== 'SALE' || item.loyverse_price == null || item.price == null) return null
  return Number(item.loyverse_price) !== Number(item.price) ? Number(item.loyverse_price) : null
}

function foodCostColor(pct: number): string {
  if (pct < 30) return 'text-forest-soft bg-royal-green/25'
  if (pct <= 45) return 'text-amber-watch bg-amber-watch/15'
  return 'text-brick-soft bg-brick-soft/15'
}

const PHASE_STYLE: Record<number, string> = {
  1: 'bg-[var(--color-royal-green)]/20 text-[color:var(--color-forest-soft)] ring-[var(--color-forest-soft)]/40',
  2: 'bg-[var(--color-amber-watch)]/20 text-[color:var(--color-amber-watch)] ring-[var(--color-amber-watch)]/40',
}
const PHASE_DEFAULT_STYLE = 'bg-surface-3/50 text-cream/60 ring-cream/20'
const PHASE_OPTIONS = [1, 2, 3, 4, 5] as const

// Stock state (mig 249): in_stock = normal; coming_soon / out_of_stock keep the
// dish visible on the menu but greyed + not orderable / not pushable to POS.
const STOCK_OPTIONS = [
  { value: 'in_stock', short: 'Stock', label: 'In stock' },
  { value: 'coming_soon', short: 'Soon', label: 'Coming soon' },
  { value: 'out_of_stock', short: 'Out', label: 'Out of stock' },
] as const
const STOCK_STYLE: Record<string, string> = {
  in_stock: 'bg-[var(--color-royal-green)]/20 text-[color:var(--color-forest-soft)] ring-[var(--color-forest-soft)]/40',
  coming_soon: 'bg-[var(--color-amber-watch)]/20 text-[color:var(--color-amber-watch)] ring-[var(--color-amber-watch)]/40',
  out_of_stock: 'bg-[var(--color-royal-red)]/20 text-[color:var(--color-brick-soft)] ring-[var(--color-brick-soft)]/40',
}

function formatThb(v: number | null): string {
  if (v == null) return '-'
  return `\u0E3F${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function hasNutrition(dish: MenuDish): boolean {
  return dish.calories != null || dish.protein != null || dish.carbs != null || dish.fat != null
}

/** Compact KБЖУ chips: calories (amber), protein (sky), carbs (violet),
 * fat (rose). Per the menu design system. Only renders the values present. */
function NutritionCell({ dish }: { dish: MenuDish }) {
  const slots: { v: number | null; label: string; title: string; cls: string }[] = [
    { v: dish.calories, label: 'kcal', title: 'Calories (kcal)', cls: 'bg-amber-900/40 text-amber-300' },
    { v: dish.protein, label: 'P', title: 'Protein (g)', cls: 'bg-sky-900/40 text-sky-300' },
    { v: dish.carbs, label: 'C', title: 'Carbs (g)', cls: 'bg-violet-900/40 text-violet-300' },
    { v: dish.fat, label: 'F', title: 'Fat (g)', cls: 'bg-rose-900/40 text-rose-300' },
  ]
  if (slots.every((s) => s.v == null)) return <span className="text-cream/30">&mdash;</span>
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {slots.map((s) =>
        s.v != null ? (
          <span
            key={s.label}
            title={s.title}
            className={`inline-flex rounded px-1 py-0.5 text-[9px] font-medium tabular-nums ${s.cls}`}
          >
            {s.label === 'kcal' ? Math.round(s.v) : `${s.label}${Math.round(s.v)}`}
          </span>
        ) : null,
      )}
    </div>
  )
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
  onOpenDrawer,
  autoExpandId,
  grabMargins,
  onPushed,
}: OwnerTableProps) {
  const filtered = selectedCategory
    ? items.filter((d) => (d.section_id ?? d.category_id) === selectedCategory)
    : items

  const [optimisticDishes, setOptimistic] = useOptimistic(
    filtered,
    (state: MenuItem[], update: { id: string; patch: Partial<MenuItem> }) =>
      state.map((d) => (d.id === update.id ? { ...d, ...update.patch } : d)),
  )

  // Per-row Loyverse push. The hook's `isPushing` is global, so track which
  // row is in-flight separately and key the transient feedback by dish id.
  const { pushDish } = useLoyversePushDish()
  const [pushingId, setPushingId] = useState<string | null>(null)
  const [pushMsg, setPushMsg] = useState<{ id: string; type: 'ok' | 'error'; text: string } | null>(null)

  const handlePush = useCallback(
    async (id: string) => {
      setPushingId(id)
      setPushMsg(null)
      const result = await pushDish(id)
      if (result.ok) {
        setPushMsg({ id, type: 'ok', text: 'Pushed' })
        onPushed?.()
      } else {
        setPushMsg({ id, type: 'error', text: result.reason ?? result.error ?? 'Push failed' })
      }
      setPushingId(null)
      setTimeout(() => setPushMsg((m) => (m?.id === id ? null : m)), 6000)
    },
    [pushDish, onPushed],
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
          'name' | 'description' | 'price' | 'is_available' | 'is_featured' | 'portion_size' | 'portion_unit' | 'launch_phase' | 'stock_state'
        > & { is_web_visible: boolean }
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

  /** Toggle website visibility (mig 263). Decoupled from Loyverse: showing a
   * dish on the site no longer requires a POS push; hiding leaves it sellable. */
  const toggleWeb = useCallback(
    async (dish: MenuItem) => {
      await commitPatch(dish.id, { is_web_visible: !dish.is_web_visible })
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
      : (Array.from(
          new Set(optimisticDishes.map((d) => d.section_id ?? d.category_id).filter(Boolean)),
        ) as string[])

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

  // Ordered list of row ids (skip L2 headers — they're not navigable).
  const orderedRowIds = useMemo(
    () => groupedDishes.filter((g) => g.type === 'dish').map((g) => g.dish.id),
    [groupedDishes],
  )

  const kbd = useRowKeyboardNav({
    ids: orderedRowIds,
    // Enter: toggle tech-card expand. For SALE with PF children, also toggle
    // drill-down so the keyboard-first flow exposes the tree in one keystroke.
    onEnter: (id) => {
      toggleExpand(id)
      const hasKids = (childrenByParent.get(id) ?? []).length > 0
      const item = items.find((i) => i.id === id)
      if (hasKids && item?.kind === 'SALE') pfExpanded.toggle(id)
    },
    onOpen: (id) => onOpenDrawer?.(id),
    // 'e' → synthesize a click on the focused row's name button (static
    // InlineEditCell display), which switches it into edit mode and
    // auto-focuses the input. Fallback: first editable cell.
    onEdit: (id) => {
      const row = containerElementRef.current?.querySelector<HTMLElement>(
        `[data-dish-row="${id}"]`,
      )
      if (!row) return
      const target =
        row.querySelector<HTMLButtonElement>('[data-inline-cell="name"] button') ??
        row.querySelector<HTMLButtonElement>('[data-inline-cell] button')
      target?.click()
    },
    onEscape: () => {
      // When a drawer or inline-edit is open, they cancel first (their own
      // onKeyDown handles Escape). This fires only when nothing else claims
      // it — we just clear the focus ring.
    },
  })

  // Keep a separate DOM ref so onEdit can scope queries to our table scroll
  // container. The hook's own ref is used for focus + keydown attach.
  const containerElementRef = useRef<HTMLDivElement | null>(null)

  // Scroll focused row into view on change
  useEffect(() => {
    if (!kbd.focusedId) return
    const el = containerElementRef.current?.querySelector<HTMLElement>(
      `[data-dish-row="${kbd.focusedId}"]`,
    )
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [kbd.focusedId])

  if (optimisticDishes.length === 0) {
    const emptyCopy =
      typeFilter === 'all'
        ? 'No items in this category.'
        : `No ${typeFilter} items in this category.`
    return (
      <div className="flex flex-col items-center justify-center py-20 text-sm text-cream/50">
        <span>{emptyCopy}</span>
      </div>
    )
  }

  return (
    <div
      {...kbd.containerProps}
      ref={(el) => {
        kbd.containerProps.ref.current = el
        containerElementRef.current = el
      }}
      aria-label="Menu items"
      aria-rowcount={orderedRowIds.length}
      className="overflow-x-auto rounded-lg border border-surface-3 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-brick-soft)]/40"
    >
      <table className="w-full text-xs" role="presentation">
        <thead>
          <tr
            role="row"
            className="border-b border-surface-3 bg-surface-1/50 text-left text-[10px] uppercase tracking-wider text-cream/50"
          >
            <th role="columnheader" className="px-2 py-2.5" style={{ width: 28 }}></th>
            <th role="columnheader" className="px-2 py-2.5" style={{ width: 28 }}></th>
            <th role="columnheader" className="px-3 py-2.5">Name</th>
            <th role="columnheader" className="px-3 py-2.5">Type</th>
            <th role="columnheader" className="px-3 py-2.5">Description</th>
            <th role="columnheader" className="px-3 py-2.5">Category</th>
            <th role="columnheader" className="px-3 py-2.5 text-right">Portion</th>
            <th role="columnheader" className="px-3 py-2.5 text-right">Nutrition</th>
            <th role="columnheader" className="px-3 py-2.5 text-right">Price</th>
            <th role="columnheader" className="px-3 py-2.5 text-right">&#x0E3F;/100g</th>
            <th role="columnheader" className="px-3 py-2.5 text-right">Cost</th>
            <th role="columnheader" className="px-3 py-2.5 text-right">Food Cost %</th>
            <th role="columnheader" className="px-3 py-2.5 text-right">Margin</th>
            <th role="columnheader" className="px-3 py-2.5 text-right">Grab Price</th>
            <th role="columnheader" className="px-3 py-2.5 text-right">Grab Margin %</th>
            <th role="columnheader" className="px-3 py-2.5 text-center">Available</th>
            <th role="columnheader" className="px-3 py-2.5 text-center">Featured</th>
            <th role="columnheader" className="px-3 py-2.5 text-center">Phase</th>
            <th role="columnheader" className="px-3 py-2.5 text-center">Version</th>
            <th role="columnheader" className="px-3 py-2.5 text-center">Verified</th>
            <th role="columnheader" className="px-3 py-2.5 text-center">Loyverse</th>
            <th role="columnheader" className="px-3 py-2.5 text-center">Synced</th>
            <th role="columnheader" className="px-3 py-2.5 text-center">DB Updated</th>
            <th role="columnheader" className="px-3 py-2.5 text-center">Push</th>
            <th role="columnheader" className="px-3 py-2.5 text-center">Site</th>
            <th role="columnheader" className="px-3 py-2.5 text-center">Card</th>
          </tr>
        </thead>
        <tbody>
          {groupedDishes.map((item) => {
            if (item.type === 'l2-header') {
              return (
                <tr key={`l2-${item.subcategory.id}`} className="bg-surface-1/30">
                  <td colSpan={26} className="px-3 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-cream/50">
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
            // Food-cost % excludes packaging (owner decision); margin uses full
            // cost (packaging is a real cost) so profitability stays accurate.
            const foodCost = dish.food_cost ?? cost
            const foodCostPct = foodCost != null && price > 0 ? (foodCost / price) * 100 : 0
            const margin = hasCost ? price - cost : 0

            const isExpanded = expandedId === dish.id
            const bomChildren = childrenByParent.get(dish.id) ?? []
            const isDrilled = pfExpanded.isExpanded(dish.id)
            const isDual = dualTypeIds.has(dish.id)
            const rowFailed = isFailed?.(dish.id) ?? false
            const rowError = errorFor?.(dish.id)
            const rowIndex = orderedRowIds.indexOf(dish.id) + 1 // ARIA is 1-based
            const isFocused = kbd.focusedId === dish.id
            const hasChildren = bomChildren.length > 0

            return (
              <Fragment key={dish.id}>
              <tr
                id={`row-${dish.id}`}
                role="row"
                aria-rowindex={rowIndex}
                aria-selected={isFocused || undefined}
                aria-expanded={hasChildren ? isDrilled : undefined}
                data-dish-row={dish.id}
                data-focused={isFocused || undefined}
                title={rowError}
                onClick={() => kbd.setFocused(dish.id)}
                className={`border-b border-surface-3/50 transition ${
                  isExpanded ? 'bg-surface-2/40' : 'hover:bg-surface-2/30'
                } ${
                  isFocused
                    ? 'ring-2 ring-inset ring-[var(--color-brick-soft)]/70 bg-[var(--color-royal-red)]/5'
                    : ''
                } ${rowFailed ? 'animate-[inline-flash_1200ms_ease-out]' : ''} ${
                  !dish.is_available ? 'opacity-45' : dish.stock_state !== 'in_stock' ? 'opacity-70' : ''
                }`}
              >
                {/* Expand toggle (tech card) */}
                <td className="px-2 py-2">
                  <button
                    onClick={() => toggleExpand(dish.id)}
                    className="rounded p-1 text-cream/50 transition hover:bg-surface-3 hover:text-cream"
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
                          : 'text-cream/50 hover:bg-surface-3 hover:text-cream'
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
                <td className="px-3 py-2" data-inline-cell="name">
                  <span className="flex items-center gap-2">
                    {dish.staff_code && (
                      <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cream/70">
                        {dish.staff_code}
                      </span>
                    )}
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
                      <span className="inline-flex rounded-full bg-surface-3 px-1.5 py-0.5 text-[9px] font-medium text-cream/60">
                        No nutrition
                      </span>
                    )}
                  </span>
                </td>

                {/* Type badge */}
                <td className="px-3 py-2">
                  <KindBadge kind={dish.kind} dual={isDual} />
                </td>

                {/* Description */}
                <td className="max-w-[200px] px-3 py-2 text-cream/60">
                  {dish.description ? (
                    <span title={dish.description} className="block truncate">
                      {dish.description.length > 40
                        ? dish.description.slice(0, 40) + '...'
                        : dish.description}
                    </span>
                  ) : (
                    <span className="text-cream/40">-</span>
                  )}
                </td>

                {/* Category */}
                <td className="px-3 py-2">
                  {dish.category_name ? (
                    <span className="inline-flex rounded-full bg-surface-3/50 px-2 py-0.5 text-[10px] font-medium text-cream/80">
                      {dish.category_name}
                    </span>
                  ) : (
                    <span className="text-cream/40">-</span>
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
                        className="w-16 rounded border border-surface-3 bg-surface-2 px-2 py-1 text-right text-xs text-cream focus:border-forest-soft focus:outline-none"
                        type="number"
                        min={0}
                        autoFocus
                      />
                      <select
                        value={portionEditing.unit}
                        onChange={(e) => setPortionEditing({ ...portionEditing, unit: e.target.value as PortionUnit })}
                        className="rounded border border-surface-3 bg-surface-2 px-1 py-1 text-xs text-cream focus:border-forest-soft focus:outline-none"
                      >
                        <option value="g">g</option>
                        <option value="ml">ml</option>
                        <option value="pcs">pcs</option>
                      </select>
                      <button onClick={savePortionEdit} className="rounded bg-royal-green p-0.5 text-white hover:bg-forest-soft">
                        <Check className="h-3 w-3" />
                      </button>
                      <button onClick={cancelPortionEdit} className="rounded bg-surface-3 p-0.5 text-cream/80 hover:bg-surface-3">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startPortionEdit(dish)}
                      className={`text-right ${dish.portion_size != null ? 'text-cream/80' : 'text-cream/40'}`}
                      title="Edit portion size"
                    >
                      {formatPortion(dish)}
                    </button>
                  )}
                </td>

                {/* Nutrition (КБЖУ) */}
                <td className="px-3 py-2 text-right">
                  <NutritionCell dish={dish} />
                </td>

                {/* Price */}
                <td className="px-3 py-2 text-right" data-inline-cell="price">
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
                      <span className="text-cream/60">{formatThb(Math.round(per100))}</span>
                    ) : (
                      <span className="text-cream/40">&mdash;</span>
                    )
                  })()}
                </td>

                {/* Cost */}
                <td className="px-3 py-2 text-right">
                  {hasCost ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="text-cream/60">{formatThb(cost)}</span>
                      {dish.cost_source === 'catalog_estimate' && (
                        <span
                          title="Cost estimated from the Makro catalog — no real purchase yet"
                          className="rounded-sm bg-amber-watch/15 px-1 py-0.5 text-[9px] font-medium leading-none text-amber-watch"
                        >
                          ~est
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-cream/60">
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
                    <span className="text-cream/40">&mdash;</span>
                  )}
                </td>

                {/* Margin */}
                <td className="px-3 py-2 text-right">
                  {hasCost && price > 0 ? (
                    <span className={margin > 0 ? 'text-forest-soft' : 'text-brick-soft'}>
                      {formatThb(margin)}
                    </span>
                  ) : (
                    <span className="text-cream/40">&mdash;</span>
                  )}
                </td>

                {/* Grab Price */}
                <td className="px-3 py-2 text-right">
                  {(() => {
                    const gm = grabMargins?.get(dish.id)
                    if (!gm?.channel_price) return <span className="text-cream/30">&mdash;</span>
                    return <span className="font-mono text-[10px] tabular-nums text-cream/70">{formatThb(gm.channel_price)}</span>
                  })()}
                </td>

                {/* Grab Margin % (food cost on net revenue) */}
                <td className="px-3 py-2 text-right">
                  {(() => {
                    const gm = grabMargins?.get(dish.id)
                    if (!gm?.channel_food_cost_pct) return <span className="text-cream/30">&mdash;</span>
                    return (
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${foodCostColor(gm.channel_food_cost_pct)}`}>
                        {gm.channel_food_cost_pct.toFixed(1)}%
                      </span>
                    )
                  })()}
                </td>

                {/* Available toggle + stock state */}
                <td className="px-3 py-2 text-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <button
                      onClick={() => toggleField(dish, 'is_available')}
                      title={dish.is_available ? 'Shown on menu' : 'Hidden from menu'}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                        dish.is_available ? 'bg-royal-green' : 'bg-surface-3'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                          dish.is_available ? 'translate-x-4' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <select
                      value={dish.stock_state}
                      onChange={(e) => {
                        const next = e.target.value as MenuDish['stock_state']
                        if (next !== dish.stock_state) {
                          void commitPatch(dish.id, { stock_state: next })
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className={`cursor-pointer appearance-none rounded-full px-2 py-0.5 text-center text-[10px] font-semibold ring-1 ring-inset focus:outline-none focus:ring-2 ${STOCK_STYLE[dish.stock_state] ?? STOCK_STYLE.in_stock}`}
                      style={{ fontFamily: 'var(--font-display-sc)' }}
                      title="Stock state — coming soon / out of stock show greyed on the menu and block ordering"
                    >
                      {STOCK_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>{s.short}</option>
                      ))}
                    </select>
                  </div>
                </td>

                {/* Featured toggle */}
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => toggleField(dish, 'is_featured')}
                    className={`transition ${
                      dish.is_featured ? 'text-amber-watch hover:text-amber-watch' : 'text-cream/40 hover:text-cream/60'
                    }`}
                  >
                    {dish.is_featured ? <Star className="h-4 w-4" /> : <StarOff className="h-4 w-4" />}
                  </button>
                </td>

                {/* Launch phase */}
                <td className="px-3 py-2 text-center">
                  <select
                    value={dish.launch_phase}
                    onChange={(e) => {
                      const next = Number(e.target.value)
                      if (next !== dish.launch_phase) {
                        void commitPatch(dish.id, { launch_phase: next })
                      }
                    }}
                    className={`cursor-pointer appearance-none rounded-full px-2 py-0.5 text-center text-[10px] font-semibold ring-1 ring-inset focus:outline-none focus:ring-2 ${PHASE_STYLE[dish.launch_phase] ?? PHASE_DEFAULT_STYLE}`}
                    style={{ fontFamily: 'var(--font-display-sc)' }}
                    title={`Launch phase ${dish.launch_phase}`}
                  >
                    {PHASE_OPTIONS.map((p) => (
                      <option key={p} value={p}>P{p}</option>
                    ))}
                  </select>
                </td>

                {/* Card version */}
                <td className="px-3 py-2 text-center">
                  <span className="font-mono text-[10px] tabular-nums text-cream/50">
                    v{dish.card_version}
                  </span>
                </td>

                {/* Last verified */}
                <td className="px-3 py-2 text-center">
                  {dish.last_verified_at ? (
                    <span className="text-[10px] text-cream/50" title={dish.last_verified_at}>
                      {new Date(dish.last_verified_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </span>
                  ) : (
                    <span className="text-cream/30">&mdash;</span>
                  )}
                </td>

                {/* Loyverse status + POS price drift */}
                <td className="px-3 py-2 text-center">
                  <div className="flex flex-col items-center gap-0.5">
                    <LoyverseBadge status={dish.pos_status} itemId={dish.loyverse_item_id} />
                    {(() => {
                      const posPrice = loyversePriceDrift(dish)
                      if (posPrice == null) return null
                      return (
                        <span
                          className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-brick-soft ring-1 ring-inset ring-[var(--color-brick-soft)]/40 bg-[var(--color-royal-red)]/15"
                          title={`Loyverse has ${formatThb(posPrice)} but DB price is ${formatThb(dish.price)} — click Push to update the POS`}
                        >
                          POS {formatThb(posPrice)} ≠ {formatThb(dish.price)}
                        </span>
                      )
                    })()}
                  </div>
                </td>

                {/* Last Loyverse sync */}
                <td className="px-3 py-2 text-center">
                  {(() => {
                    const synced = formatSyncedAt(dish.loyverse_synced_at)
                    return synced ? (
                      <span className="text-[10px] tabular-nums text-cream/50" title={dish.loyverse_synced_at ?? undefined}>
                        {synced}
                      </span>
                    ) : (
                      <span className="text-cream/30">&mdash;</span>
                    )
                  })()}
                </td>

                {/* DB updated_at — drift control vs last Loyverse sync */}
                <td className="px-3 py-2 text-center">
                  {(() => {
                    const upd = formatSyncedAt(dish.updated_at)
                    if (!upd) return <span className="text-cream/30">&mdash;</span>
                    const stale = isLoyverseStale(dish)
                    return (
                      <span
                        className={`text-[10px] tabular-nums ${stale ? 'font-semibold text-amber-watch' : 'text-cream/50'}`}
                        title={
                          stale
                            ? `Edited after last Loyverse sync — re-push needed (${dish.updated_at})`
                            : (dish.updated_at ?? undefined)
                        }
                      >
                        {stale && '⚠ '}
                        {upd}
                      </span>
                    )
                  })()}
                </td>

                {/* Push to Loyverse — SALE only, gated by approved/synced + available */}
                <td className="px-3 py-2 text-center">
                  {dish.kind === 'SALE' ? (
                    (() => {
                      const isPushing = pushingId === dish.id
                      const blocked =
                        dish.pos_status === 'draft' ||
                        !dish.is_available ||
                        dish.stock_state !== 'in_stock'
                      const msg = pushMsg?.id === dish.id ? pushMsg : null
                      const title = blocked
                        ? dish.pos_status === 'draft'
                          ? 'Set POS status to Approved before pushing'
                          : !dish.is_available
                            ? 'Dish must be available to push'
                            : 'Not in stock (coming soon / out of stock) — cannot push to POS'
                        : isLoyverseStale(dish)
                          ? 'Re-push: dish edited after last sync'
                          : 'Push to Loyverse'
                      return (
                        <span className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handlePush(dish.id)}
                            disabled={isPushing || blocked}
                            title={title}
                            className={`inline-flex items-center justify-center rounded p-1 transition disabled:cursor-not-allowed disabled:opacity-30 ${
                              isLoyverseStale(dish)
                                ? 'text-amber-watch hover:bg-amber-watch/15'
                                : 'text-forest-soft hover:bg-[var(--color-royal-green)]/20'
                            }`}
                          >
                            {isPushing ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Upload className="h-3.5 w-3.5" />
                            )}
                          </button>
                          {msg && (
                            <span title={msg.text}>
                              {msg.type === 'ok' ? (
                                <CheckCircle2 className="h-3 w-3 text-forest-soft" />
                              ) : (
                                <AlertCircle className="h-3 w-3 text-brick-soft" />
                              )}
                            </span>
                          )}
                        </span>
                      )
                    })()
                  ) : (
                    <span className="text-cream/30">&mdash;</span>
                  )}
                </td>

                {/* Site — website visibility (mig 263), SALE-only. Toggles is_web_visible. */}
                <td className="px-3 py-2 text-center">
                  {dish.kind === 'SALE' ? (
                    (() => {
                      const live = dish.is_web_visible
                      const since = formatSyncedAt(dish.web_published_at)
                      const stale = isLoyverseStale(dish)
                      const state = siteBadgeState(dish)
                      const cls =
                        state === 'warn'
                          ? SITE_STATUS_STYLE.warn
                          : state === 'live'
                            ? SITE_STATUS_STYLE.live
                            : SITE_STATUS_STYLE.hidden
                      const title = live
                        ? `On site${since ? ` since ${since}` : ''}` +
                          (!dish.is_available ? ' · not orderable (is_available off)' : '') +
                          (stale ? ' · Loyverse price stale, re-push' : '') +
                          ' — click to hide'
                        : 'Hidden from the website — click to show'
                      return (
                        <button
                          type="button"
                          onClick={() => toggleWeb(dish)}
                          title={title}
                          aria-label={`${live ? 'Hide from' : 'Show on'} website: ${dish.name}`}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset transition hover:brightness-110 ${cls}`}
                          style={{ fontFamily: 'var(--font-display-sc)' }}
                        >
                          {live ? <Globe className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                          {live ? 'Live' : 'Hidden'}
                        </button>
                      )
                    })()
                  ) : (
                    <span className="text-cream/30">&mdash;</span>
                  )}
                </td>

                {/* Completeness */}
                <td className="px-3 py-2 text-center">
                  <CompletenessIndicator item={dish} />
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
                <tr className="bg-surface-1/60">
                  <td colSpan={26} className="p-0">
                    <DishExpandedCard dish={dish} />
                    {onOpenDrawer && (
                      <div className="flex justify-end border-t border-surface-3/50 bg-surface-1/40 px-4 py-2">
                        <button
                          type="button"
                          onClick={() => onOpenDrawer(dish.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-surface-3/50 bg-transparent px-3 py-1.5 text-[11px] font-medium text-[color:var(--color-cream)]/70 transition hover:border-[var(--color-forest-soft)]/50 hover:bg-[var(--color-royal-green)]/10 hover:text-[color:var(--color-forest-soft)]"
                          title="Open detail drawer (or press o)"
                        >
                          <PanelRightOpen className="h-3.5 w-3.5" />
                          Open detail
                          <span className="opacity-60">→</span>
                        </button>
                      </div>
                    )}
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
        const kind = c.childKind
        const unit = c.childBaseUnit ?? ''
        const costContribution =
          c.childCostPerUnit != null
            ? c.quantityPerUnit *
              c.childCostPerUnit *
              (1 + (c.yieldLossPct ?? 0) / 100)
            : null
        return (
          <tr
            key={`${parentId}-child-${c.id}`}
            className="bg-surface-1/40 text-[color:var(--color-cream)]/60"
            data-bom-child-of={parentId}
          >
            <td className="px-2 py-1.5" />
            <td className="px-2 py-1.5" />
            <td className="px-3 py-1.5">
              <span className="flex items-center gap-2">
                <span
                  className="font-mono text-[10px] text-cream/40"
                  aria-hidden
                  title={`Child of ${parentName}`}
                >
                  {prefix}
                </span>
                <span
                  className="italic"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {c.childName ?? <span className="text-brick-soft">missing</span>}
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
            <td className="px-3 py-1.5 text-cream/40" colSpan={2}>
              <span className="font-mono text-[10px] tabular-nums">
                {c.quantityPerUnit.toFixed(2)}
                {unit ? ` ${unit}` : ''}
                {c.yieldLossPct != null && c.yieldLossPct > 0 && (
                  <span className="ml-2 text-brick-soft/60">
                    +{c.yieldLossPct}% loss
                  </span>
                )}
              </span>
            </td>
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5 text-right">
              {costContribution != null && (
                <span className="font-mono text-[10px] tabular-nums text-cream/50">
                  {'\u0E3F'}
                  {costContribution.toFixed(1)}
                </span>
              )}
            </td>
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5" />
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
