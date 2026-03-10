/** Format a number as Thai Baht with K/M suffixes */
export function formatTHB(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return `${v.toFixed(0)}`
}

export const CATEGORY_COLORS = [
  '#10b981', '#f59e0b', '#6366f1', '#ef4444', '#06b6d4',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
]

export const CURRENCY_OPTIONS = ['THB', 'USD', 'EUR', 'RUB', 'GBP', 'CNY', 'JPY']

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
]
