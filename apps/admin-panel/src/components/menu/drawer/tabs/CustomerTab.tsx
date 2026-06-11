import { NutritionBadges } from '../../shared/NutritionBadges'
import { AllergenBadges } from '../sections/AllergenBadges'
import { ModifierBuildPreview } from '../sections/ModifierBuildPreview'
import { PhotoUpload } from '../sections/PhotoUpload'
import type { MenuItem } from '../../../../hooks/useMenuData'
import type { DishCardData } from '../../../../hooks/useDishCard'
import type { DishModifierOption } from '../../../../hooks/useMenuListEnrichment'

interface CustomerTabProps {
  item: MenuItem
  dishCard: DishCardData | null
  allergens: string[]
  allergensLoading: boolean
  /** Customisation options (with nutrition + min/max) for the build-preview. */
  modifierOptions: DishModifierOption[]
  /** Current photo URL (merged: form override OR persisted column). */
  customerPhotoUrl: string | null
  /** Pass new public URL (or null to clear). Caller saves on Save & Verify. */
  onCustomerPhotoChange: (url: string | null) => void
}

export function CustomerTab({
  item,
  dishCard,
  allergens,
  allergensLoading,
  modifierOptions,
  customerPhotoUrl,
  onCustomerPhotoChange,
}: CustomerTabProps) {
  const compositionText = dishCard?.composition_override ?? null

  return (
    <div className="space-y-6">
      {/* Customer photo */}
      <PhotoUpload
        photoUrl={customerPhotoUrl}
        role="customer"
        nomenclatureId={item.id}
        onChange={onCustomerPhotoChange}
        label="Customer Photo"
      />

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

      {/* Modifiers — interactive build-preview with a live KBJU + price counter,
          mirroring the customer build-your-own on shishka.health. */}
      <section className="space-y-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          Build Preview
        </h4>
        <ModifierBuildPreview
          options={modifierOptions}
          base={{
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
          }}
          basePrice={item.price}
        />
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
