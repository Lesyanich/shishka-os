import { useState } from 'react'
import { Camera, ChefHat, ChevronDown, ChevronRight, Flame, FileText, Soup } from 'lucide-react'
import type { MenuDish } from '../../../hooks/useMenuDishes'
import { useDishDetail } from '../../../hooks/useDishDetail'
import { useNomenclatureImages } from '../../../hooks/useNomenclatureImages'
import { BomTreeEditor } from './BomTreeEditor'
import { NutritionBadges } from './NutritionBadge'
import { ImageGallery } from '../../../components/gallery/ImageGallery'
import { ProcessTab } from '../../../components/bom/ProcessTab'

interface DishExpandedCardProps {
  dish: MenuDish
}

type Section = 'bom' | 'assembly' | 'production' | 'nutrition' | 'photos'

function formatThb(v: number | null): string {
  if (v == null) return '-'
  return `\u0E3F${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export function DishExpandedCard({ dish }: DishExpandedCardProps) {
  const detail = useDishDetail(dish.id)
  const gallery = useNomenclatureImages(dish.id)
  const [openSections, setOpenSections] = useState<Set<Section>>(
    new Set(['bom', 'assembly']),
  )
  const [expandedPfIds, setExpandedPfIds] = useState<Set<string>>(new Set())

  const toggle = (section: Section) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const togglePf = (pfId: string) => {
    setExpandedPfIds((prev) => {
      const next = new Set(prev)
      if (next.has(pfId)) next.delete(pfId)
      else next.add(pfId)
      return next
    })
  }

  const liveCost = detail.totalBomCost > 0 ? detail.totalBomCost : (dish.cost_per_unit ?? 0)
  const price = dish.price ?? 0
  const foodCostPct = liveCost > 0 && price > 0 ? (liveCost / price) * 100 : null
  const margin = liveCost > 0 && price > 0 ? price - liveCost : null

  return (
    <div className="border-t border-surface-3 bg-surface-1/60 p-5">
      {/* Hero strip */}
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-surface-3 bg-surface-1/50 px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-cream/50">Price</div>
          <div className="text-base font-bold text-cream tabular-nums">{formatThb(price)}</div>
        </div>
        <div className="h-8 w-px bg-surface-2" />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-cream/50">Cost (live BOM)</div>
          <div className="text-base font-bold text-cream tabular-nums">{formatThb(liveCost)}</div>
        </div>
        <div className="h-8 w-px bg-surface-2" />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-cream/50">Food cost</div>
          <div
            className={`text-base font-bold tabular-nums ${
              foodCostPct === null
                ? 'text-cream/50'
                : foodCostPct < 30
                  ? 'text-forest-soft'
                  : foodCostPct <= 45
                    ? 'text-amber-watch'
                    : 'text-brick-soft'
            }`}
          >
            {foodCostPct !== null ? `${foodCostPct.toFixed(1)}%` : '—'}
          </div>
        </div>
        <div className="h-8 w-px bg-surface-2" />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-cream/50">Margin</div>
          <div
            className={`text-base font-bold tabular-nums ${
              margin === null ? 'text-cream/50' : margin > 0 ? 'text-forest-soft' : 'text-brick-soft'
            }`}
          >
            {margin !== null ? formatThb(margin) : '—'}
          </div>
        </div>
        {dish.portion_size != null && dish.portion_unit != null && (
          <>
            <div className="h-8 w-px bg-surface-2" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-cream/50">Portion</div>
              <div className="text-base font-bold text-cream tabular-nums">
                {dish.portion_size}{dish.portion_unit}
              </div>
            </div>
            {dish.portion_unit !== 'pcs' && price > 0 && (
              <>
                <div className="h-8 w-px bg-surface-2" />
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-cream/50">&#x0E3F;/100{dish.portion_unit}</div>
                  <div className="text-base font-bold text-cream tabular-nums">
                    {formatThb(Math.round((price / dish.portion_size) * 100))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
        {dish.product_code && (
          <>
            <div className="h-8 w-px bg-surface-2" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-cream/50">Code</div>
              <div className="text-xs font-mono text-cream/60">{dish.product_code}</div>
            </div>
          </>
        )}
      </div>

      {/* Section: BOM */}
      <Section
        title="BOM — Ingredients"
        icon={<Soup className="h-3.5 w-3.5" />}
        count={detail.bom.length}
        isOpen={openSections.has('bom')}
        onToggle={() => toggle('bom')}
      >
        <BomTreeEditor
          dishId={dish.id}
          bom={detail.bom}
          totalBomCost={detail.totalBomCost}
          isLoading={detail.isLoading}
          error={detail.error}
          onAdd={detail.addIngredient}
          onUpdate={detail.updateBomRow}
          onRemove={detail.removeBomRow}
        />
      </Section>

      {/* Section: L2 Assembly */}
      <Section
        title="L2 Assembly — Dish plating / final steps"
        icon={<ChefHat className="h-3.5 w-3.5" />}
        isOpen={openSections.has('assembly')}
        onToggle={() => toggle('assembly')}
      >
        <div className="flex max-h-96 flex-col overflow-hidden rounded-lg border border-surface-3">
          <ProcessTab nomenclatureId={dish.id} />
        </div>
      </Section>

      {/* Section: L1 Production */}
      <Section
        title="L1 Production — Semi-finished (PF) processes"
        icon={<Flame className="h-3.5 w-3.5" />}
        count={detail.pfChildren.length}
        isOpen={openSections.has('production')}
        onToggle={() => toggle('production')}
      >
        {detail.pfChildren.length === 0 ? (
          <div className="rounded-lg border border-dashed border-surface-3 bg-surface-1/30 px-4 py-6 text-center text-xs text-cream/50">
            No PF ingredients — this dish is assembled directly from RAW.
          </div>
        ) : (
          <div className="space-y-2">
            {detail.pfChildren.map((pf) => {
              const isOpen = expandedPfIds.has(pf.id)
              return (
                <div key={pf.id} className="rounded-lg border border-surface-3 bg-surface-1/40">
                  <button
                    onClick={() => togglePf(pf.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left transition hover:bg-surface-2/40"
                  >
                    <div className="flex items-center gap-2">
                      {isOpen ? (
                        <ChevronDown className="h-3 w-3 text-cream/60" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-cream/60" />
                      )}
                      <span className="inline-flex rounded bg-nutri-car/20 px-1.5 py-0.5 text-[9px] font-bold text-nutri-car">
                        PF
                      </span>
                      <span className="text-xs font-medium text-cream">{pf.name}</span>
                      <span className="text-[10px] text-cream/50">{pf.product_code}</span>
                    </div>
                    <span className="text-[10px] text-cream/50">
                      {isOpen ? 'Hide process' : 'Show process'}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="flex max-h-80 flex-col overflow-hidden border-t border-surface-3">
                      <ProcessTab nomenclatureId={pf.id} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* Section: Nutrition */}
      <Section
        title="Nutrition"
        icon={<FileText className="h-3.5 w-3.5" />}
        isOpen={openSections.has('nutrition')}
        onToggle={() => toggle('nutrition')}
      >
        {dish.calories == null && dish.protein == null && dish.carbs == null && dish.fat == null ? (
          <div className="rounded-lg border border-dashed border-surface-3 bg-surface-1/30 px-4 py-6 text-center text-xs text-cream/50">
            No nutrition data. Edit the dish in Nomenclature or ask AI Chef to compute from BOM.
          </div>
        ) : (
          <div className="rounded-lg border border-surface-3 bg-surface-1/40 px-4 py-3">
            <NutritionBadges
              calories={dish.calories}
              protein={dish.protein}
              carbs={dish.carbs}
              fat={dish.fat}
            />
          </div>
        )}
      </Section>

      {/* Section: Photos */}
      <Section
        title="Photos"
        icon={<Camera className="h-3.5 w-3.5" />}
        count={gallery.images.length}
        isOpen={openSections.has('photos')}
        onToggle={() => toggle('photos')}
      >
        <div className="rounded-lg border border-surface-3 bg-surface-1/40 px-4 py-3">
          <ImageGallery
            images={gallery.images}
            isLoading={gallery.isLoading}
            onUpload={gallery.upload}
            onRemove={gallery.remove}
            onSetPrimary={gallery.setPrimary}
          />
        </div>
      </Section>
    </div>
  )
}

// ─── Collapsible Section ─────────────────────────────────────────

interface SectionProps {
  title: string
  icon?: React.ReactNode
  count?: number
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}

function Section({ title, icon, count, isOpen, onToggle, children }: SectionProps) {
  return (
    <div className="mb-3 last:mb-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-surface-2/40"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-cream/50" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-cream/50" />
        )}
        {icon && <span className="text-cream/60">{icon}</span>}
        <span className="text-xs font-semibold uppercase tracking-wider text-cream/80">
          {title}
        </span>
        {count !== undefined && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-cream/60">
            {count}
          </span>
        )}
      </button>
      {isOpen && <div className="mt-2 pl-5">{children}</div>}
    </div>
  )
}
