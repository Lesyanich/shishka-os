// ═══════════════════════════════════════════════════════════
// Shared waste recording — single source of truth for write-offs.
// Used by useWasteLog (manual form) and useExpiringBatches (expiry one-tap).
//
// recordWaste():
//   1. inserts a waste_logs row (audit + financial liability)
//   2. FIFO-decrements sku_balances (oldest received first)
// Negative stock for purchased SKUs is clamped at 0. Items without any
// sku_balances rows (e.g. PF batches) just skip the decrement — the
// waste_logs row is still the meaningful record.
// ═══════════════════════════════════════════════════════════

import { supabase } from './supabase'

export type WasteReason = 'expiration' | 'spillage_damage' | 'quality_reject' | 'rd_testing'
export type FinancialLiability = 'cafe' | 'employee' | 'supplier'

export const WASTE_REASON_LABELS: Record<WasteReason, string> = {
  expiration: 'Expiration',
  spillage_damage: 'Spillage / Damage',
  quality_reject: 'Quality Reject',
  rd_testing: 'R&D Testing',
}

export const LIABILITY_LABELS: Record<FinancialLiability, string> = {
  cafe: 'Cafe (business expense)',
  employee: 'Employee',
  supplier: 'Supplier',
}

export interface WasteEntryInput {
  nomenclature_id: string
  quantity: number
  reason: WasteReason
  financial_liability: FinancialLiability
  comment: string | null
  /** Optional staff id (logged_by). Nullable in the DB; omitted by the manual form. */
  logged_by?: string | null
}

export async function recordWaste(
  entry: WasteEntryInput,
): Promise<{ ok: boolean; error?: string }> {
  const { logged_by, ...row } = entry

  const { error: insertError } = await supabase
    .from('waste_logs')
    .insert(logged_by ? { ...row, logged_by } : row)

  if (insertError) {
    return { ok: false, error: insertError.message }
  }

  // FIFO: oldest received first
  let remaining = entry.quantity
  const { data: skuBalances } = await supabase
    .from('sku_balances')
    .select('sku_id, quantity')
    .eq('nomenclature_id', entry.nomenclature_id)
    .order('last_received_at', { ascending: true, nullsFirst: true })

  for (const bal of skuBalances ?? []) {
    if (remaining <= 0) break
    const deduct = Math.min(remaining, Number(bal.quantity))
    const newQty = Math.max(0, Number(bal.quantity) - deduct)
    await supabase
      .from('sku_balances')
      .update({ quantity: newQty })
      .eq('sku_id', bal.sku_id)
    remaining -= deduct
  }

  return { ok: true }
}
