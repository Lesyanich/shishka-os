import { useEffect, useState } from 'react'
import { X, ShoppingBag } from 'lucide-react'
import type { MenuDish } from '../hooks/usePublicMenu.ts'
import { usePublicModifiers, type PublicModifierGroup } from '../hooks/usePublicModifiers.ts'
import type { SelectedModifier } from '../state/cart.tsx'

const baht = (n: number | null) => (n == null ? '' : `฿${Number(n).toLocaleString()}`)

interface Props {
  dish: MenuDish | null
  onClose: () => void
  onAddToCart: (dish: MenuDish, modifiers?: SelectedModifier[]) => void
}

type Selections = Map<string, string[]>

function groupHint(g: PublicModifierGroup): string {
  if (g.minSelect > 0 && g.maxSelect != null && g.minSelect !== g.maxSelect) {
    return `Choose ${g.minSelect}–${g.maxSelect}`
  }
  if (g.minSelect > 0 && g.maxSelect != null && g.minSelect === g.maxSelect) {
    return `Choose exactly ${g.minSelect}`
  }
  if (g.minSelect > 0) return `Choose at least ${g.minSelect}`
  if (g.maxSelect === 1) return 'Choose one'
  if (g.maxSelect != null) return `Choose up to ${g.maxSelect}`
  return 'Optional'
}

export function ProductSheet({ dish, onClose, onAddToCart }: Props) {
  const { groups } = usePublicModifiers(dish?.id ?? null)
  const [selections, setSelections] = useState<Selections>(new Map())

  // Reset selections when dish changes
  useEffect(() => {
    setSelections(new Map())
  }, [dish?.id])

  // Apply defaults once groups load
  useEffect(() => {
    if (!groups.length) return
    const defaults = new Map<string, string[]>()
    for (const group of groups) {
      const defs = group.options
        .filter((o) => o.isDefault && o.stockState !== 'out_of_stock')
        .map((o) => o.optionName)
      if (defs.length > 0) defaults.set(group.groupName, defs)
    }
    setSelections(defaults)
  }, [groups])

  // Keyboard + scroll lock
  useEffect(() => {
    if (!dish) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [dish, onClose])

  if (!dish) return null

  function toggleOption(group: PublicModifierGroup, optionName: string) {
    setSelections((prev) => {
      const current = prev.get(group.groupName) ?? []
      const isSelected = current.includes(optionName)
      let next: string[]

      if (isSelected) {
        if (current.length <= group.minSelect) return prev
        next = current.filter((n) => n !== optionName)
      } else {
        if (group.maxSelect === 1) {
          next = [optionName]
        } else if (group.maxSelect != null && current.length >= group.maxSelect) {
          return prev
        } else {
          next = [...current, optionName]
        }
      }

      const m = new Map(prev)
      m.set(group.groupName, next)
      return m
    })
  }

  const modifierDelta = groups.reduce((sum, group) => {
    const selected = selections.get(group.groupName) ?? []
    return (
      sum +
      group.options
        .filter((o) => selected.includes(o.optionName))
        .reduce((s, o) => s + o.priceDelta, 0)
    )
  }, 0)

  const totalPrice = dish.price != null ? dish.price + modifierDelta : null

  const canAdd =
    dish.price != null &&
    groups.every((g) => (selections.get(g.groupName) ?? []).length >= g.minSelect)

  function handleAdd() {
    const mods: SelectedModifier[] = groups.flatMap((group) =>
      (selections.get(group.groupName) ?? []).map((optionName) => {
        const opt = group.options.find((o) => o.optionName === optionName)!
        return { groupName: group.groupName, optionName, priceDelta: opt.priceDelta }
      }),
    )
    onAddToCart(dish, mods.length > 0 ? mods : undefined)
    onClose()
  }

  // Live nutrition: base + selected modifiers
  const nutBase = {
    calories: dish.calories,
    protein: dish.protein,
    carbs: dish.carbs,
    fat: dish.fat,
  }
  const nutDelta = groups.reduce(
    (acc, group) => {
      const selected = selections.get(group.groupName) ?? []
      for (const opt of group.options.filter((o) => selected.includes(o.optionName))) {
        if (opt.calories != null) acc.calories = (acc.calories ?? 0) + opt.calories
        if (opt.protein != null) acc.protein = (acc.protein ?? 0) + opt.protein
        if (opt.carbs != null) acc.carbs = (acc.carbs ?? 0) + opt.carbs
        if (opt.fat != null) acc.fat = (acc.fat ?? 0) + opt.fat
      }
      return acc
    },
    { calories: null as number | null, protein: null as number | null, carbs: null as number | null, fat: null as number | null },
  )

  const nut = {
    calories: nutBase.calories != null || nutDelta.calories != null ? (nutBase.calories ?? 0) + (nutDelta.calories ?? 0) : null,
    protein: nutBase.protein != null || nutDelta.protein != null ? (nutBase.protein ?? 0) + (nutDelta.protein ?? 0) : null,
    carbs: nutBase.carbs != null || nutDelta.carbs != null ? (nutBase.carbs ?? 0) + (nutDelta.carbs ?? 0) : null,
    fat: nutBase.fat != null || nutDelta.fat != null ? (nutBase.fat ?? 0) + (nutDelta.fat ?? 0) : null,
  }

  return (
    <>
      {/* Backdrop */}
      <div aria-hidden onClick={onClose} className="fixed inset-0 z-40 bg-black/40" />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={dish.name}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[95dvh] flex-col overflow-hidden rounded-t-3xl shadow-2xl"
        style={{ background: '#FAF7F0' }}
      >
        {/* Drag handle + close button — always in view, never inside the image */}
        <div className="relative flex shrink-0 items-center justify-center" style={{ height: 48 }}>
          <div
            className="h-1 w-10 rounded-full"
            style={{ background: 'rgba(45,63,28,0.15)' }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full shadow transition active:scale-90"
            style={{ background: 'rgba(45,63,28,0.08)', color: '#2D3F1C' }}
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        {/* Photo */}
        <div className="shrink-0">
          {dish.image_url ? (
            <img
              src={dish.image_url}
              alt={dish.name}
              className="w-full"
              style={{ aspectRatio: '3 / 2', objectFit: 'cover', background: '#FAF7F0', display: 'block' }}
            />
          ) : (
            <div
              className="flex w-full items-center justify-center"
              style={{ aspectRatio: '3 / 2', background: '#F0EAD6' }}
            >
              <span style={{ fontSize: 64, opacity: 0.18 }}>🍽</span>
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto" style={{ color: '#2D3F1C' }}>
          <div className="px-5 pt-5 pb-4 space-y-4">
            {/* Name + live price */}
            <div className="flex items-start justify-between gap-3">
              <h2
                className="leading-tight"
                style={{ fontFamily: 'Alegreya, Georgia, serif', fontSize: '1.9rem', fontWeight: 700, color: '#2D3F1C', lineHeight: 1.1 }}
              >
                {dish.name}
              </h2>
              <span
                style={{ fontFamily: 'Alegreya, Georgia, serif', fontSize: '1.6rem', fontWeight: 700, color: '#2D3F1C', whiteSpace: 'nowrap', paddingTop: 4 }}
              >
                {baht(totalPrice)}
              </span>
            </div>

            {/* Description */}
            {dish.description && (
              <p className="leading-relaxed text-[0.95rem]" style={{ color: 'rgba(45,63,28,0.8)' }}>
                {dish.description}
              </p>
            )}

            {/* Modifier groups */}
            {groups.map((group) => {
              const selected = selections.get(group.groupName) ?? []
              const isRequired = group.minSelect > 0
              const isSatisfied = selected.length >= group.minSelect

              return (
                <div key={group.groupName}>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="font-semibold text-[0.95rem]" style={{ color: '#2D3F1C' }}>
                      {group.groupName}
                    </span>
                    <span
                      className="text-xs rounded-full px-2 py-0.5"
                      style={
                        isRequired && !isSatisfied
                          ? { background: '#FEF3C7', color: '#92400E' }
                          : { background: 'rgba(45,63,28,0.08)', color: 'rgba(45,63,28,0.55)' }
                      }
                    >
                      {groupHint(group)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.options.map((opt) => {
                      const isSelected = selected.includes(opt.optionName)
                      const isOos = opt.stockState === 'out_of_stock'
                      return (
                        <button
                          key={opt.optionName}
                          type="button"
                          disabled={isOos}
                          onClick={() => toggleOption(group, opt.optionName)}
                          className="rounded-full px-3 py-1.5 text-sm transition active:scale-95"
                          style={
                            isOos
                              ? { border: '1px solid rgba(45,63,28,0.1)', color: 'rgba(45,63,28,0.3)', cursor: 'not-allowed' }
                              : isSelected
                                ? { background: '#2D3F1C', color: '#F0EAD6' }
                                : { border: '1px solid rgba(45,63,28,0.2)', color: 'rgba(45,63,28,0.75)' }
                          }
                        >
                          {opt.optionEmoji ? `${opt.optionEmoji} ` : ''}
                          {opt.optionName}
                          {opt.priceDelta > 0 && (
                            <span className="ml-1 opacity-70">+{baht(opt.priceDelta)}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Nutrition (live, includes selected modifiers) */}
            {(nut.calories != null || nut.protein != null || nut.carbs != null || nut.fat != null) && (
              <div className="flex flex-wrap gap-2">
                {nut.calories != null && (
                  <span className="rounded-full px-3 py-1 text-xs" style={{ background: '#FEF3C7', color: '#92400E' }}>
                    {Math.round(nut.calories)} kcal
                  </span>
                )}
                {nut.protein != null && (
                  <span className="rounded-full px-3 py-1 text-xs" style={{ background: '#E0F2FE', color: '#0C4A6E' }}>
                    P {Number(nut.protein).toFixed(1)}g
                  </span>
                )}
                {nut.carbs != null && (
                  <span className="rounded-full px-3 py-1 text-xs" style={{ background: '#EDE9FE', color: '#4C1D95' }}>
                    C {Number(nut.carbs).toFixed(1)}g
                  </span>
                )}
                {nut.fat != null && (
                  <span className="rounded-full px-3 py-1 text-xs" style={{ background: '#FFE4E6', color: '#9F1239' }}>
                    F {Number(nut.fat).toFixed(1)}g
                  </span>
                )}
              </div>
            )}

            {/* Allergens */}
            {dish.allergens.length > 0 && (
              <p className="text-xs" style={{ color: 'rgba(45,63,28,0.38)' }}>
                Contains: {dish.allergens.join(', ')}
              </p>
            )}

            {/* Tags */}
            {dish.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {dish.tags.map((tag) => (
                  <span
                    key={tag.slug}
                    className="rounded-full px-3 py-1 text-xs"
                    style={
                      tag.color
                        ? { background: `${tag.color}22`, color: tag.color }
                        : { border: '1px solid rgba(45,63,28,0.18)', color: 'rgba(45,63,28,0.6)' }
                    }
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Add to cart footer */}
        <div className="shrink-0 px-5 pb-8 pt-3" style={{ background: '#FAF7F0' }}>
          {!canAdd && groups.some((g) => (selections.get(g.groupName) ?? []).length < g.minSelect) && (
            <p className="mb-2 text-center text-xs" style={{ color: '#92400E' }}>
              Please make all required selections above
            </p>
          )}
          <button
            type="button"
            disabled={!canAdd}
            onClick={handleAdd}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold transition active:scale-[0.98] disabled:opacity-40"
            style={{ background: '#2D3F1C', color: '#F0EAD6', letterSpacing: '0.01em' }}
          >
            <ShoppingBag size={18} />
            Add to cart · {baht(totalPrice)}
          </button>
        </div>
      </div>
    </>
  )
}
