import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { MenuDish } from '../hooks/usePublicMenu.ts'

const CART_KEY = 'shishka_cart_v1'

export interface SelectedModifier {
  groupName: string
  optionName: string
  priceDelta: number
}

export interface CartLine {
  lineId: string
  dish: MenuDish
  quantity: number
  modifiers?: SelectedModifier[]
}

interface CartApi {
  lines: CartLine[]
  count: number
  total: number
  add: (dish: MenuDish, modifiers?: SelectedModifier[]) => void
  setQuantity: (lineId: string, quantity: number) => void
  remove: (lineId: string) => void
  clear: () => void
}

const CartContext = createContext<CartApi | null>(null)

function modifierKey(mods?: SelectedModifier[]) {
  return JSON.stringify((mods ?? []).map((m) => m.optionName).sort())
}

function loadCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(CART_KEY)
    if (!raw) return []
    const lines = JSON.parse(raw) as CartLine[]
    return lines.map((l) => (l.lineId ? l : { ...l, lineId: crypto.randomUUID() }))
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(loadCart)

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(lines))
  }, [lines])

  const api = useMemo<CartApi>(() => {
    const add = (dish: MenuDish, modifiers?: SelectedModifier[]) =>
      setLines((prev) => {
        const key = dish.id + '|' + modifierKey(modifiers)
        const existing = prev.find(
          (l) => l.dish.id + '|' + modifierKey(l.modifiers) === key,
        )
        if (existing) {
          return prev.map((l) =>
            l.lineId === existing.lineId ? { ...l, quantity: l.quantity + 1 } : l,
          )
        }
        return [...prev, { lineId: crypto.randomUUID(), dish, quantity: 1, modifiers }]
      })

    const setQuantity = (lineId: string, quantity: number) =>
      setLines((prev) =>
        quantity <= 0
          ? prev.filter((l) => l.lineId !== lineId)
          : prev.map((l) => (l.lineId === lineId ? { ...l, quantity } : l)),
      )

    const remove = (lineId: string) =>
      setLines((prev) => prev.filter((l) => l.lineId !== lineId))

    const clear = () => setLines([])

    const count = lines.reduce((n, l) => n + l.quantity, 0)
    const total = lines.reduce((sum, l) => {
      const modDelta = (l.modifiers ?? []).reduce((s, m) => s + m.priceDelta, 0)
      return sum + ((l.dish.price ?? 0) + modDelta) * l.quantity
    }, 0)

    return { lines, count, total, add, setQuantity, remove, clear }
  }, [lines])

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
