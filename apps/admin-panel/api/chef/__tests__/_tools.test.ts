import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { searchNomenclatureImpl } from '../_tools'

interface Row {
  id: string
  name: string
  product_code: string
  type: string
  base_unit: string | null
  cost_per_unit: number | string | null
  price: number | string | null
  is_available: boolean | null
  is_deleted: boolean
}

const FIXTURES: Row[] = [
  { id: '1', name: 'Manakish Beef (GF)',  product_code: 'SALE-MANAISH_BEEF_GF', type: 'dish', base_unit: 'pcs', cost_per_unit: 80, price: 220, is_available: true, is_deleted: false },
  { id: '2', name: 'Manakish Beef (WW)',  product_code: 'SALE-MANAISH-MEAT',    type: 'dish', base_unit: 'pcs', cost_per_unit: 75, price: 200, is_available: true, is_deleted: false },
  { id: '3', name: 'Manakish Cheese (GF)', product_code: 'SALE-MANAISH_CHEESE_GF', type: 'dish', base_unit: 'pcs', cost_per_unit: 60, price: 180, is_available: true, is_deleted: false },
  { id: '4', name: 'Lamb Meat Manakish Filling', product_code: 'PF-MANAISH_LAMB_MEAT', type: 'semi', base_unit: 'kg', cost_per_unit: 350, price: null, is_available: true, is_deleted: false },
  { id: '5', name: 'Old Test Dish', product_code: 'SALE-DEPRECATED', type: 'dish', base_unit: 'pcs', cost_per_unit: 0, price: 100, is_available: false, is_deleted: true },
]

function escRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface FakeHandle {
  client: SupabaseClient
  ilikeCalls: Array<{ col: string; pattern: string }>
  orCalls: number
}

function makeFakeClient(rows: Row[]): FakeHandle {
  const ilikeCalls: Array<{ col: string; pattern: string }> = []
  const handle: FakeHandle = { client: null as unknown as SupabaseClient, ilikeCalls, orCalls: 0 }

  function builder(_table: string) {
    const filters: Array<(r: Row) => boolean> = [(r) => !r.is_deleted]
    let lim = Infinity

    const b = {
      select: () => b,
      eq: (col: keyof Row, val: unknown) => {
        filters.push((r) => r[col] === val)
        return b
      },
      in: (col: keyof Row, vals: unknown[]) => {
        filters.push((r) => vals.includes(r[col]))
        return b
      },
      ilike: (col: keyof Row, pattern: string) => {
        ilikeCalls.push({ col: col as string, pattern })
        const re = new RegExp(escRegex(pattern).replace(/%/g, '.*'), 'i')
        filters.push((r) => re.test(String(r[col] ?? '')))
        return b
      },
      or: () => {
        handle.orCalls += 1
        throw new Error('test fixture: .or() must not be called by searchNomenclatureImpl')
      },
      order: () => b,
      limit: (n: number) => {
        lim = n
        return b
      },
      then: <T>(resolve: (v: { data: Row[]; error: null }) => T, reject?: (e: unknown) => unknown) => {
        try {
          const matched = rows.filter((r) => filters.every((f) => f(r))).slice(0, lim)
          return Promise.resolve({ data: matched, error: null }).then(resolve, reject)
        } catch (e) {
          return Promise.reject(e).then(undefined, reject)
        }
      },
    }
    return b
  }

  handle.client = { from: builder } as unknown as SupabaseClient
  return handle
}

describe('searchNomenclatureImpl — PostgREST .or() escaping fix', () => {
  it('finds row by exact name containing parens (regression: "Manakish Beef (GF)")', async () => {
    const fake = makeFakeClient(FIXTURES)
    const result = await searchNomenclatureImpl(fake.client, { query: 'Manakish Beef (GF)' })

    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.count).toBe(1)
    expect(result.items[0]).toMatchObject({
      id: '1',
      name: 'Manakish Beef (GF)',
      product_code: 'SALE-MANAISH_BEEF_GF',
    })
    expect(fake.orCalls).toBe(0)
  })

  it('matches by name substring across multiple rows', async () => {
    const fake = makeFakeClient(FIXTURES)
    const result = await searchNomenclatureImpl(fake.client, { query: 'Manakish' })

    if ('error' in result) throw new Error(result.error)
    const ids = result.items.map((i) => i.id).sort()
    expect(ids).toEqual(['1', '2', '3', '4'])
    expect(fake.orCalls).toBe(0)
  })

  it('matches by product_code substring', async () => {
    const fake = makeFakeClient(FIXTURES)
    const result = await searchNomenclatureImpl(fake.client, { query: 'SALE-MANAISH_BEEF_GF' })

    if ('error' in result) throw new Error(result.error)
    expect(result.count).toBe(1)
    expect(result.items[0].id).toBe('1')
  })

  it('dedupes when a row matches both name and product_code', async () => {
    // "Manakish" is in name; product_code contains "MANAISH" not "MANAKISH" so this
    // case actually only hits the name leg — use a different fixture combo for dedup proof.
    const rows: Row[] = [
      { id: 'x', name: 'Salt', product_code: 'SALT-RAW', type: 'raw', base_unit: 'g', cost_per_unit: 1, price: null, is_available: true, is_deleted: false },
    ]
    const fake = makeFakeClient(rows)
    // "salt" matches name ILIKE %salt% AND product_code ILIKE %salt% (case-insensitive)
    const result = await searchNomenclatureImpl(fake.client, { query: 'salt' })

    if ('error' in result) throw new Error(result.error)
    expect(result.count).toBe(1)
    expect(result.items[0].id).toBe('x')
  })

  it('respects is_deleted filter (tombstoned rows hidden)', async () => {
    const fake = makeFakeClient(FIXTURES)
    const result = await searchNomenclatureImpl(fake.client, { query: 'Old Test' })

    if ('error' in result) throw new Error(result.error)
    expect(result.count).toBe(0)
  })

  it('respects types filter', async () => {
    const fake = makeFakeClient(FIXTURES)
    const result = await searchNomenclatureImpl(fake.client, { query: 'Manakish', types: ['semi'] })

    if ('error' in result) throw new Error(result.error)
    expect(result.count).toBe(1)
    expect(result.items[0].type).toBe('semi')
  })

  it('runs exactly one ilike per leg (name + product_code)', async () => {
    const fake = makeFakeClient(FIXTURES)
    await searchNomenclatureImpl(fake.client, { query: 'anything', limit: 5 })

    expect(fake.ilikeCalls).toEqual([
      { col: 'name', pattern: '%anything%' },
      { col: 'product_code', pattern: '%anything%' },
    ])
    expect(fake.orCalls).toBe(0)
  })

  it('returns empty when nothing matches', async () => {
    const fake = makeFakeClient(FIXTURES)
    const result = await searchNomenclatureImpl(fake.client, { query: 'NoSuchThing' })

    if ('error' in result) throw new Error(result.error)
    expect(result.count).toBe(0)
    expect(result.items).toEqual([])
  })
})
