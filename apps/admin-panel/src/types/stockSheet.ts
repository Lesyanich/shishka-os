// Staff stock-order sheet — shared types.
// Backed by migration 245 (v_stock_sheet_items, fn_submit_stock_sheet, stock_requests).

export type StorageLocation = 'bar' | 'dry' | 'fridge' | 'freezer'

/** Staff-reported stock level. */
export type StockStatus = 'out' | 'low' | 'in'

/** A curated item shown on the public staff sheet (cost-free). */
export interface StockSheetItem {
  id: string
  name: string
  emoji: string | null
  base_unit: string | null
  storage_location: StorageLocation | string | null
  category_id: string | null
  category_code: string | null
  category_name: string
  category_name_th: string
  category_sort: number
  in_active_menu: boolean
}

/** One line a staff member submits. */
export interface StockSheetLineInput {
  nomenclature_id: string
  status: StockStatus
  order_qty?: number | null
  note?: string | null
}

/** Display config per status (label + colors), shared by staff + admin UI. */
export const STATUS_META: Record<StockStatus, { label: string }> = {
  out: { label: 'Out' },
  low: { label: 'Low' },
  in: { label: 'In' },
}

export interface SubmitStockSheetResult {
  ok: boolean
  request_id?: string
  line_count?: number
  error?: string
}

/** Bilingual labels for storage zones (EN / Thai), keyed by stored value. */
export const STORAGE_LABELS: Record<string, { en: string; th: string }> = {
  bar: { en: 'Bar', th: 'บาร์' },
  dry: { en: 'Dry', th: 'แห้ง' },
  fridge: { en: 'Fridge', th: 'ตู้เย็น' },
  freezer: { en: 'Freezer', th: 'แช่แข็ง' },
}

export const STORAGE_OPTIONS: StorageLocation[] = ['bar', 'dry', 'fridge', 'freezer']
