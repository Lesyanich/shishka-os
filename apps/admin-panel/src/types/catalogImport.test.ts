import { describe, it, expect } from 'vitest'
import {
  buildImportRows,
  dedupeKey,
  detectDelimiter,
  parseCatalogText,
  parseMoney,
  parsePack,
} from './catalogImport'

describe('parseMoney', () => {
  it('reads the shapes a Thai price list actually uses', () => {
    expect(parseMoney('฿1,234.50')).toBe(1234.5)
    expect(parseMoney('฿ 320')).toBe(320)
    expect(parseMoney('320.-')).toBe(320)
    expect(parseMoney('1 234,50')).toBe(1234.5)
    expect(parseMoney('45 บาท')).toBe(45)
  })

  it('resolves the comma by position, not by hope', () => {
    // Comma + exactly three digits at the end is a thousands group…
    expect(parseMoney('1,234')).toBe(1234)
    // …anything else is a decimal separator.
    expect(parseMoney('1,50')).toBe(1.5)
  })

  it('returns null rather than a wrong number', () => {
    expect(parseMoney('')).toBeNull()
    expect(parseMoney(null)).toBeNull()
    expect(parseMoney('   ')).toBeNull()
    expect(parseMoney('call for price')).toBeNull()
    expect(parseMoney('สอบถาม')).toBeNull()
  })
})

describe('parsePack', () => {
  it('reads a pack size when the supplier stated one', () => {
    expect(parsePack('5 kg')).toEqual({ qty: 5, unit: 'kg' })
    expect(parsePack('500g')).toEqual({ qty: 500, unit: 'g' })
    expect(parsePack('1.5 L')).toEqual({ qty: 1.5, unit: 'l' })
    expect(parsePack('2 กก')).toEqual({ qty: 2, unit: 'kg' })
    expect(parsePack('1 ขวด')).toEqual({ qty: 1, unit: 'ขวด' })
  })

  it('multiplies N x M because both numbers are stated', () => {
    expect(parsePack('12x1L')).toEqual({ qty: 12, unit: 'l' })
    expect(parsePack('6 x 250ml')).toEqual({ qty: 1500, unit: 'ml' })
  })

  it('refuses to guess — no pack size beats an invented one (mig 388)', () => {
    expect(parsePack('5')).toBeNull() // a number with no unit
    expect(parsePack('assorted')).toBeNull()
    expect(parsePack('')).toBeNull()
    expect(parsePack(null)).toBeNull()
    expect(parsePack('approx 5-6 kg')).toBeNull()
  })
})

describe('detectDelimiter', () => {
  it('prefers tab — a Sheets paste is tab-separated and names contain commas', () => {
    expect(detectDelimiter('name\tprice\nRice, jasmine\t120')).toBe('\t')
  })
  it('falls back to comma, and to semicolon when it dominates', () => {
    expect(detectDelimiter('name,price\nRice,120')).toBe(',')
    expect(detectDelimiter('name;price\nRice;120')).toBe(';')
  })
})

describe('parseCatalogText', () => {
  it('maps English headers', () => {
    const p = parseCatalogText('Product Name\tSKU\tPrice\tPack size\nJasmine rice\tMK-1\t320\t5 kg')
    expect(p.headerIndex).toBe(0)
    expect(p.columns).toEqual(['name', 'sku', 'price', 'pack'])
  })

  it('maps Thai headers', () => {
    const p = parseCatalogText('ชื่อสินค้า\tรหัสสินค้า\tราคา\tขนาด\nข้าวหอมมะลิ\tMK-1\t320\t5 กก')
    expect(p.headerIndex).toBe(0)
    expect(p.columns).toEqual(['name', 'sku', 'price', 'pack'])
  })

  it('finds a header that is not the first line', () => {
    const p = parseCatalogText(
      'LAAD THAI PRICE LIST JULY 2026\nname\tprice\nJasmine rice\t320',
    )
    expect(p.headerIndex).toBe(1)
    expect(p.columns).toEqual(['name', 'price'])
  })

  it('guesses name and price when there is no header at all', () => {
    const p = parseCatalogText('Jasmine rice 5kg\t320\nSugar 1kg\t45\nSalt 1kg\t22')
    expect(p.headerIndex).toBe(-1)
    expect(p.columns).toEqual(['name', 'price'])
  })

  it('keeps the first of two columns claiming the same field', () => {
    const p = parseCatalogText('name\tprice\tprice\nRice\t320\t330')
    expect(p.columns).toEqual(['name', 'price', 'ignore'])
  })

  it('honours quoted CSV fields', () => {
    const p = parseCatalogText('name,price\n"Rice, jasmine, 5kg",320')
    const built = buildImportRows(p, p.columns)
    expect(built.rows[0].name).toBe('Rice, jasmine, 5kg')
    expect(built.rows[0].price).toBe(320)
  })
})

describe('buildImportRows', () => {
  const parse = (t: string) => {
    const p = parseCatalogText(t)
    return buildImportRows(p, p.columns)
  }

  it('drops blank lines without complaining about them', () => {
    const built = parse('name\tprice\nRice\t320\n\t\nSugar\t45')
    expect(built.rows).toHaveLength(2)
    expect(built.issues).toHaveLength(0)
  })

  it('flags a row with content but nothing to key on', () => {
    const built = parse('name\tprice\n\t320')
    expect(built.rows).toHaveLength(0)
    expect(built.issues[0].reason).toMatch(/no product name and no barcode/)
  })

  it('flags an unreadable price and still refuses to invent one', () => {
    const built = parse('name\tprice\nRice\tcall us')
    expect(built.rows).toHaveLength(1)
    expect(built.rows[0].price).toBeNull()
    expect(built.issues[0].reason).toMatch(/not a number/)
  })

  it('imports a row whose pack size is unreadable, with no pack size', () => {
    const built = parse('name\tprice\tpack\nRice\t320\tapprox 5-6 kg')
    expect(built.rows).toHaveLength(1)
    expect(built.rows[0].package_qty).toBeNull()
    expect(built.rows[0].package_unit).toBeNull()
    expect(built.issues[0].reason).toMatch(/no unit price/)
  })

  it('combines a separate quantity and unit column', () => {
    const p = parseCatalogText('name\tprice\tqty\tunit\nRice\t320\t5\tkg')
    const built = buildImportRows(p, p.columns)
    expect(built.rows[0].package_qty).toBe(5)
    expect(built.rows[0].package_unit).toBe('kg')
  })

  it('reports duplicate SKUs inside one paste', () => {
    const built = parse('name\tsku\tprice\nRice\tMK-1\t320\nRice again\tMK-1\t330')
    expect(built.rows).toHaveLength(2)
    expect(built.duplicateKeys).toEqual(['s:mk-1'])
  })
})

describe('dedupeKey', () => {
  it('follows the RPC precedence: barcode → sku → name', () => {
    expect(dedupeKey({ name: 'Rice', sku: 'MK-1', barcode: '8850' })).toBe('b:8850')
    expect(dedupeKey({ name: 'Rice', sku: 'MK-1' })).toBe('s:mk-1')
    expect(dedupeKey({ name: 'Rice' })).toBe('n:rice')
    expect(dedupeKey({ name: null })).toBeNull()
  })
})
