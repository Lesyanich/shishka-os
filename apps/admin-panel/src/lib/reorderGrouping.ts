// Reorder → draft PO grouping (Procurement Phase 3)
//
// fn_create_purchase_order needs ONE supplier per PO, but a buy-list spans many
// suppliers. These pure helpers bucket reorder lines by their resolved supplier
// (default_supplier_id → best supplier_catalog match → "Unassigned") and shape
// each bucket into a CreatePOPayload. Supplier resolution itself lives in the
// hook (it needs DB lookups); everything here is pure and unit-tested.

import type { CreatePOPayload, POLineInput } from '../types/procurement'

export interface ReorderLine {
  nomenclature_id: string
  name: string
  /** Quantity in the nomenclature's base_unit. */
  qty: number
  unit: string | null
  /** Resolved supplier; null → goes to the Unassigned bucket. */
  supplier_id: string | null
  supplier_name: string | null
}

export interface SupplierGroup {
  supplier_id: string
  supplier_name: string
  lines: ReorderLine[]
}

export interface GroupedReorder {
  groups: SupplierGroup[]
  /** Lines with no resolvable supplier — shown but not POable until assigned. */
  unassigned: ReorderLine[]
}

/** Bucket reorder lines by resolved supplier. Groups are sorted by supplier
 * name; unassigned lines (supplier_id == null) are collected separately. */
export function groupLinesBySupplier(lines: ReorderLine[]): GroupedReorder {
  const bySupplier = new Map<string, SupplierGroup>()
  const unassigned: ReorderLine[] = []

  for (const line of lines) {
    if (line.qty <= 0) continue
    if (!line.supplier_id) {
      unassigned.push(line)
      continue
    }
    const existing = bySupplier.get(line.supplier_id)
    if (existing) {
      existing.lines.push(line)
    } else {
      bySupplier.set(line.supplier_id, {
        supplier_id: line.supplier_id,
        supplier_name: line.supplier_name ?? 'Supplier',
        lines: [line],
      })
    }
  }

  const groups = Array.from(bySupplier.values()).sort((a, b) =>
    a.supplier_name.localeCompare(b.supplier_name),
  )
  return { groups, unassigned }
}

/** Shape one supplier group into a CreatePOPayload. unit_price_expected is
 * deliberately omitted so fn_create_purchase_order auto-prices each line from
 * supplier_catalog. Qty is passed through in base_unit (no pack conversion in
 * v1 — the supplier-pack round-trip is a documented follow-up). */
export function toCreatePOPayload(
  group: SupplierGroup,
  opts: { expectedDate?: string | null; notes?: string | null } = {},
): CreatePOPayload {
  const lines: POLineInput[] = group.lines.map((l) => ({
    nomenclature_id: l.nomenclature_id,
    qty_ordered: l.qty,
    unit: l.unit ?? undefined,
  }))
  return {
    supplier_id: group.supplier_id,
    expected_date: opts.expectedDate ?? null,
    notes: opts.notes ?? null,
    lines,
  }
}
