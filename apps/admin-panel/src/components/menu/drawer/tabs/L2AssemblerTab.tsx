import { useState } from 'react'
import { Package, Utensils, StickyNote, AlertTriangle, Plus, Trash2 } from 'lucide-react'
import type { MenuItem } from '../../../../hooks/useMenuData'
import type {
  DishCardData,
  AssemblyComponent,
  DishPackagingLine,
  PackagingCatalogItem,
} from '../../../../hooks/useDishCard'
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
  /** Packaging (NF-PKG BOM lines) — written immediately, not deferred to Save. */
  packaging: DishPackagingLine[]
  packagingCatalog: PackagingCatalogItem[]
  onAddPackaging: (packagingId: string, qty: number) => Promise<{ ok: boolean; error?: string }>
  onUpdatePackagingQty: (bomId: string, qty: number) => Promise<{ ok: boolean; error?: string }>
  onRemovePackaging: (bomId: string) => Promise<{ ok: boolean; error?: string }>
}

/** Packaging editor — lists NF-PKG BOM lines and lets the user add/remove them.
 * Writes apply immediately (bom_structures), so packaging cost rolls into the
 * dish cost via the DB trigger. At least one line is required per dish. */
function PackagingSection({
  packaging,
  packagingCatalog,
  onAddPackaging,
  onUpdatePackagingQty,
  onRemovePackaging,
}: {
  packaging: DishPackagingLine[]
  packagingCatalog: PackagingCatalogItem[]
  onAddPackaging: (packagingId: string, qty: number) => Promise<{ ok: boolean; error?: string }>
  onUpdatePackagingQty: (bomId: string, qty: number) => Promise<{ ok: boolean; error?: string }>
  onRemovePackaging: (bomId: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const [pickId, setPickId] = useState('')
  const [pickQty, setPickQty] = useState(1)
  const [busy, setBusy] = useState(false)

  // Hide already-attached materials from the picker.
  const attachedIds = new Set(packaging.map((p) => p.packaging_id))
  const available = packagingCatalog.filter((c) => !attachedIds.has(c.id))

  const handleAdd = async () => {
    if (!pickId || pickQty <= 0) return
    setBusy(true)
    await onAddPackaging(pickId, pickQty)
    setBusy(false)
    setPickId('')
    setPickQty(1)
  }

  return (
    <section className="space-y-2">
      <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
        <Package className="mr-1 inline h-3 w-3" />
        Packaging
        <span className="ml-1 text-brick-soft">*</span>
      </h4>

      {packaging.length === 0 ? (
        <p className="flex items-center gap-1 rounded-md bg-brick-soft/15 px-2 py-1.5 text-[10px] font-medium text-brick-soft">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          No packaging set — every dish must declare its container/packaging.
        </p>
      ) : (
        <ul className="space-y-1">
          {packaging.map((p) => (
            <li
              key={p.bom_id}
              className="flex items-center gap-2 rounded border border-surface-3 bg-surface-2 px-2 py-1.5 text-xs"
            >
              <span className="min-w-0 flex-1 truncate text-cream/80">{p.packaging_name}</span>
              <input
                type="number"
                min={0}
                step="0.5"
                value={p.qty_per_portion}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (v > 0) onUpdatePackagingQty(p.bom_id, v)
                }}
                className="w-14 rounded border border-surface-3 bg-surface-1 px-1.5 py-1 text-right text-xs text-cream focus:border-forest-soft focus:outline-none"
                title="Quantity per portion"
              />
              <span className="w-8 text-[10px] text-cream/40">{p.base_unit ?? 'pcs'}</span>
              <span className="w-16 text-right font-mono text-[10px] text-cream/50">
                ฿{(p.line_cost ?? 0).toFixed(2)}
              </span>
              <button
                type="button"
                onClick={() => onRemovePackaging(p.bom_id)}
                aria-label={`Remove ${p.packaging_name}`}
                className="rounded p-1 text-cream/40 transition hover:bg-brick-soft/20 hover:text-brick-soft"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add row */}
      <div className="flex items-center gap-2">
        <select
          value={pickId}
          onChange={(e) => setPickId(e.target.value)}
          className="min-w-0 flex-1 rounded border border-surface-3 bg-surface-2 px-2 py-1.5 text-xs text-cream focus:border-forest-soft focus:outline-none"
        >
          <option value="">Add packaging…</option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.cost_per_unit != null ? ` — ฿${Number(c.cost_per_unit).toFixed(2)}/${c.base_unit ?? 'pcs'}` : ''}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          step="0.5"
          value={pickQty}
          onChange={(e) => setPickQty(Number(e.target.value))}
          className="w-14 rounded border border-surface-3 bg-surface-2 px-1.5 py-1.5 text-right text-xs text-cream focus:border-forest-soft focus:outline-none"
          title="Quantity per portion"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!pickId || pickQty <= 0 || busy}
          className="inline-flex items-center gap-1 rounded-lg bg-royal-green/30 px-2.5 py-1.5 text-xs font-medium text-forest-soft transition hover:bg-royal-green/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>
    </section>
  )
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
  packaging,
  packagingCatalog,
  onAddPackaging,
  onUpdatePackagingQty,
  onRemovePackaging,
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

      {/* Packaging — required, sourced from the NF-PKG catalog (rolls into cost) */}
      <PackagingSection
        packaging={packaging}
        packagingCatalog={packagingCatalog}
        onAddPackaging={onAddPackaging}
        onUpdatePackagingQty={onUpdatePackagingQty}
        onRemovePackaging={onRemovePackaging}
      />

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
