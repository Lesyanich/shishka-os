import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { CartItem } from '@shishka/contracts'
import type { MenuDish } from '../hooks/usePublicMenu.ts'

/** A chosen manakish or sauce inside a bundle line. */
export interface BundleChildLine {
  dish: MenuDish
  quantity: number
  role: 'manakish' | 'sauce'
}

/** A plain dish line (quantity-adjustable). */
export interface DishLine {
  kind: 'dish'
  id: string
  dish: MenuDish
  quantity: number
}

/** A configured bundle line. Price is computed at build time (client preview);
 *  the server recomputes the authoritative total in create-order. */
export interface BundleLine {
  kind: 'bundle'
  id: string
  dish: MenuDish // the SALE-BUNDLE_* dish
  children: BundleChildLine[]
  price: number // discounted preview total
}

export type CartLine = DishLine | BundleLine

interface CartApi {
  lines: CartLine[]
  count: number
  total: number
  add: (dish: MenuDish) => void
  addBundle: (dish: MenuDish, children: BundleChildLine[], price: number) => void
  /** Adjust a plain dish line's quantity (≤ 0 removes it). No-op for bundles. */
  setQuantity: (lineId: string, quantity: number) => void
  remove: (lineId: string) => void
  clear: () => void
  /** Serialize the cart into the create-order request `items` shape. */
  toOrderItems: () => CartItem[]
}

const CartContext = createContext<CartApi | null>(null)

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `line-${Math.round(performance.now() * 1000)}`

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([])

  const api = useMemo<CartApi>(() => {
    // Plain dishes of the same id stack into one line; bundles never stack
    // (each configuration is its own line).
    const add = (dish: MenuDish) =>
      setLines((prev) => {
        const existing = prev.find((l) => l.kind === 'dish' && l.dish.id === dish.id)
        if (existing) {
          return prev.map((l) =>
            l.id === existing.id ? { ...l, quantity: (l as DishLine).quantity + 1 } : l,
          )
        }
        return [...prev, { kind: 'dish', id: newId(), dish, quantity: 1 }]
      })

    const addBundle = (dish: MenuDish, children: BundleChildLine[], price: number) =>
      setLines((prev) => [...prev, { kind: 'bundle', id: newId(), dish, children, price }])

    const setQuantity = (lineId: string, quantity: number) =>
      setLines((prev) =>
        prev.flatMap((l) => {
          if (l.id !== lineId || l.kind !== 'dish') return [l]
          return quantity <= 0 ? [] : [{ ...l, quantity }]
        }),
      )

    const remove = (lineId: string) => setLines((prev) => prev.filter((l) => l.id !== lineId))
    const clear = () => setLines([])

    const lineTotal = (l: CartLine) =>
      l.kind === 'bundle' ? l.price : (l.dish.price ?? 0) * l.quantity

    // A bundle counts as one item; plain dishes count by quantity.
    const count = lines.reduce((n, l) => n + (l.kind === 'bundle' ? 1 : l.quantity), 0)
    const total = lines.reduce((sum, l) => sum + lineTotal(l), 0)

    const toOrderItems = (): CartItem[] =>
      lines.map((l) =>
        l.kind === 'bundle'
          ? {
              nomenclatureId: l.dish.id,
              quantity: 1,
              modifierSlugs: [],
              bundle: {
                children: l.children.map((c) => ({
                  nomenclatureId: c.dish.id,
                  quantity: c.quantity,
                  role: c.role,
                })),
              },
            }
          : { nomenclatureId: l.dish.id, quantity: l.quantity, modifierSlugs: [] },
      )

    return { lines, count, total, add, addBundle, setQuantity, remove, clear, toOrderItems }
  }, [lines])

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
