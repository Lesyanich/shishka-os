/** Parse free-text expense input into structured hints for receipt_inbox */

export interface QuickExpenseResult {
  supplier_hint: string | null
  amount_hint: number | null
  receipt_date: string // YYYY-MM-DD
  raw_text: string
}

// Known supplier aliases → canonical English name
const SUPPLIER_ALIASES: [RegExp, string][] = [
  [/(makro|макро|мак(?:\s|$))/i, 'SIAM MAKRO'],
  [/(lotus|лотус|โลตัส)/i, 'Lotus'],
  [/(big\s*c|биг\s*с)/i, 'Big C'],
  [/(tops|топс)/i, 'Tops'],
  [/(villa|вилла)/i, 'Villa Market'],
  [/(7.?11|seven|севен)/i, '7-Eleven'],
  [/(вод[аы]|water)/i, 'Water Delivery'],
  [/(лёд|льд|ice)/i, 'Ice Supplier'],
  [/(газ|gas|lpg)/i, 'Gas Supplier'],
  [/(рынок|market|ตลาด)/i, 'Local Market'],
  [/(прачечная|laundry|ซัก)/i, 'Laundry Service'],
  [/(grab)/i, 'Grab'],
  [/(line\s*man|lineman)/i, 'LINE MAN'],
  [/(homepro|хоум\s*про)/i, 'HomePro'],
  [/(watsadu|ватсаду|thai\s*watsadu)/i, 'Thai Watsadu'],
  [/(baan.*beyond)/i, 'Baan & Beyond'],
]

// Amount patterns: "3500", "3,500", "3500 бат", "฿3500", "3500 baht", "3500 thb"
const AMOUNT_RE = /(?:฿\s*)?(\d[\d,]*(?:\.\d{1,2})?)\s*(?:бат|baht|thb|บาท|฿)?/i

// Date patterns
const DATE_PATTERNS: [RegExp, () => string][] = [
  [/(сегодня|today|วันนี้)/i, () => toISO(new Date())],
  [/(вчера|yesterday|เมื่อวาน)/i, () => { const d = new Date(); d.setDate(d.getDate() - 1); return toISO(d) }],
  [/(позавчера)/i, () => { const d = new Date(); d.setDate(d.getDate() - 2); return toISO(d) }],
  // DD/MM or DD.MM
  [/\b(\d{1,2})[./](\d{1,2})\b/, (m) => {
    const day = parseInt(m[1])
    const month = parseInt(m[2])
    const year = new Date().getFullYear()
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
    return toISO(new Date())
  }],
]

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function parseQuickExpense(text: string): QuickExpenseResult {
  const raw = text.trim()
  let remaining = raw

  // 1. Extract amount
  let amount_hint: number | null = null
  const amountMatch = remaining.match(AMOUNT_RE)
  if (amountMatch) {
    amount_hint = parseFloat(amountMatch[1].replace(/,/g, ''))
    remaining = remaining.replace(amountMatch[0], ' ')
  }

  // 2. Extract date
  let receipt_date = toISO(new Date())
  for (const [pattern, resolver] of DATE_PATTERNS) {
    const m = remaining.match(pattern)
    if (m) {
      receipt_date = typeof resolver === 'function'
        ? (resolver as (m: RegExpMatchArray) => string)(m)
        : resolver()
      remaining = remaining.replace(m[0], ' ')
      break
    }
  }

  // 3. Match supplier
  let supplier_hint: string | null = null
  for (const [pattern, name] of SUPPLIER_ALIASES) {
    if (pattern.test(remaining)) {
      supplier_hint = name
      remaining = remaining.replace(pattern, ' ')
      break
    }
  }

  // 4. If no known supplier matched, use cleaned remaining text as supplier hint
  if (!supplier_hint) {
    const cleaned = remaining.replace(/\s+/g, ' ').trim()
    if (cleaned.length >= 2) {
      supplier_hint = cleaned
    }
  }

  return { supplier_hint, amount_hint, receipt_date, raw_text: raw }
}
