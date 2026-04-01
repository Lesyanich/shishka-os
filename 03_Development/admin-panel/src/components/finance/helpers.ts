/** Format a number as Thai Baht with K/M suffixes */
export function formatTHB(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return `${v.toFixed(0)}`
}

/** Format Thai Baht with full precision (no abbreviation), thousands separator, no decimals */
export function formatTHBFull(v: number) {
  return Math.round(v).toLocaleString('en-US')
}

export const CATEGORY_COLORS = [
  '#10b981', '#f59e0b', '#6366f1', '#ef4444', '#06b6d4',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
]

export const CURRENCY_OPTIONS = ['THB', 'USD', 'EUR', 'RUB', 'GBP', 'CNY', 'JPY', 'AED']

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
]

/* ── Weight parsing & net weight display ── */

export interface ParsedWeight {
  value: number
  unit: 'g' | 'kg' | 'ml' | 'L'
}

/**
 * Parse a normalized weight string into numeric value + metric unit.
 * Handles: "100 g", "1.5 kg", "500 ml", "2 L", "100g" (with/without space).
 * Returns null for non-metric strings like "1 pack", "3 pcs", empty, etc.
 */
export function parseWeight(str: string | undefined | null): ParsedWeight | null {
  if (!str) return null
  const m = str.trim().match(/^([\d]+(?:[.,]\d+)?)\s*(g|kg|ml|l)$/i)
  if (!m) return null
  const value = parseFloat(m[1].replace(',', '.'))
  if (isNaN(value) || value <= 0) return null
  const raw = m[2].toLowerCase()
  const unit: ParsedWeight['unit'] = raw === 'l' ? 'L' : (raw as 'g' | 'kg' | 'ml')
  return { value, unit }
}

/**
 * Format net weight with auto-normalization:
 * 1500 g → "1.5 kg", 400 g → "400 g", 2000 ml → "2.0 L"
 */
export function formatNetWeight(totalValue: number, unit: ParsedWeight['unit']): string {
  if (unit === 'g' || unit === 'kg') {
    const grams = unit === 'kg' ? totalValue * 1000 : totalValue
    if (grams >= 1000) return `${(grams / 1000).toFixed(1)} kg`
    return `${Math.round(grams)} g`
  }
  if (unit === 'ml' || unit === 'L') {
    const ml = unit === 'L' ? totalValue * 1000 : totalValue
    if (ml >= 1000) return `${(ml / 1000).toFixed(1)} L`
    return `${Math.round(ml)} ml`
  }
  return `${totalValue} ${unit}`
}
