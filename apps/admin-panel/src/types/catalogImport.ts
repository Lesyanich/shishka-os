/**
 * Supplier catalog import — types and the pure parser (mig 394).
 *
 * A supplier price list arrives as a paste out of LINE/WhatsApp/Sheets or as a
 * CSV. Everything in this file is pure and DB-free so the parsing can be tested
 * without a database; the only thing the hook adds is the RPC call.
 *
 * The parser's guiding rule matches the RPC's: it would rather return NOTHING
 * than a guess. A pack cell it cannot read confidently yields no pack size at
 * all, because migration 388 exists precisely because an assumed pack size
 * silently produced wrong unit prices.
 */

/** The 5-value `source` vocabulary enforced by supplier_catalog_source_check. */
export type CatalogSource = 'quote' | 'receipt' | 'scrape' | 'pricelist' | 'manual'

export const CATALOG_SOURCES: CatalogSource[] = [
  'pricelist',
  'quote',
  'receipt',
  'scrape',
  'manual',
]

export const SOURCE_LABELS: Record<CatalogSource, string> = {
  pricelist: 'Price list',
  quote: 'Quote',
  receipt: 'Receipt',
  scrape: 'Scraped',
  manual: 'Typed in',
}

/** One row of the jsonb payload handed to fn_import_supplier_catalog. */
export interface CatalogImportRow {
  /** The supplier's own name for the product. Required unless a barcode exists. */
  name: string | null
  name_en?: string | null
  name_th?: string | null
  sku?: string | null
  barcode?: string | null
  price?: number | null
  package_qty?: number | null
  package_unit?: string | null
  purchase_unit?: string | null
  /** Base units per purchase unit. OMITTED when unknown — never defaulted to 1. */
  conversion_factor?: number | null
  brand?: string | null
  external_url?: string | null
  image_url?: string | null
  nomenclature_id?: string | null
}

/** What fn_import_supplier_catalog returns. */
export interface CatalogImportResult {
  ok: boolean
  error?: string
  dry_run?: boolean
  supplier_id?: string | null
  supplier_created?: boolean
  supplier_would_be_created?: boolean
  source?: CatalogSource
  received?: number
  inserted?: number
  updated?: number
  skipped?: number
  duplicates_in_payload?: number
  unlinked?: number
  pack_unknown?: number
  linked_by_barcode?: number
  errors?: { row: number; name: string | null; reason: string }[]
  /** How many further errors were not returned (the list is capped at 50). */
  errors_omitted?: number
  /** Per-row classification. Dry run only, capped at 200 entries. */
  rows?: PreviewRow[]
}

/** One line's verdict from a dry run — `row` is 1-based over the payload. */
export interface PreviewRow {
  row: number
  status: 'new' | 'update'
  linked: boolean
  pack_known: boolean
}

/** The fields a pasted table can map onto. */
export type CatalogField =
  | 'name'
  | 'sku'
  | 'barcode'
  | 'price'
  | 'pack'
  | 'package_unit'
  | 'brand'
  | 'ignore'

export const FIELD_LABELS: Record<CatalogField, string> = {
  name: 'Product name',
  sku: 'Supplier SKU',
  barcode: 'Barcode',
  price: 'Price',
  pack: 'Pack size',
  package_unit: 'Pack unit',
  brand: 'Brand',
  ignore: '— ignore —',
}

/** Column index → field. Index is the position in the parsed table. */
export type ColumnMap = CatalogField[]

/** A problem with one input row, surfaced before anything is sent to the DB. */
export interface RowIssue {
  /** 1-based, counted over data rows as the user sees them. */
  row: number
  reason: string
}

export interface ParsedCatalog {
  /** Every cell, header row included when one was detected. */
  table: string[][]
  /** Index into `table` of the detected header row, or -1 when there is none. */
  headerIndex: number
  /** Auto-detected mapping — the user may override it before importing. */
  columns: ColumnMap
}

// ---------------------------------------------------------------------------
// Delimited text
// ---------------------------------------------------------------------------

/**
 * Split one CSV/TSV line, honouring double quotes ("" is an escaped quote).
 * Written by hand rather than pulled in as a dependency: the input is a
 * clipboard paste, not RFC-4180 in anger, and a new npm package needs a
 * discussion (apps/admin-panel/CLAUDE.md).
 */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === delimiter) {
      out.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur.trim())
  return out
}

/**
 * Tab wins when present: a paste out of Sheets or Excel is tab-separated, and
 * product names routinely contain commas ("Rice, jasmine, 5kg").
 */
export function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5)
  if (firstLines.some((l) => l.includes('\t'))) return '\t'
  const semis = firstLines.filter((l) => l.includes(';')).length
  const commas = firstLines.filter((l) => l.includes(',')).length
  if (semis > commas) return ';'
  return ','
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/**
 * "฿1,234.50" · "1 234,50" · "320.-" · "฿ 320" → 1234.5 / 1234.5 / 320 / 320
 *
 * Thousand-separator ambiguity is resolved by position: a comma followed by
 * exactly three digits at the end of the number is a group separator, anything
 * else is a decimal point. "1,234" is 1234; "1,50" is 1.5.
 */
export function parseMoney(raw: string | null | undefined): number | null {
  if (raw == null) return null
  let s = String(raw).trim()
  if (!s) return null
  // Currency marks, Thai baht word, spaces (incl. non-breaking), trailing ".-"
  s = s
    .replace(/[฿$€£]/g, '')
    .replace(/บาท/g, '')
    .replace(/[\s\u00A0\u202F]/g, '')
    .replace(/\.-$/, '')
    .replace(/[-–]$/, '')
  if (!s) return null
  if (!/[0-9]/.test(s)) return null

  const hasDot = s.includes('.')
  const hasComma = s.includes(',')
  if (hasDot && hasComma) {
    // Whichever comes last is the decimal separator.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (hasComma) {
    s = /,\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  }

  s = s.replace(/[^0-9.-]/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// ---------------------------------------------------------------------------
// Pack sizes
// ---------------------------------------------------------------------------

const UNIT_ALIASES: Record<string, string> = {
  kg: 'kg',
  kgs: 'kg',
  kilo: 'kg',
  kilogram: 'kg',
  กก: 'kg',
  กิโลกรัม: 'kg',
  g: 'g',
  gr: 'g',
  gram: 'g',
  grams: 'g',
  กรัม: 'g',
  l: 'l',
  lt: 'l',
  ltr: 'l',
  liter: 'l',
  litre: 'l',
  ลิตร: 'l',
  ml: 'ml',
  มล: 'ml',
  pcs: 'pcs',
  pc: 'pcs',
  piece: 'pcs',
  pieces: 'pcs',
  ชิ้น: 'pcs',
  pack: 'pack',
  แพ็ค: 'pack',
  ขวด: 'ขวด',
  ถุง: 'ถุง',
}

function normalizeUnit(raw: string): string | null {
  const u = raw.trim().toLowerCase().replace(/\.$/, '')
  if (!u) return null
  return UNIT_ALIASES[u] ?? u
}

/**
 * "5 kg" → 5 kg · "500g" → 500 g · "12x1L" → 12 l · "1 ขวด" → 1 ขวด
 *
 * `12x1L` is read as twelve one-litre units, i.e. 12 l in total — arithmetic on
 * two numbers the supplier wrote down, not a guess. Anything that does not
 * match returns null, and the row then imports with NO pack size rather than an
 * invented one.
 */
export function parsePack(
  raw: string | null | undefined,
): { qty: number; unit: string } | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null

  // N x M unit
  const multi = s.match(/^(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z฀-๿.]+)$/)
  if (multi) {
    const a = parseMoney(multi[1])
    const b = parseMoney(multi[2])
    const unit = normalizeUnit(multi[3])
    if (a != null && b != null && unit && a > 0 && b > 0) {
      return { qty: Number((a * b).toFixed(4)), unit }
    }
    return null
  }

  const single = s.match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Z฀-๿.]*)$/)
  if (single) {
    const qty = parseMoney(single[1])
    const unit = normalizeUnit(single[2] ?? '')
    if (qty != null && qty > 0 && unit) return { qty, unit }
    return null
  }
  return null
}

// ---------------------------------------------------------------------------
// Header detection
// ---------------------------------------------------------------------------

const HEADER_SYNONYMS: { field: CatalogField; words: string[] }[] = [
  {
    field: 'barcode',
    words: ['barcode', 'ean', 'upc', 'บาร์โค้ด', 'รหัสบาร์โค้ด'],
  },
  {
    field: 'sku',
    words: ['sku', 'code', 'item code', 'product code', 'art', 'รหัส', 'รหัสสินค้า'],
  },
  {
    field: 'price',
    words: ['price', 'unit price', 'cost', 'amount', 'baht', 'thb', 'ราคา', 'ราคาต่อหน่วย', 'บาท'],
  },
  {
    field: 'pack',
    words: ['pack', 'pack size', 'size', 'weight', 'qty', 'quantity', 'ขนาด', 'น้ำหนัก', 'บรรจุ'],
  },
  { field: 'package_unit', words: ['unit', 'uom', 'หน่วย'] },
  { field: 'brand', words: ['brand', 'ยี่ห้อ', 'แบรนด์'] },
  {
    field: 'name',
    words: ['name', 'product', 'product name', 'item', 'description', 'ชื่อ', 'ชื่อสินค้า', 'สินค้า', 'รายการ'],
  },
]

function fieldForHeader(cell: string): CatalogField | null {
  const c = cell.trim().toLowerCase()
  if (!c) return null
  for (const { field, words } of HEADER_SYNONYMS) {
    if (words.some((w) => c === w)) return field
  }
  for (const { field, words } of HEADER_SYNONYMS) {
    if (words.some((w) => c.includes(w))) return field
  }
  return null
}

/** A row is a header when at least two of its cells name a known field. */
function looksLikeHeader(cells: string[]): boolean {
  const hits = cells.filter((c) => fieldForHeader(c) !== null).length
  return hits >= 2
}

/**
 * Fallback for a list with no header at all: the widest text column is the
 * name, the column that parses as money most often is the price.
 */
function guessColumns(rows: string[][], width: number): ColumnMap {
  const map: ColumnMap = new Array(width).fill('ignore')
  const moneyHits = new Array(width).fill(0)
  const textLen = new Array(width).fill(0)
  for (const r of rows) {
    for (let i = 0; i < width; i++) {
      const cell = r[i] ?? ''
      if (cell && parseMoney(cell) != null && /^[฿\s\u00A0]*[\d.,]+/.test(cell.trim())) {
        moneyHits[i]++
      }
      if (/[^\d.,฿\s]/.test(cell)) textLen[i] += cell.length
    }
  }
  const nameIdx = textLen.indexOf(Math.max(...textLen))
  if (Math.max(...textLen) > 0) map[nameIdx] = 'name'
  let priceIdx = -1
  let best = 0
  for (let i = 0; i < width; i++) {
    if (i === nameIdx) continue
    if (moneyHits[i] > best) {
      best = moneyHits[i]
      priceIdx = i
    }
  }
  if (priceIdx >= 0 && best > 0) map[priceIdx] = 'price'
  return map
}

/**
 * Parse pasted or uploaded text into a table plus a best-guess column mapping.
 * The mapping is a suggestion — auto-detection the user cannot correct is how a
 * price column silently becomes a weight column.
 */
export function parseCatalogText(text: string): ParsedCatalog {
  const delimiter = detectDelimiter(text)
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
  const table = lines.map((l) => splitLine(l, delimiter))
  if (table.length === 0) return { table: [], headerIndex: -1, columns: [] }

  const width = Math.max(...table.map((r) => r.length))
  for (const r of table) while (r.length < width) r.push('')

  // The header need not be row 1 — price lists often open with a title line.
  let headerIndex = -1
  for (let i = 0; i < Math.min(table.length, 5); i++) {
    if (looksLikeHeader(table[i])) {
      headerIndex = i
      break
    }
  }

  let columns: ColumnMap
  if (headerIndex >= 0) {
    columns = table[headerIndex].map((c) => fieldForHeader(c) ?? 'ignore')
    // Two columns claiming the same field: keep the first, ignore the rest.
    const seen = new Set<CatalogField>()
    columns = columns.map((f) => {
      if (f === 'ignore') return f
      if (seen.has(f)) return 'ignore'
      seen.add(f)
      return f
    })
  } else {
    columns = guessColumns(table, width)
  }

  return { table, headerIndex, columns }
}

// ---------------------------------------------------------------------------
// Rows for the RPC
// ---------------------------------------------------------------------------

export interface BuiltRows {
  rows: CatalogImportRow[]
  issues: RowIssue[]
  /** Dedupe keys that appear more than once in this paste. */
  duplicateKeys: string[]
}

/**
 * Mirrors the RPC's precedence exactly: barcode → sku → normalized name. Kept
 * here so the preview can flag a duplicated paste before the DB has to.
 */
export function dedupeKey(row: CatalogImportRow): string | null {
  if (row.barcode) return `b:${row.barcode.trim().toLowerCase()}`
  if (row.sku) return `s:${row.sku.trim().toLowerCase()}`
  if (row.name) return `n:${row.name.trim().toLowerCase()}`
  return null
}

/** Turn the mapped table into the payload, dropping rows that cannot be keyed. */
export function buildImportRows(parsed: ParsedCatalog, columns: ColumnMap): BuiltRows {
  const rows: CatalogImportRow[] = []
  const issues: RowIssue[] = []
  const counts = new Map<string, number>()

  const dataRows = parsed.table.filter((_, i) => i !== parsed.headerIndex)

  dataRows.forEach((cells, i) => {
    const at = (f: CatalogField): string => {
      const idx = columns.indexOf(f)
      return idx >= 0 ? (cells[idx] ?? '').trim() : ''
    }

    const name = at('name')
    const barcode = at('barcode')
    const sku = at('sku')

    if (!name && !barcode) {
      // Silent skip for a genuinely blank line; an issue for a line that has
      // content but nothing we can key on.
      if (cells.some((c) => c.trim())) {
        issues.push({ row: i + 1, reason: 'no product name and no barcode' })
      }
      return
    }

    const priceCell = at('price')
    const price = priceCell ? parseMoney(priceCell) : null
    if (priceCell && price == null) {
      issues.push({ row: i + 1, reason: `price "${priceCell}" is not a number` })
    }

    const packCell = at('pack')
    const unitCell = at('package_unit')
    let pack = packCell ? parsePack(packCell) : null
    if (!pack && packCell && unitCell) {
      const qty = parseMoney(packCell)
      const unit = normalizeUnit(unitCell)
      if (qty != null && qty > 0 && unit) pack = { qty, unit }
    }
    if (packCell && !pack) {
      // Not an error — the row still imports, just without a comparable unit
      // price. Saying so is the whole point of migration 388.
      issues.push({ row: i + 1, reason: `pack size "${packCell}" not understood — no unit price` })
    }

    const row: CatalogImportRow = {
      name: name || null,
      sku: sku || null,
      barcode: barcode || null,
      price,
      package_qty: pack?.qty ?? null,
      package_unit: pack?.unit ?? null,
      brand: at('brand') || null,
    }

    const key = dedupeKey(row)
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
    rows.push(row)
  })

  const duplicateKeys = [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k)
  return { rows, issues, duplicateKeys }
}
