import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: () => Promise.resolve({ data: { ok: true }, error: null }) },
}))

describe('useCatalogImport', () => {
  it('exports the hook', async () => {
    const mod = await import('./useCatalogImport')
    expect(mod.useCatalogImport).toBeTypeOf('function')
  })
})

describe('toPayload', () => {
  it('drops nulls, undefined and empty strings', async () => {
    const { toPayload } = await import('./useCatalogImport')
    expect(
      toPayload([
        {
          name: 'Rice',
          sku: null,
          barcode: '',
          price: 320,
          package_qty: undefined,
          package_unit: null,
        },
      ]),
    ).toEqual([{ name: 'Rice', price: 320 }])
  })

  it('keeps a zero price — 0 is a value, not an absence', async () => {
    const { toPayload } = await import('./useCatalogImport')
    expect(toPayload([{ name: 'Sample', price: 0 }])).toEqual([{ name: 'Sample', price: 0 }])
  })

  it('never sends a conversion_factor that was not supplied (mig 388)', async () => {
    const { toPayload } = await import('./useCatalogImport')
    const [row] = toPayload([{ name: 'Rice', price: 320, conversion_factor: null }])
    expect('conversion_factor' in row).toBe(false)
  })
})
