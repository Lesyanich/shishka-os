import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Phase 3 (MC 38911fde): per-option editing inside a modifier group.
// - cost link: option -> MOD-* nomenclature + portion (modifier_option_cost). OURS,
//   immediate, no Loyverse side-effects. cost = MOD.cost_per_unit * quantity_per_unit.
// - staged price: admin's desired selling price (modifier_option_overrides). Pending
//   the Phase 5 push to Loyverse (editing price in Loyverse detaches items, so it is
//   staged here and applied last, with re-attach, by the orchestrated push).

export interface ModOption {
  id: string
  product_code: string
  name: string
  cost_per_unit: number | null
}

export interface OptionCostLink {
  modifier_id: string
  quantity_per_unit: number
  modifier_code: string
  modifier_name: string
  modifier_cost_per_unit: number | null
}

type RawCostRow = {
  loyverse_modifier_option_id: string
  modifier_id: string
  quantity_per_unit: number
  modifier:
    | { id: string; product_code: string; name: string; cost_per_unit: number | null }
    | { id: string; product_code: string; name: string; cost_per_unit: number | null }[]
    | null
}
type RawOverride = { loyverse_modifier_option_id: string; price: number }

function resolveMod(rel: RawCostRow['modifier']) {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

export function useModifierOptionEditing() {
  const [costByOptionId, setCostByOptionId] = useState<Record<string, OptionCostLink>>({})
  const [priceByOptionId, setPriceByOptionId] = useState<Record<string, number>>({})
  const [mods, setMods] = useState<ModOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    const [costRes, overrideRes, modRes] = await Promise.all([
      supabase
        .from('modifier_option_cost')
        .select(
          `loyverse_modifier_option_id, modifier_id, quantity_per_unit,
           modifier:modifier_id ( id, product_code, name, cost_per_unit )`,
        ),
      supabase.from('modifier_option_overrides').select('loyverse_modifier_option_id, price'),
      supabase
        .from('nomenclature')
        .select('id, product_code, name, cost_per_unit')
        .like('product_code', 'MOD-%')
        .order('product_code'),
    ])

    const firstErr = costRes.error ?? overrideRes.error ?? modRes.error
    setError(firstErr ? firstErr.message : null)

    const costMap: Record<string, OptionCostLink> = {}
    for (const r of (costRes.data ?? []) as RawCostRow[]) {
      const mod = resolveMod(r.modifier)
      if (!mod) continue
      costMap[r.loyverse_modifier_option_id] = {
        modifier_id: r.modifier_id,
        quantity_per_unit: Number(r.quantity_per_unit),
        modifier_code: mod.product_code,
        modifier_name: mod.name,
        modifier_cost_per_unit: mod.cost_per_unit != null ? Number(mod.cost_per_unit) : null,
      }
    }
    setCostByOptionId(costMap)

    const priceMap: Record<string, number> = {}
    for (const r of (overrideRes.data ?? []) as RawOverride[]) {
      priceMap[r.loyverse_modifier_option_id] = Number(r.price)
    }
    setPriceByOptionId(priceMap)
    setMods((modRes.data ?? []) as ModOption[])
    setIsLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const upsertCost = useCallback(
    async (optionId: string, modifierId: string, quantityPerUnit: number) => {
      const { error: err } = await supabase
        .from('modifier_option_cost')
        .upsert(
          { loyverse_modifier_option_id: optionId, modifier_id: modifierId, quantity_per_unit: quantityPerUnit },
          { onConflict: 'loyverse_modifier_option_id' },
        )
      if (err) return { ok: false as const, error: err.message }
      await reload()
      return { ok: true as const }
    },
    [reload],
  )

  const removeCost = useCallback(
    async (optionId: string) => {
      const { error: err } = await supabase
        .from('modifier_option_cost')
        .delete()
        .eq('loyverse_modifier_option_id', optionId)
      if (err) return { ok: false as const, error: err.message }
      await reload()
      return { ok: true as const }
    },
    [reload],
  )

  const setPrice = useCallback(
    async (optionId: string, price: number) => {
      const { error: err } = await supabase
        .from('modifier_option_overrides')
        .upsert({ loyverse_modifier_option_id: optionId, price }, { onConflict: 'loyverse_modifier_option_id' })
      if (err) return { ok: false as const, error: err.message }
      await reload()
      return { ok: true as const }
    },
    [reload],
  )

  const clearPrice = useCallback(
    async (optionId: string) => {
      const { error: err } = await supabase
        .from('modifier_option_overrides')
        .delete()
        .eq('loyverse_modifier_option_id', optionId)
      if (err) return { ok: false as const, error: err.message }
      await reload()
      return { ok: true as const }
    },
    [reload],
  )

  return { costByOptionId, priceByOptionId, mods, isLoading, error, upsertCost, removeCost, setPrice, clearPrice, reload }
}
