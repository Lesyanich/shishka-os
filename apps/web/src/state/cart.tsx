import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { MenuDish } from '../hooks/usePublicMenu.ts'

const CART_KEY = 'shishka_cart_v1'

function loadCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(CART_KEY)
    return raw ? (JSON.parse(raw) as CartLine[]) : []
  } catch {
    return []
  }
}

export interface CartLine {
  dish: MenuDish
  quantity: number
}

interface CartApi {
  lines: CartLine[]
  count: number
  total: number
  add: (dish: MenuDish) => void
  setQuantity: (dishId: string, quantity: number) => void
  remove: (dishId: string) => void
  clear: () => void
}

const CartContext = createContext<CartApi | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(loadCart)

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(lines))
  }, [lines])

  const api = useMemo<CartApi>(() => {
    const add = (dish: MenuDish) =>
      setLines((prev) => {
        const existing = prev.find((l) => l.dish.id === dish.id)
        if (existing) {
          return prev.map((l) => (l.dish.id === dish.id ? { ...l, quantity: l.quantity + 1 } : l))
        }
        return [...prev, { dish, quantity: 1 }]
      })

    const setQuantity = (dishId: string, quantity: number) =>
      setLines((prev) =>
        quantity <= 0
          ? prev.filter((l) => l.dish.id !== dishId)
          : prev.map((l) => (l.dish.id === dishId ? { ...l, quantity } : l)),
      )

    const remove = (dishId: string) => setLines((prev) => prev.filter((l) => l.dish.id !== dishId))
    const clear = () => setLines([])

    const count = lines.reduce((n, l) => n + l.quantity, 0)
    const total = lines.reduce((sum, l) => sum + (l.dish.price ?? 0) * l.quantity, 0)

    return { lines, count, total, add, setQuantity, remove, clear }
  }, [lines])

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
