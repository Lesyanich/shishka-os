import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import type { MenuItem } from '../../../hooks/useMenuData'
import { useDishCard } from '../../../hooks/useDishCard'
import type { DishCardData } from '../../../hooks/useDishCard'
import { useAllergens } from '../../../hooks/useAllergens'
import { useModifierOptions } from '../../../hooks/useModifierOptions'
import { useDishScorecard } from '../../../hooks/useDishScorecard'
import { useDishCardSave } from '../../../hooks/useDishCardSave'
import type { MerrychefProgram } from '../../../hooks/useDishCardSave'
import { useDishRecipeSteps } from '../../../hooks/useDishRecipeSteps'
import { DrawerHero } from '../owner/DrawerHero'
import { CustomerTab } from './tabs/CustomerTab'
import { L1CookTab } from './tabs/L1CookTab'
import { L2AssemblerTab } from './tabs/L2AssemblerTab'
import { OwnerTab } from './tabs/OwnerTab'

type DrawerTab = 'customer' | 'l1-cook' | 'l2-assembler' | 'owner'

const TABS: readonly { key: DrawerTab; label: string }[] = [
  { key: 'customer', label: 'Customer' },
  { key: 'l1-cook', label: 'L1 Cook' },
  { key: 'l2-assembler', label: 'L2 Assembler' },
  { key: 'owner', label: 'Owner' },
]

interface DishDrawerProps {
  item: MenuItem | null
  onClose: () => void
  onSaved?: () => void
  returnFocusToId?: string | null
}

export function DishDrawer({
  item,
  onClose,
  onSaved,
  returnFocusToId,
}: DishDrawerProps) {
  const open = item != null
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const [activeTab, setActiveTab] = useState<DrawerTab>('customer')
  const [toast, setToast] = useState<{
    type: 'ok' | 'error'
    text: string
  } | null>(null)

  // Data hooks — all keyed to item.id (null when closed)
  const dishId = open ? item.id : null
  const isSale = item?.kind === 'SALE'
  const dishCard = useDishCard(isSale ? dishId : null)
  const allergens = useAllergens(isSale ? dishId : null)
  const modifiers = useModifierOptions(isSale ? dishId : null)
  const scorecard = useDishScorecard(dishId)
  const recipeSteps = useDishRecipeSteps(dishId)
  const { saveDishCard, isSaving } = useDishCardSave()

  // Local form state for tab edits (held until Save)
  const [formCard, setFormCard] = useState<Partial<DishCardData> | null>(null)
  // Nomenclature-level form state (customer photo URL etc.) — keyed at top level
  // so we can pass it to fn_dish_card_save outside the dish_card sub-object.
  const [formNomen, setFormNomen] = useState<{
    customer_photo_url?: string | null
    merrychef_program?: MerrychefProgram | null
  } | null>(null)

  // Reset form when item changes
  useEffect(() => {
    setFormCard(null)
    setFormNomen(null)
    setActiveTab('customer')
    setToast(null)
  }, [dishId])

  const onFormChange = useCallback((patch: Partial<DishCardData>) => {
    setFormCard((prev) => ({ ...(prev ?? {}), ...patch }))
  }, [])

  const onNomenChange = useCallback(
    (patch: {
      customer_photo_url?: string | null
      merrychef_program?: MerrychefProgram | null
    }) => {
      setFormNomen((prev) => ({ ...(prev ?? {}), ...patch }))
    },
    [],
  )

  const isDirty =
    (formCard != null && Object.keys(formCard).length > 0) ||
    (formNomen != null && Object.keys(formNomen).length > 0)

  const handleSave = useCallback(async () => {
    if (!item || !isSale) return
    const mergedCard = { ...(dishCard.card ?? {}), ...formCard }
    const result = await saveDishCard(item.id, {
      expected_version: item.card_version,
      customer_photo_url:
        formNomen != null && 'customer_photo_url' in formNomen
          ? (formNomen.customer_photo_url ?? '')
          : undefined,
      merrychef_program:
        formNomen != null && 'merrychef_program' in formNomen
          ? formNomen.merrychef_program
          : undefined,
      dish_card: {
        container_l2: mergedCard.container_l2 ?? undefined,
        assembly_order: mergedCard.assembly_order ?? undefined,
        pre_merrychef_prep: mergedCard.pre_merrychef_prep ?? undefined,
        post_merrychef_check:
          mergedCard.post_merrychef_check ?? undefined,
        cold_addons_after_reheat:
          mergedCard.cold_addons_after_reheat ?? undefined,
        has_cutlery: mergedCard.has_cutlery,
        has_lid_sticker: mergedCard.has_lid_sticker,
        assembler_photo_url:
          mergedCard.assembler_photo_url ?? undefined,
        customer_eta_min: mergedCard.customer_eta_min ?? undefined,
        composition_override:
          mergedCard.composition_override ?? undefined,
      },
    })
    if (result.ok) {
      setToast({ type: 'ok', text: `Saved v${result.newVersion}` })
      setFormCard(null)
      setFormNomen(null)
      dishCard.refetch()
      onSaved?.()
    } else if (result.conflict) {
      setToast({
        type: 'error',
        text: `Conflict: someone edited (v${result.conflict.current_version}). Reload.`,
      })
    } else {
      setToast({ type: 'error', text: result.error ?? 'Save failed' })
    }
    setTimeout(() => setToast(null), 4000)
  }, [item, isSale, dishCard, formCard, formNomen, saveDishCard, onSaved])

  // Focus management
  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() =>
        closeButtonRef.current?.focus(),
      )
      return () => cancelAnimationFrame(raf)
    }
  }, [open])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  // Restore focus on close
  useEffect(() => {
    if (!open && returnFocusToId) {
      const el = document.getElementById(`row-${returnFocusToId}`)
      const target = el?.querySelector<HTMLElement>('button, [tabindex]')
      target?.focus()
    }
  }, [open, returnFocusToId])

  if (!open) return null

  // Tab visibility: PF items hide Customer + L2 tabs
  const isPf = item.kind === 'PF'
  const visibleTabs = isPf
    ? TABS.filter((t) => t.key === 'l1-cook' || t.key === 'owner')
    : TABS

  // Ensure active tab is visible
  const resolvedTab = visibleTabs.find((t) => t.key === activeTab)
    ? activeTab
    : visibleTabs[0].key

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
        style={{ animation: 'fade-in-up 160ms ease-out both' }}
      />
      <aside
        role="dialog"
        aria-label={`${item.name} card`}
        aria-modal="false"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[640px] flex-col border-l border-slate-800 bg-[var(--color-surface-1)] text-[color:var(--color-cream)] shadow-2xl"
        style={{
          animation:
            'drawer-slide-in 240ms cubic-bezier(0.32, 0.72, 0, 1) both',
        }}
      >
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-800/80 px-5 py-3">
          <span
            className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-cream)]/60"
            style={{ fontFamily: 'var(--font-display-sc)' }}
          >
            Menu Card
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brick-soft)]/60"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Hero */}
        <div className="shrink-0 px-5 pb-2 pt-4">
          <DrawerHero item={item} />
        </div>

        {/* Tab strip */}
        <nav className="flex shrink-0 gap-0 border-b border-slate-800/80 px-5">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-2 text-[11px] font-medium transition ${
                resolvedTab === t.key
                  ? 'border-b-2 border-[var(--color-forest-soft)] text-[color:var(--color-forest-soft)]'
                  : 'text-cream/50 hover:text-cream/80'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Tab content — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {resolvedTab === 'customer' && (
            <CustomerTab
              item={item}
              dishCard={dishCard.card}
              allergens={allergens.allergens}
              allergensLoading={allergens.isLoading}
              modifiers={modifiers.modifiers}
              modifiersLoading={modifiers.isLoading}
              customerPhotoUrl={
                formNomen?.customer_photo_url !== undefined
                  ? formNomen.customer_photo_url
                  : (item.customer_photo_url ?? item.image_url ?? null)
              }
              onCustomerPhotoChange={(url) =>
                onNomenChange({ customer_photo_url: url })
              }
            />
          )}
          {resolvedTab === 'l1-cook' && (
            <L1CookTab
              item={item}
              components={dishCard.components}
              componentsLoading={dishCard.isLoading}
              recipeSteps={recipeSteps.steps}
              recipeStepsLoading={recipeSteps.isLoading}
            />
          )}
          {resolvedTab === 'l2-assembler' && (
            <L2AssemblerTab
              item={item}
              dishCard={dishCard.card}
              components={dishCard.components}
              isLoading={dishCard.isLoading}
              formCard={
                formCard
                  ? ({
                      ...(dishCard.card ?? {}),
                      ...formCard,
                    } as DishCardData)
                  : null
              }
              onFormChange={onFormChange}
              merrychefProgram={
                formNomen != null && 'merrychef_program' in formNomen
                  ? (formNomen.merrychef_program ?? null)
                  : ((item.merrychef_program as MerrychefProgram | null) ?? null)
              }
              onMerrychefChange={(program) =>
                onNomenChange({ merrychef_program: program })
              }
            />
          )}
          {resolvedTab === 'owner' && (
            <OwnerTab
              item={item}
              scorecard={scorecard.scorecard}
              scorecardLoading={scorecard.isLoading}
              scorecardError={scorecard.error}
              onSynced={() => onSaved?.()}
            />
          )}
        </div>

        {/* Footer: Save & Verify + toast */}
        <footer className="shrink-0 border-t border-slate-800/80 bg-[var(--color-surface-2)]/60 px-5 py-3">
          {toast && (
            <div
              className={`mb-2 rounded-lg px-3 py-1.5 text-xs font-medium ${
                toast.type === 'ok'
                  ? 'bg-[var(--color-royal-green)]/20 text-[color:var(--color-forest-soft)]'
                  : 'bg-[var(--color-royal-red)]/20 text-[color:var(--color-brick-soft)]'
              }`}
            >
              {toast.text}
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !isDirty}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-royal-green)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--color-forest-soft)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save & Verify
            </button>
          </div>
        </footer>
      </aside>
    </>
  )
}
