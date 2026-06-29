import { describe, it, expect } from 'vitest'
import { groupLinesBySupplier, toCreatePOPayload, type ReorderLine } from './reorderGrouping'

function line(p: Partial<ReorderLine>): ReorderLine {
  return {
    nomenclature_id: 'n', name: 'Item', qty: 1, unit: 'kg',
    supplier_id: null, supplier_name: null, ...p,
  }
}

describe('groupLinesBySupplier', () => {
  it('buckets lines by supplier and collects unassigned', () => {
    const { groups, unassigned } = groupLinesBySupplier([
      line({ nomenclature_id: 'a', supplier_id: 's1', supplier_name: 'Makro' }),
      line({ nomenclature_id: 'b', supplier_id: 's1', supplier_name: 'Makro' }),
      line({ nomenclature_id: 'c', supplier_id: 's2', supplier_name: 'DOY' }),
      line({ nomenclature_id: 'd', supplier_id: null }),
    ])
    expect(groups).toHaveLength(2)
    // sorted by supplier name: DOY before Makro
    expect(groups[0].supplier_name).toBe('DOY')
    expect(groups[1].lines).toHaveLength(2)
    expect(unassigned).toHaveLength(1)
    expect(unassigned[0].nomenclature_id).toBe('d')
  })

  it('drops non-positive quantities', () => {
    const { groups, unassigned } = groupLinesBySupplier([
      line({ supplier_id: 's1', supplier_name: 'Makro', qty: 0 }),
      line({ supplier_id: null, qty: -2 }),
    ])
    expect(groups).toHaveLength(0)
    expect(unassigned).toHaveLength(0)
  })
})

describe('toCreatePOPayload', () => {
  it('maps a group to a PO payload without prices (auto-priced by RPC)', () => {
    const payload = toCreatePOPayload(
      {
        supplier_id: 's1',
        supplier_name: 'Makro',
        lines: [line({ nomenclature_id: 'a', qty: 3, unit: 'kg', supplier_id: 's1' })],
      },
      { notes: 'Reorder' },
    )
    expect(payload.supplier_id).toBe('s1')
    expect(payload.notes).toBe('Reorder')
    expect(payload.lines).toEqual([{ nomenclature_id: 'a', qty_ordered: 3, unit: 'kg' }])
    expect(payload.lines[0]).not.toHaveProperty('unit_price_expected')
  })
})
