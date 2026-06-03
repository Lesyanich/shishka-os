import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Phase 3 (MC 38911fde): the option-centric food-cost link layer.
// modifier_option_cost maps a Loyverse modifier OPTION -> a MOD-* nomenclature item
// + portion (quantity_per_unit). It is OURS (Loyverse can't hold food-cost) and
// survives pulls. cost = MOD.cost_per_unit * quantity_per_unit; margin = price - cost.
// Writes here touch ONLY our DB — no Loyverse side-effects (those are Phase 5's push).

export interface ModOption {
  id: string
  product_code: string
  name: string
  cost_per_unit: number | null
}

export interface OptionCostLink {
  loyverse_modifier_option_id: string
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

function resolveMod(
  rel: RawCostRow['modifier'],
): { id: string; product_code: string; name: string; cost_per_unit: number | null } | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

export function useModifierOptionCosts() {
  const [costByOptionId, setCostByOptionId] = useState<Record<string, OptionCostLink>>({})
  const [mods, setMods] = useState<ModOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    const [costRes, modRes] = await Promise.all([
      supabase
        .from('modifier_option_cost')
        .select(
          `loyverse_modifier_option_id, modifier_id, quantity_per_unit,
           modifier:modifier_id ( id, product_code, name, cost_per_unit )`,
        ),
      supabase
        .from('nomenclature')
        .select('id, product_code, name, cost_per_unit')
        .like('product_code', 'MOD-%')
        .order('product_code'),
    ])

    if (costRes.error) setError(costRes.error.message)
    else if (modRes.error) setError(modRes.error.message)
    else setError(null)

    const map: Record<string, OptionCostLink> = {}
    for (const r of (costRes.data ?? []) as RawCostRow[]) {
      const mod = resolveMod(r.modifier)
      if (!mod) continue
      map[r.loyverse_modifier_option_id] = {
        loyverse_modifier_option_id: r.loyverse_modifier_option_id,
        modifier_id: r.modifier_id,
        quantity_per_unit: Number(r.quantity_per_unit),
        modifier_code: mod.product_code,
        modifier_name: mod.name,
        modifier_cost_per_unit: mod.cost_per_unit != null ? Number(mod.cost_per_unit) : null,
      }
    }
    setCostByOptionId(map)
    setMods((modRes.data ?? []) as ModOption[])
    setIsLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const upsert = useCallback(
    async (optionId: string, modifierId: string, quantityPerUnit: number) => {
      const { error: err } = await supabase
        .from('modifier_option_cost')
        .upsert(
          {
            loyverse_modifier_option_id: optionId,
            modifier_id: modifierId,
            quantity_per_unit: quantityPerUnit,
          },
          { onConflict: 'loyverse_modifier_option_id' },
        )
      if (err) return { ok: false as const, error: err.message }
      await reload()
      return { ok: true as const }
    },
    [reload],
  )

  const remove = useCallback(
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

  return { costByOptionId, mods, isLoading, error, upsert, remove, reload }
}
