import { NutritionBadges } from '../../shared/NutritionBadges'
import { AllergenBadges } from '../sections/AllergenBadges'
import { ModifierChips } from '../sections/ModifierChips'
import type { MenuItem } from '../../../../hooks/useMenuData'
import type { DishCardData } from '../../../../hooks/useDishCard'
import type { ModifierOption } from '../../../../hooks/useModifierOptions'

interface CustomerTabProps {
  item: MenuItem
  dishCard: DishCardData | null
  allergens: string[]
  allergensLoading: boolean
  modifiers: ModifierOption[]
  modifiersLoading: boolean
}

export function CustomerTab({
  item,
  dishCard,
  allergens,
  allergensLoading,
  modifiers,
  modifiersLoading,
}: CustomerTabProps) {
  const compositionText = dishCard?.composition_override ?? null

  return (
    <div className="space-y-6">
      {/* Customer short name */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          POS Display Name
        </h4>
        <p className="text-sm text-cream/80">
          {item.customer_short_name || (
            <span className="italic text-cream/40">
              Not set (falls back to &quot;{item.name}&quot;)
            </span>
          )}
        </p>
      </section>

      {/* Customer description */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          Customer Description
        </h4>
        <p className="text-sm leading-relaxed text-cream/75">
          {item.customer_description || (
            <span className="italic text-cream/40">
              No customer description
            </span>
          )}
        </p>
      </section>

      {/* Allergens */}
      <section className="space-y-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          Allergens (from BOM tree)
        </h4>
        <AllergenBadges allergens={allergens} isLoading={allergensLoading} />
      </section>

      {/* Modifiers */}
      <section className="space-y-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          Modifier Options
        </h4>
        <ModifierChips modifiers={modifiers} isLoading={modifiersLoading} />
      </section>

      {/* Nutrition */}
      <section className="space-y-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          Nutrition
        </h4>
        <NutritionBadges
          nutrition={{
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
          }}
        />
      </section>

      {/* Composition */}
      {compositionText && (
        <section className="space-y-1">
          <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
            Composition (editorial)
          </h4>
          <p className="text-xs leading-relaxed text-cream/70">
            {compositionText}
          </p>
        </section>
      )}

      {/* ETA */}
      {dishCard?.customer_eta_min != null && (
        <section className="space-y-1">
          <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
            Estimated Wait
          </h4>
          <span className="inline-flex rounded-full bg-surface-3 px-2.5 py-0.5 text-xs font-medium text-cream/70">
            ~{dishCard.customer_eta_min} min
          </span>
        </section>
      )}
    </div>
  )
}
