import { Package, Utensils, StickyNote } from 'lucide-react'
import type { MenuItem } from '../../../../hooks/useMenuData'
import type { DishCardData, AssemblyComponent } from '../../../../hooks/useDishCard'
import type { MerrychefProgram } from '../../../../hooks/useDishCardSave'
import { AssemblyOrderEditor } from '../sections/AssemblyOrderEditor'
import { MerrychefProgramForm } from '../sections/MerrychefProgramForm'
import { PhotoUpload } from '../sections/PhotoUpload'

interface L2AssemblerTabProps {
  item: MenuItem
  dishCard: DishCardData | null
  components: AssemblyComponent[]
  isLoading: boolean
  /** Controlled form state — changes here are held until Save & Verify. */
  formCard: DishCardData | null
  onFormChange: (patch: Partial<DishCardData>) => void
  /** Merrychef program lives on nomenclature, not dish_card — passed separately. */
  merrychefProgram: MerrychefProgram | null
  onMerrychefChange: (program: MerrychefProgram | null) => void
}

export function L2AssemblerTab({
  item,
  dishCard,
  components,
  isLoading,
  formCard,
  onFormChange,
  merrychefProgram,
  onMerrychefChange,
}: L2AssemblerTabProps) {
  if (isLoading)
    return (
      <span className="text-xs text-cream/40">
        Loading assembler card...
      </span>
    )

  const card = formCard ?? dishCard

  return (
    <div className="space-y-6">
      {/* Assembler note */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          <StickyNote className="mr-1 inline h-3 w-3" />
          Assembler Note
        </h4>
        <p className="text-sm text-cream/75">
          {item.assembler_note || (
            <span className="italic text-cream/40">No assembler note</span>
          )}
        </p>
      </section>

      {/* Container */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          <Package className="mr-1 inline h-3 w-3" />
          Container (L2)
        </h4>
        <input
          value={card?.container_l2 ?? ''}
          onChange={(e) =>
            onFormChange({ container_l2: e.target.value || null })
          }
          className="w-full rounded border border-surface-3 bg-surface-2 px-2 py-1.5 text-xs text-cream focus:border-forest-soft focus:outline-none"
          placeholder="e.g. paper_bowl_16oz, kraft_box"
        />
      </section>

      {/* Assembly order */}
      <section className="space-y-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          Assembly Order
        </h4>
        <AssemblyOrderEditor
          steps={card?.assembly_order ?? []}
          onChange={(steps) => onFormChange({ assembly_order: steps })}
        />
      </section>

      {/* Merrychef program */}
      <section className="space-y-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          Merrychef Program
        </h4>
        <MerrychefProgramForm
          program={merrychefProgram}
          onChange={onMerrychefChange}
        />
      </section>

      {/* Pre/post Merrychef checks */}
      <div className="grid grid-cols-2 gap-3">
        <section className="space-y-1">
          <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
            Pre-Merrychef
          </h4>
          <input
            value={card?.pre_merrychef_prep ?? ''}
            onChange={(e) =>
              onFormChange({ pre_merrychef_prep: e.target.value || null })
            }
            className="w-full rounded border border-surface-3 bg-surface-2 px-2 py-1.5 text-xs text-cream focus:border-forest-soft focus:outline-none"
            placeholder="Prep before reheat"
          />
        </section>
        <section className="space-y-1">
          <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
            Post-Merrychef
          </h4>
          <input
            value={card?.post_merrychef_check ?? ''}
            onChange={(e) =>
              onFormChange({
                post_merrychef_check: e.target.value || null,
              })
            }
            className="w-full rounded border border-surface-3 bg-surface-2 px-2 py-1.5 text-xs text-cream focus:border-forest-soft focus:outline-none"
            placeholder="Check after reheat"
          />
        </section>
      </div>

      {/* Cold add-ons */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          Cold Add-ons After Reheat
        </h4>
        <input
          value={card?.cold_addons_after_reheat ?? ''}
          onChange={(e) =>
            onFormChange({
              cold_addons_after_reheat: e.target.value || null,
            })
          }
          className="w-full rounded border border-surface-3 bg-surface-2 px-2 py-1.5 text-xs text-cream focus:border-forest-soft focus:outline-none"
          placeholder="e.g. fresh herbs, sauce drizzle"
        />
      </section>

      {/* Toggles */}
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-xs text-cream/70">
          <input
            type="checkbox"
            checked={card?.has_cutlery ?? false}
            onChange={(e) => onFormChange({ has_cutlery: e.target.checked })}
            className="rounded border-surface-3"
          />
          <Utensils className="h-3 w-3" />
          Include cutlery
        </label>
        <label className="flex items-center gap-2 text-xs text-cream/70">
          <input
            type="checkbox"
            checked={card?.has_lid_sticker ?? false}
            onChange={(e) =>
              onFormChange({ has_lid_sticker: e.target.checked })
            }
            className="rounded border-surface-3"
          />
          Lid sticker
        </label>
      </div>

      {/* Assembler reference photo */}
      <PhotoUpload
        photoUrl={card?.assembler_photo_url ?? null}
        role="assembler"
        nomenclatureId={item.id}
        onChange={(newUrl) =>
          onFormChange({ assembler_photo_url: newUrl ?? '' })
        }
        label="Assembler Reference Photo"
      />

      {/* L2 Components (read-only, from view) */}
      <section className="space-y-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          Components per Portion
        </h4>
        {components.length === 0 ? (
          <span className="text-xs text-cream/40">
            No assembly components
          </span>
        ) : (
          <ul className="space-y-1">
            {components.map((c) => (
              <li
                key={c.component_id}
                className="flex items-center justify-between text-xs text-cream/70"
              >
                <span>{c.component_name}</span>
                <span className="font-mono text-[10px] text-cream/50">
                  {c.qty_per_portion} {c.base_unit ?? ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
