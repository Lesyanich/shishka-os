// Shopping list (procurement checklist) — types
// Backed by public.shopping_list_items (migration 245)

export type ShoppingStore =
  | 'makro'
  | 'homepro'
  | 'sangdamrong'
  | 'lazada'
  | 'tops'
  | 'other'

export type ShoppingStatus = 'needed' | 'bought' | 'cancelled'

export const SHOPPING_STORES: ShoppingStore[] = [
  'makro',
  'homepro',
  'sangdamrong',
  'lazada',
  'tops',
  'other',
]

export const STORE_LABELS: Record<ShoppingStore, string> = {
  makro: 'Makro',
  homepro: 'HomePro',
  sangdamrong: 'Sangdamrong',
  lazada: 'Lazada',
  tops: 'Tops',
  other: 'Other',
}

export interface ShoppingItem {
  id: string
  name: string
  store: ShoppingStore
  product_url: string | null
  image_url: string | null
  qty: number | null
  unit: string | null
  est_price: number | null
  notes: string | null
  status: ShoppingStatus
  sort_order: number
  nomenclature_id: string | null
  source: string
  created_at: string
  updated_at: string
  bought_at: string | null
}

export interface NewShoppingItem {
  name: string
  store: ShoppingStore
  product_url?: string | null
  qty?: number | null
  unit?: string | null
  est_price?: number | null
  notes?: string | null
}

// Fields the UI may patch inline
export type ShoppingPatch = Partial<
  Pick<
    ShoppingItem,
    'name' | 'store' | 'product_url' | 'qty' | 'unit' | 'est_price' | 'notes' | 'status'
  >
>

export interface MutationResult {
  ok: boolean
  error?: string
}

export interface SeedResult {
  ok: boolean
  inserted?: number
  error?: string
}
