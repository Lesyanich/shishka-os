import { useMemo, useState } from 'react'
import {
  Package,
  Flame,
  ListChecks,
  ChefHat,
  Utensils,
  ChevronDown,
  ChevronRight,
  Carrot,
  ClipboardList,
  Printer,
} from 'lucide-react'
import type { MenuItem } from '../../../hooks/useMenuData'
import type { DishCardData, AssemblyComponent } from '../../../hooks/useDishCard'
import type { MenuRecipeStep } from '../../../hooks/useMenuListEnrichment'

interface L2AssemblerViewProps {
  items: MenuItem[]
  selectedCategory: string | null
  dishCardById: Map<string, DishCardData>
  componentsByDish: Map<string, AssemblyComponent[]>
  recipeStepsByDish: Map<string, MenuRecipeStep[]>
  onOpenDish: (id: string) => void
}

interface SaleAssemblyCardProps {
  item: MenuItem
  card: DishCardData | undefined
  components: AssemblyComponent[]
  steps: MenuRecipeStep[]
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
  return c.component_short_name ?? c.component_name
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
): string {
  const title = items[0]?.category_name
    ? `${items[0].category_name} — Cheat-Sheet`
    : 'Menu Cheat-Sheet'

  const cards = items
    .map((item) => {
      const comps = componentsByDish.get(item.id) ?? []
      const steps = recipeStepsByDish.get(item.id) ?? []
      const price = item.price != null ? `฿${Math.round(Number(item.price))}` : ''
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
      return `<article class="card">
        <header><h2>${escapeHtml(item.name)}</h2><span class="price">${price}</span></header>
        <div class="cols">
          <section><h3>Ingredients</h3><ul class="ing">${ing}</ul></section>
          <section><h3>Process</h3><ol class="proc">${proc}</ol></section>
        </div>
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
    .cols { display: grid; grid-template-columns: 1fr 1.5fr; gap: 18px; }
    h3 { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #666; margin: 0 0 5px; }
    ul, ol { margin: 0; padding: 0; list-style: none; font-size: 12px; }
    ul.ing li { display: flex; justify-content: space-between; gap: 8px; padding: 1.5px 0; }
    ul.ing b { font-variant-numeric: tabular-nums; color: #333; font-weight: 600; }
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

function SaleAssemblyCard({
  item,
  card,
  components,
  steps,
  onOpen,
}: SaleAssemblyCardProps) {
  // Ingredients + process are shown expanded by default (CEO requirement).
  const [expanded, setExpanded] = useState(true)

  const program = item.merrychef_program as
    | { temp_c?: number; time_sec?: number; preset?: string }
    | null
  const merrychefSummary =
    program?.temp_c != null && program?.time_sec != null
      ? `${program.temp_c}°C / ${program.time_sec}s${program.preset ? ` (${program.preset})` : ''}`
      : null
  const orderStepCount = card?.assembly_order?.length ?? 0
  const hasPhoto = !!card?.assembler_photo_url
  const foodCostPct =
    item.price && item.cost_per_unit
      ? Math.round((Number(item.cost_per_unit) / Number(item.price)) * 100)
      : null

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-surface-3 bg-surface-2 p-4 transition hover:border-forest-soft/40">
      {/* Header — click opens the full drawer */}
      <button
        type="button"
        onClick={onOpen}
        className="group flex items-start justify-between gap-2 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-forest-soft)]/60"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[var(--color-royal-green)]/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[color:var(--color-forest-soft)]">
              SALE
            </span>
            <h3 className="truncate text-sm font-medium text-cream group-hover:text-forest-soft">
              {item.name}
            </h3>
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-cream/40">
            {item.product_code}
          </p>
        </div>
        {hasPhoto && (
          <img
            src={card!.assembler_photo_url!}
            alt={`${item.name} assembly reference`}
            className="h-12 w-12 shrink-0 rounded-md object-cover"
            loading="lazy"
          />
        )}
      </button>

      {/* Price / food cost */}
      {item.price != null && (
        <div className="flex items-center gap-2 text-[11px] text-cream/60">
          <span className="font-semibold text-cream/80">
            ฿{Math.round(Number(item.price))}
          </span>
          {foodCostPct != null && (
            <span className="text-cream/45">· food cost {foodCostPct}%</span>
          )}
        </div>
      )}

      {item.assembler_note ? (
        <p className="line-clamp-2 text-xs text-cream/65">
          {item.assembler_note}
        </p>
      ) : (
        <p className="text-xs italic text-cream/35">No assembler note</p>
      )}

      <dl className="grid grid-cols-2 gap-2 text-[11px]">
        {card?.container_l2 && (
          <div className="col-span-2 flex items-center gap-1.5 text-cream/65">
            <Package className="h-3 w-3 text-cream/40" />
            <span className="truncate">{card.container_l2}</span>
          </div>
        )}
        {orderStepCount > 0 && (
          <div className="flex items-center gap-1.5 text-cream/65">
            <ListChecks className="h-3 w-3 text-cream/40" />
            <span>
              {orderStepCount} {orderStepCount === 1 ? 'step' : 'steps'}
            </span>
          </div>
        )}
        {merrychefSummary && (
          <div className="flex items-center gap-1.5 text-cream/65">
            <Flame className="h-3 w-3 text-amber-400" />
            <span className="truncate">{merrychefSummary}</span>
          </div>
        )}
        {card?.customer_eta_min != null && (
          <div className="flex items-center gap-1.5 text-cream/65">
            <ChefHat className="h-3 w-3 text-cream/40" />
            <span>~{card.customer_eta_min} min</span>
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
      </dl>

      {(card?.pre_merrychef_prep || card?.post_merrychef_check) && (
        <div className="space-y-1 border-t border-surface-3 pt-2 text-[10px] text-cream/55">
          {card?.pre_merrychef_prep && (
            <div>
              <span className="text-cream/40">Pre:</span> {card.pre_merrychef_prep}
            </div>
          )}
          {card?.post_merrychef_check && (
            <div>
              <span className="text-cream/40">Post:</span>{' '}
              {card.post_merrychef_check}
            </div>
          )}
        </div>
      )}

      {/* Ingredients + process — collapsible, open by default */}
      <div className="border-t border-surface-3 pt-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-1.5 text-[10px] uppercase tracking-widest text-cream/50 transition hover:text-cream/80"
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          Ingredients &amp; process
        </button>

        {expanded && (
          <div className="mt-2 space-y-3">
            {/* Ingredients */}
            <section className="space-y-1.5">
              <h4 className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-cream/40">
                <Carrot className="h-3 w-3" />
                Ingredients
              </h4>
              {components.length === 0 ? (
                <p className="text-[11px] italic text-cream/35">
                  No ingredients defined
                </p>
              ) : (
                <ul className="space-y-1">
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
            </section>

            {/* Process */}
            <section className="space-y-1.5">
              <h4 className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-cream/40">
                <ClipboardList className="h-3 w-3" />
                Process
              </h4>
              {steps.length === 0 ? (
                <p className="text-[11px] italic text-cream/35">
                  Process pending — chef to add
                </p>
              ) : (
                <ol className="space-y-1.5">
                  {steps.map((s) => (
                    <li
                      key={s.step_order}
                      className="flex gap-2 text-[11px] text-cream/70"
                    >
                      <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface-3 font-mono text-[9px] text-cream/60">
                        {s.step_order}
                      </span>
                      <span className="min-w-0">
                        <span className="font-medium text-cream/80">
                          {s.operation_name}
                        </span>
                        {s.instruction_text && (
                          <span className="text-cream/55">
                            {' — '}
                            {s.instruction_text}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

export function L2AssemblerView({
  items,
  selectedCategory,
  dishCardById,
  componentsByDish,
  recipeStepsByDish,
  onOpenDish,
}: L2AssemblerViewProps) {
  const saleItems = useMemo(
    () =>
      items.filter(
        (i) =>
          i.kind === 'SALE' &&
          (!selectedCategory || i.category_id === selectedCategory),
      ),
    [items, selectedCategory],
  )

  function handlePrint() {
    const html = buildCheatSheetHtml(saleItems, componentsByDish, recipeStepsByDish)
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {saleItems.map((item) => (
          <SaleAssemblyCard
            key={item.id}
            item={item}
            card={dishCardById.get(item.id)}
            components={componentsByDish.get(item.id) ?? []}
            steps={recipeStepsByDish.get(item.id) ?? []}
            onOpen={() => onOpenDish(item.id)}
          />
        ))}
      </div>
    </div>
  )
}
