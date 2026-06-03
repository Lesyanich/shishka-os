import { useMemo, useState } from 'react'
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

/** Build a clean, print-ready cheat-sheet document (light theme, A4). */
function buildCheatSheetHtml(
  items: MenuItem[],
  componentsByDish: Map<string, AssemblyComponent[]>,
  recipeStepsByDish: Map<string, MenuRecipeStep[]>,
  modifierOptionsByDish: Map<string, DishModifierOption[]>,
): string {
  const title = items[0]?.category_name
    ? `${items[0].category_name} — Cheat-Sheet`
    : 'Menu Cheat-Sheet'

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
                  `<li><span class="num">${s.step_order}</span><span><b>${escapeHtml(
                    s.operation_name,
                  )}</b>${
                    s.instruction_text ? ' — ' + escapeHtml(s.instruction_text) : ''
                  }</span></li>`,
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
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; margin: 16px; color: #111; }
    h1 { font-size: 18px; margin: 0 0 12px; }
    .card { border: 1px solid #ccc; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; page-break-inside: avoid; }
    .card header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #eee; padding-bottom: 6px; margin-bottom: 8px; }
    .card h2 { font-size: 15px; margin: 0; }
    .price { font-weight: 700; font-size: 14px; }
    .note { font-size: 11px; color: #555; margin: 0 0 8px; }
    .cols { display: grid; grid-template-columns: 1fr 1.5fr; gap: 18px; }
    .custom { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; }
    h3 { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #666; margin: 0 0 5px; }
    ul, ol { margin: 0; padding: 0; list-style: none; font-size: 12px; }
    ul.ing li, ul.opts li { display: flex; justify-content: space-between; gap: 8px; padding: 1.5px 0; }
    ul.ing b, ul.opts b { font-variant-numeric: tabular-nums; color: #333; font-weight: 600; }
    ol.proc li { display: flex; gap: 6px; padding: 2px 0; line-height: 1.35; }
    ol.proc .num { flex: 0 0 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; background: #eee; border-radius: 50%; font-size: 10px; font-weight: 700; }
    .muted { color: #999; font-style: italic; }
    @media print { body { margin: 8mm; } .card { break-inside: avoid; } }
  </style></head><body>
    <h1>${escapeHtml(title)}</h1>
    ${cards}
    <script>window.onload = () => window.print()</script>
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
}: L2AssemblerViewProps) {
  const saleItems = useMemo(() => {
    const filtered = items.filter(
      (i) =>
        i.kind === 'SALE' &&
        (!selectedCategory || i.category_id === selectedCategory),
    )
    // Build-your-own dishes (no fixed BOM, e.g. the Custom smoothie) sort last;
    // everything else keeps its original order.
    return filtered
      .map((item, idx) => ({ item, idx }))
      .sort((a, b) => {
        const aByo = (componentsByDish.get(a.item.id)?.length ?? 0) === 0 ? 1 : 0
        const bByo = (componentsByDish.get(b.item.id)?.length ?? 0) === 0 ? 1 : 0
        return aByo - bByo || a.idx - b.idx
      })
      .map((x) => x.item)
  }, [items, selectedCategory, componentsByDish])

  function handlePrint() {
    const html = buildCheatSheetHtml(
      saleItems,
      componentsByDish,
      recipeStepsByDish,
      modifierOptionsByDish,
    )
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
  }

  if (saleItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-cream/50">
        <Package className="h-10 w-10 text-cream/30" />
        <p className="text-sm">No SALE items in this category.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center gap-1.5 rounded-lg border border-surface-3 bg-surface-2 px-3 py-1.5 text-xs font-medium text-cream transition hover:border-forest-soft/40 hover:bg-surface-3"
          title="Print cheat-sheet for the assembler"
        >
          <Printer className="h-3.5 w-3.5" />
          Print cheat-sheet
        </button>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {saleItems.map((item) => (
          <SaleAssemblyCard
            key={item.id}
            item={item}
            card={dishCardById.get(item.id)}
            components={componentsByDish.get(item.id) ?? []}
            steps={recipeStepsByDish.get(item.id) ?? []}
            options={modifierOptionsByDish.get(item.id) ?? []}
            onOpen={() => onOpenDish(item.id)}
          />
        ))}
      </div>
    </div>
  )
}
