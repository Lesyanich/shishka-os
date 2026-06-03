import { useEffect, useMemo, useState } from 'react'
import {
  Package,
  Flame,
  ListChecks,
  ChefHat,
  Utensils,
  ChevronDown,
  ChevronRight,
  Printer,
  Sparkles,
  GripVertical,
  RectangleHorizontal,
  RectangleVertical,
  X,
} from 'lucide-react'
import type { MenuItem } from '../../../hooks/useMenuData'
import type { DishCardData, AssemblyComponent } from '../../../hooks/useDishCard'
import type {
  MenuRecipeStep,
  DishModifierOption,
} from '../../../hooks/useMenuListEnrichment'

interface L2AssemblerViewProps {
  items: MenuItem[]
  selectedCategory: string | null
  dishCardById: Map<string, DishCardData>
  componentsByDish: Map<string, AssemblyComponent[]>
  recipeStepsByDish: Map<string, MenuRecipeStep[]>
  modifierOptionsByDish: Map<string, DishModifierOption[]>
  onOpenDish: (id: string) => void
  /** Persist a reordered set of cards (writes display_order per id). */
  onReorder: (orderedIds: string[]) => Promise<{ ok: boolean; error?: string }>
}

interface SaleAssemblyCardProps {
  item: MenuItem
  card: DishCardData | undefined
  components: AssemblyComponent[]
  steps: MenuRecipeStep[]
  options: DishModifierOption[]
  onOpen: () => void
}

/** Format a per-portion qty for kitchen readability: kg→g, L→ml, else raw. */
function formatQty(qty: number, baseUnit: string | null): string {
  if (baseUnit === 'kg') return `${Math.round(qty * 1000)} g`
  if (baseUnit === 'L') return `${Math.round(qty * 1000)} ml`
  return `${qty}${baseUnit ? ` ${baseUnit}` : ''}`
}

/** Clean culinary label, falling back to the raw supplier name. */
function ingredientLabel(c: AssemblyComponent): string {
  const name = c.component_short_name ?? c.component_name
  return c.component_emoji ? `${c.component_emoji} ${name}` : name
}

/** Clean modifier label with emoji prefix. */
function modifierLabel(o: DishModifierOption): string {
  const name = o.modifier_short_name ?? o.modifier_name
  return o.modifier_emoji ? `${o.modifier_emoji} ${name}` : name
}

function priceDeltaLabel(d: number | null): string {
  if (d == null || d === 0) return ''
  return d > 0 ? `+฿${d}` : `−฿${Math.abs(d)}`
}

/** Group ordered options by group_name, preserving first-seen order. */
function groupOptions(
  options: DishModifierOption[],
): { group: string; items: DishModifierOption[] }[] {
  const order: string[] = []
  const map = new Map<string, DishModifierOption[]>()
  for (const o of options) {
    const g = o.group_name ?? 'Options'
    if (!map.has(g)) {
      map.set(g, [])
      order.push(g)
    }
    map.get(g)!.push(o)
  }
  return order.map((g) => ({ group: g, items: map.get(g)! }))
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Build a print-ready cheat-sheet that fits every dish on a SINGLE A4 page.
 *
 * Two mechanisms guarantee single-page output:
 *  1. A dense card grid (column count scales with item count) instead of a
 *     full-width vertical stack, with Ingredients|Process side-by-side inside
 *     each card so a card's height is its tallest column, not the sum.
 *  2. An on-load fit-to-page loop (see the inline <script>) that measures real
 *     px-per-mm and shrinks the root font-size until the sheet content is no
 *     taller than one A4 page — then prints.
 */
function buildCheatSheetHtml(
  items: MenuItem[],
  componentsByDish: Map<string, AssemblyComponent[]>,
  recipeStepsByDish: Map<string, MenuRecipeStep[]>,
  modifierOptionsByDish: Map<string, DishModifierOption[]>,
  orientation: 'landscape' | 'portrait',
): string {
  const title = items[0]?.category_name
    ? `${items[0].category_name} — Cheat-Sheet`
    : 'Menu Cheat-Sheet'

  // Page geometry follows the chosen orientation; column count adapts to the
  // available width and item count. The fit loop covers any residual overflow.
  const landscape = orientation === 'landscape'
  const pageWidthMm = landscape ? 297 : 210
  const pageHeightMm = landscape ? 210 : 297
  // Prefer 3 wide columns (bigger, more readable cards); only go to 4 when
  // there are too many cards to fit 3-up on one page.
  const cols = landscape
    ? items.length <= 12
      ? 3
      : 4
    : items.length <= 2
      ? 2
      : items.length <= 15
        ? 3
        : 4

  const cards = items
    .map((item) => {
      const comps = componentsByDish.get(item.id) ?? []
      const steps = recipeStepsByDish.get(item.id) ?? []
      const options = modifierOptionsByDish.get(item.id) ?? []
      const price = item.price != null ? `฿${Math.round(Number(item.price))}` : ''
      const note = item.assembler_note
        ? `<p class="note">${escapeHtml(item.assembler_note)}</p>`
        : ''
      const isBuildYourOwn = comps.length === 0 && options.length > 0

      let body: string
      if (isBuildYourOwn) {
        body = `<div class="custom">${groupOptions(options)
          .map(
            (g) =>
              `<section class="optgroup"><h3>${escapeHtml(
                g.group,
              )}</h3><ul class="opts">${g.items
                .map(
                  (o) =>
                    `<li><span>${escapeHtml(modifierLabel(o))}</span><b>${escapeHtml(
                      priceDeltaLabel(o.price_delta),
                    )}</b></li>`,
                )
                .join('')}</ul></section>`,
          )
          .join('')}</div>`
      } else {
        const ing = comps.length
          ? comps
              .map(
                (c) =>
                  `<li><span>${escapeHtml(ingredientLabel(c))}</span><b>${escapeHtml(
                    formatQty(c.qty_per_portion, c.base_unit),
                  )}</b></li>`,
              )
              .join('')
          : '<li class="muted">No ingredients defined</li>'
        const proc = steps.length
          ? steps
              .map(
                (s) =>
                  `<li><span class="num">${s.step_order}</span><span>${escapeHtml(
                    s.instruction_text ?? s.operation_name,
                  )}</span></li>`,
              )
              .join('')
          : '<li class="muted">Process pending</li>'
        body = `<div class="cols">
          <section><h3>Ingredients</h3><ul class="ing">${ing}</ul></section>
          <section><h3>Process</h3><ol class="proc">${proc}</ol></section>
        </div>`
      }

      return `<article class="card">
        <header><h2>${escapeHtml(item.name)}</h2><span class="price">${price}</span></header>
        ${note}
        ${body}
      </article>`
    })
    .join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title,
  )}</title><style>
    @page { size: A4 ${orientation}; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #1a160f; background: #fff;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    /* font-size on .page is the single knob the fit-to-page loop turns. */
    .page { font-size: 10px; width: ${pageWidthMm}mm; padding: 8mm 8mm 7mm; }
    .head {
      display: flex; justify-content: space-between; align-items: flex-end;
      border-bottom: 2px solid #1a160f; padding-bottom: .45em; margin-bottom: .75em;
    }
    .head h1 { margin: 0; font-size: 1.7em; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .head .sub { font-size: .92em; color: #9a8d7b; font-variant-numeric: tabular-nums; letter-spacing: .03em; }
    .grid { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: .7em; align-items: start; }
    .card {
      border: 1px solid #e3dac9; border-radius: 7px; padding: .6em .7em;
      background: #fdfbf6; break-inside: avoid; page-break-inside: avoid;
      display: flex; flex-direction: column; gap: .45em;
    }
    .card > header {
      display: flex; justify-content: space-between; align-items: baseline; gap: .4em;
      border-bottom: 1px solid #efe7d6; padding-bottom: .32em;
    }
    .card h2 { margin: 0; font-size: 1.12em; font-weight: 650; line-height: 1.12; }
    .price { font-weight: 700; font-size: 1em; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .note { margin: 0; font-size: .84em; color: #8a7e6d; line-height: 1.3; }
    h3 { margin: 0 0 .3em; font-size: .7em; font-weight: 700; text-transform: uppercase; letter-spacing: .09em; color: #b06a2c; }
    .cols { display: grid; grid-template-columns: 1fr 1.15fr; gap: .7em; }
    ul, ol { margin: 0; padding: 0; list-style: none; font-size: .92em; }
    ul.ing li, ul.opts li { display: flex; justify-content: space-between; gap: .4em; padding: .07em 0; line-height: 1.25; }
    ul.ing b, ul.opts b { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
    ul.ing b { color: #5a5246; }
    ul.opts b { color: #3f7a3f; }
    ol.proc li { display: flex; gap: .4em; padding: .08em 0; line-height: 1.25; }
    ol.proc .num {
      flex: 0 0 1.35em; height: 1.35em; display: inline-flex; align-items: center; justify-content: center;
      background: #1a160f; color: #fff; border-radius: 50%; font-size: .78em; font-weight: 700;
    }
    .custom { display: grid; grid-template-columns: repeat(auto-fit, minmax(7.5em, 1fr)); gap: .55em; }
    .muted { color: #b3a896; font-style: italic; }
  </style></head><body>
    <div class="page">
      <div class="head">
        <h1>${escapeHtml(title)}</h1>
        <span class="sub">${items.length} items · A4</span>
      </div>
      <div class="grid">${cards}</div>
    </div>
    <script>
      window.onload = function () {
        var page = document.querySelector('.page');
        // Measure real px-per-mm (varies by zoom / DPI) with a throwaway ruler.
        var ruler = document.createElement('div');
        ruler.style.cssText = 'position:absolute;left:-9999px;top:0;width:100mm;height:0';
        document.body.appendChild(ruler);
        var pxPerMm = ruler.getBoundingClientRect().width / 100;
        ruler.parentNode.removeChild(ruler);
        var maxH = ${pageHeightMm} * pxPerMm; // one A4 page, top to bottom
        // Grow the single font-size knob to FILL the page (bigger, readable
        // text), then back off so it never spills onto a second page.
        var size = 11;
        var MAX = 26;
        page.style.fontSize = size + 'px';
        while (size < MAX) {
          page.style.fontSize = size + 0.5 + 'px';
          if (page.scrollHeight > maxH) {
            page.style.fontSize = size + 'px';
            break;
          }
          size += 0.5;
        }
        // Safety shrink in case even the base size overflows (very dense sets).
        while (page.scrollHeight > maxH && size > 6) {
          size -= 0.5;
          page.style.fontSize = size + 'px';
        }
        window.print();
      };
    </script>
  </body></html>`
}

/** Customisation menu — grouped option chips with price deltas. */
function CustomiseSection({
  options,
  title,
}: {
  options: DishModifierOption[]
  title: string
}) {
  return (
    <section className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-cream/40">
        <Sparkles className="h-3 w-3" />
        {title}
      </h4>
      {groupOptions(options).map(({ group, items }) => (
        <div key={group} className="space-y-1">
          <p className="text-[9px] uppercase tracking-wider text-cream/35">
            {group}
          </p>
          <div className="flex flex-wrap gap-1">
            {items.map((o, i) => {
              const delta = priceDeltaLabel(o.price_delta)
              return (
                <span
                  key={`${o.modifier_name}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] text-cream/70"
                >
                  {modifierLabel(o)}
                  {delta && (
                    <span className="font-medium text-forest-soft/90">{delta}</span>
                  )}
                </span>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}

function SaleAssemblyCard({
  item,
  card,
  components,
  steps,
  options,
  onOpen,
}: SaleAssemblyCardProps) {
  // Compact card: composition + a short process show by default;
  // add-ons + meta live in a collapsed "Details".
  const [showDetails, setShowDetails] = useState(false)

  const program = item.merrychef_program as
    | { temp_c?: number; time_sec?: number; preset?: string }
    | null
  const merrychefSummary =
    program?.temp_c != null && program?.time_sec != null
      ? `${program.temp_c}°C / ${program.time_sec}s${program.preset ? ` (${program.preset})` : ''}`
      : null
  const foodCostPct =
    item.price && item.cost_per_unit
      ? Math.round((Number(item.cost_per_unit) / Number(item.price)) * 100)
      : null
  // Build-your-own: no fixed BOM, value is the customisation menu.
  const isBuildYourOwn = components.length === 0 && options.length > 0
  const hasAddons = !isBuildYourOwn && options.length > 0
  const hasMeta =
    !!card?.container_l2 ||
    !!merrychefSummary ||
    card?.customer_eta_min != null ||
    !!card?.has_cutlery ||
    !!card?.has_lid_sticker ||
    !!card?.pre_merrychef_prep ||
    !!card?.post_merrychef_check ||
    foodCostPct != null
  const hasDetails = hasAddons || hasMeta

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-surface-3 bg-surface-2 p-3 transition hover:border-forest-soft/40">
      {/* Header — click opens the full drawer */}
      <button
        type="button"
        onClick={onOpen}
        className="group flex items-center justify-between gap-2 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-forest-soft)]/60"
      >
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-cream group-hover:text-forest-soft">
          {item.name}
        </h3>
        {item.price != null && (
          <span className="shrink-0 text-xs font-semibold text-cream/80">
            ฿{Math.round(Number(item.price))}
            {isBuildYourOwn && (
              <span className="font-normal text-cream/40"> base</span>
            )}
          </span>
        )}
      </button>

      {/* Note — only when present (e.g. build-your-own explainer) */}
      {item.assembler_note && (
        <p className="line-clamp-2 text-[11px] text-cream/55">
          {item.assembler_note}
        </p>
      )}

      {/* Primary composition — always visible */}
      {isBuildYourOwn ? (
        <CustomiseSection options={options} title="Customise" />
      ) : components.length === 0 ? (
        <p className="text-[11px] italic text-cream/35">No ingredients defined</p>
      ) : (
        <ul className="space-y-0.5">
          {components.map((c) => (
            <li
              key={c.component_id}
              className="flex items-center justify-between gap-2 text-[11px] text-cream/70"
            >
              <span className="min-w-0 truncate">{ingredientLabel(c)}</span>
              <span className="shrink-0 font-mono text-[10px] text-cream/45">
                {formatQty(c.qty_per_portion, c.base_unit)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Process — short instructions, always visible for fixed dishes */}
      {!isBuildYourOwn && steps.length > 0 && (
        <ol className="space-y-0.5 border-t border-surface-3 pt-1.5">
          {steps.map((s) => (
            <li
              key={s.step_order}
              className="flex gap-1.5 text-[11px] leading-snug text-cream/65"
            >
              <span className="font-mono text-[10px] text-cream/40">
                {s.step_order}.
              </span>
              <span className="min-w-0">
                {s.instruction_text ?? s.operation_name}
              </span>
            </li>
          ))}
        </ol>
      )}

      {/* Details — collapsed by default */}
      {hasDetails && (
        <div className="border-t border-surface-3 pt-1.5">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="flex w-full items-center gap-1 text-[10px] uppercase tracking-widest text-cream/45 transition hover:text-cream/75"
            aria-expanded={showDetails}
          >
            {showDetails ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Details
          </button>

          {showDetails && (
            <div className="mt-2 space-y-2.5">
              {/* Add-ons */}
              {hasAddons && <CustomiseSection options={options} title="Add-ons" />}

              {/* Meta */}
              {hasMeta && (
                <dl className="grid grid-cols-2 gap-1.5 text-[10px]">
                  {card?.container_l2 && (
                    <div className="col-span-2 flex items-center gap-1.5 text-cream/55">
                      <Package className="h-3 w-3 text-cream/40" />
                      <span className="truncate">{card.container_l2}</span>
                    </div>
                  )}
                  {merrychefSummary && (
                    <div className="flex items-center gap-1.5 text-cream/55">
                      <Flame className="h-3 w-3 text-amber-400" />
                      <span className="truncate">{merrychefSummary}</span>
                    </div>
                  )}
                  {card?.customer_eta_min != null && (
                    <div className="flex items-center gap-1.5 text-cream/55">
                      <ChefHat className="h-3 w-3 text-cream/40" />
                      <span>~{card.customer_eta_min} min</span>
                    </div>
                  )}
                  {foodCostPct != null && (
                    <div className="flex items-center gap-1.5 text-cream/55">
                      <ListChecks className="h-3 w-3 text-cream/40" />
                      <span>food cost {foodCostPct}%</span>
                    </div>
                  )}
                  {(card?.has_cutlery || card?.has_lid_sticker) && (
                    <div className="col-span-2 flex items-center gap-2 text-[10px] text-cream/50">
                      {card.has_cutlery && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-1.5 py-0.5">
                          <Utensils className="h-2.5 w-2.5" />
                          cutlery
                        </span>
                      )}
                      {card.has_lid_sticker && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-1.5 py-0.5">
                          lid sticker
                        </span>
                      )}
                    </div>
                  )}
                  {(card?.pre_merrychef_prep || card?.post_merrychef_check) && (
                    <div className="col-span-2 space-y-0.5 text-[10px] text-cream/50">
                      {card?.pre_merrychef_prep && (
                        <div>
                          <span className="text-cream/35">Pre:</span>{' '}
                          {card.pre_merrychef_prep}
                        </div>
                      )}
                      {card?.post_merrychef_check && (
                        <div>
                          <span className="text-cream/35">Post:</span>{' '}
                          {card.post_merrychef_check}
                        </div>
                      )}
                    </div>
                  )}
                </dl>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function L2AssemblerView({
  items,
  selectedCategory,
  dishCardById,
  componentsByDish,
  recipeStepsByDish,
  modifierOptionsByDish,
  onOpenDish,
  onReorder,
}: L2AssemblerViewProps) {
  // Seed order: persisted display_order first, then build-your-own dishes (no
  // fixed BOM, e.g. the Custom smoothie) last, with original order as tiebreak.
  const seed = useMemo(() => {
    const filtered = items.filter(
      (i) =>
        i.kind === 'SALE' &&
        (!selectedCategory || i.category_id === selectedCategory),
    )
    return filtered
      .map((item, idx) => ({ item, idx }))
      .sort((a, b) => {
        const ao = a.item.display_order ?? 0
        const bo = b.item.display_order ?? 0
        if (ao !== bo) return ao - bo
        const aByo = (componentsByDish.get(a.item.id)?.length ?? 0) === 0 ? 1 : 0
        const bByo = (componentsByDish.get(b.item.id)?.length ?? 0) === 0 ? 1 : 0
        return aByo - bByo || a.idx - b.idx
      })
      .map((x) => x.item)
  }, [items, selectedCategory, componentsByDish])

  // Local order drives instant drag feedback; it re-syncs whenever the seed
  // (item set or persisted order) changes — e.g. category switch or saved drop.
  const seedIds = useMemo(() => seed.map((i) => i.id).join(','), [seed])
  const [orderIds, setOrderIds] = useState<string[]>(() => seed.map((i) => i.id))
  useEffect(() => {
    setOrderIds(seedIds ? seedIds.split(',') : [])
  }, [seedIds])

  const byId = useMemo(() => new Map(seed.map((i) => [i.id, i])), [seed])
  // Tolerate drift: append any seed ids not yet tracked (new/removed items).
  const ordered = useMemo(() => {
    const tracked = orderIds.filter((id) => byId.has(id))
    const trackedSet = new Set(tracked)
    const missing = seed.filter((i) => !trackedSet.has(i.id)).map((i) => i.id)
    return [...tracked, ...missing].map((id) => byId.get(id)!)
  }, [orderIds, byId, seed])

  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  // Print dialog: the owner picks orientation and prints the live on-screen
  // order. Default to landscape (wider, fills the sheet) for a typical set.
  const [printOpen, setPrintOpen] = useState(false)
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>(
    'landscape',
  )

  function handleDrop(targetId: string) {
    const source = dragId
    setDragId(null)
    setOverId(null)
    if (!source || source === targetId) return
    const current = ordered.map((i) => i.id)
    const from = current.indexOf(source)
    const to = current.indexOf(targetId)
    if (from === -1 || to === -1) return
    const next = [...current]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setOrderIds(next) // optimistic
    void onReorder(next) // persist display_order; refetch re-syncs the seed
  }

  function handlePrint() {
    // Always print the live on-screen order (`ordered`), in the chosen layout.
    const html = buildCheatSheetHtml(
      ordered,
      componentsByDish,
      recipeStepsByDish,
      modifierOptionsByDish,
      orientation,
    )
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    setPrintOpen(false)
  }

  if (ordered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-cream/50">
        <Package className="h-10 w-10 text-cream/30" />
        <p className="text-sm">No SALE items in this category.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="hidden items-center gap-1.5 text-[11px] text-cream/40 sm:flex">
          <GripVertical className="h-3.5 w-3.5" />
          Drag cards to reorder · saved automatically
        </p>
        <button
          type="button"
          onClick={() => setPrintOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-surface-3 bg-surface-2 px-3 py-1.5 text-xs font-medium text-cream transition hover:border-forest-soft/40 hover:bg-surface-3"
          title="Print cheat-sheet for the assembler"
        >
          <Printer className="h-3.5 w-3.5" />
          Print cheat-sheet
        </button>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {ordered.map((item) => {
          const isDragging = dragId === item.id
          const isOver =
            overId === item.id && dragId !== null && dragId !== item.id
          return (
            <div
              key={item.id}
              draggable
              onDragStart={(e) => {
                setDragId(item.id)
                e.dataTransfer.effectAllowed = 'move'
                // Firefox requires data to be set for a drag to start.
                e.dataTransfer.setData('text/plain', item.id)
              }}
              onDragEnd={() => {
                setDragId(null)
                setOverId(null)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (overId !== item.id) setOverId(item.id)
              }}
              onDrop={(e) => {
                e.preventDefault()
                handleDrop(item.id)
              }}
              className={`cursor-grab rounded-xl transition active:cursor-grabbing ${
                isDragging ? 'opacity-40' : ''
              } ${isOver ? 'ring-2 ring-forest-soft/70' : ''}`}
            >
              <SaleAssemblyCard
                item={item}
                card={dishCardById.get(item.id)}
                components={componentsByDish.get(item.id) ?? []}
                steps={recipeStepsByDish.get(item.id) ?? []}
                options={modifierOptionsByDish.get(item.id) ?? []}
                onOpen={() => onOpenDish(item.id)}
              />
            </div>
          )
        })}
      </div>

      {printOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPrintOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-surface-3 bg-surface-1 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-surface-3 px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-cream">
                <Printer className="h-4 w-4" />
                Print cheat-sheet
              </h3>
              <button
                type="button"
                onClick={() => setPrintOpen(false)}
                className="rounded-md p-1 text-cream/50 transition hover:bg-surface-3 hover:text-cream"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto px-4 py-4">
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-cream/45">
                  Orientation
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        value: 'landscape' as const,
                        label: 'Horizontal',
                        Icon: RectangleHorizontal,
                      },
                      {
                        value: 'portrait' as const,
                        label: 'Vertical',
                        Icon: RectangleVertical,
                      },
                    ]
                  ).map(({ value, label, Icon }) => {
                    const active = orientation === value
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setOrientation(value)}
                        aria-pressed={active}
                        className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition ${
                          active
                            ? 'border-forest-soft/70 bg-forest-soft/10 text-cream'
                            : 'border-surface-3 bg-surface-2 text-cream/60 hover:border-forest-soft/40 hover:text-cream'
                        }`}
                      >
                        <Icon className="h-6 w-6" />
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-cream/45">
                  {ordered.length} cards · in your order
                </p>
                <ol className="space-y-1 rounded-xl border border-surface-3 bg-surface-2 p-2">
                  {ordered.map((item, i) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 text-xs text-cream/75"
                    >
                      <span className="w-5 shrink-0 text-right font-mono text-[10px] text-cream/40">
                        {i + 1}
                      </span>
                      <span className="min-w-0 truncate">{item.name}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-surface-3 px-4 py-3">
              <button
                type="button"
                onClick={() => setPrintOpen(false)}
                className="rounded-lg border border-surface-3 bg-surface-2 px-3 py-1.5 text-xs font-medium text-cream/70 transition hover:bg-surface-3 hover:text-cream"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 rounded-lg bg-forest-soft px-3 py-1.5 text-xs font-semibold text-surface-1 transition hover:bg-forest-soft/90"
              >
                <Printer className="h-3.5 w-3.5" />
                Print
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
