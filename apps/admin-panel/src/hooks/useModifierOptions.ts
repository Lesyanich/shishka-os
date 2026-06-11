import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Phase 2 (MC 38911fde): read path on the 2-level model. A dish's modifier options =
// the options of the Loyverse groups attached to it (dish_modifier_groups → mirror
// options), left-joined to our food-cost link (modifier_option_cost). Replaces the
// old per-(dish,MOD) nomenclature_modifier_options read.

export interface ModifierOption {
  id: string // Loyverse option id
  dish_id: string
  modifier_id: string // linked MOD-* (cost link); '' if not costed
  modifier_name: string // option name (customer-facing)
  modifier_code: string // linked MOD-* code; '' if not costed
  group_name: string // the modifier group (Loyverse list) name
  price_delta: number // Loyverse option price
  is_default: boolean // not modelled in 2-level; kept for compat (always false)
  sort_order: number
  cost: number | null // food cost = MOD.cost_per_unit × portion (Phase 6)
  margin: number | null // price_delta − cost
}

export interface UseModifierOptionsResult {
  modifiers: ModifierOption[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useModifierOptions(dishId: string | null): UseModifierOptionsResult {
  const [modifiers, setModifiers] = useState<ModifierOption[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!dishId) {
      setModifiers([])
      return
    }
    setIsLoading(true)
    setError(null)

    // 1. Which groups are attached to this dish?
    const groupsRes = await supabase
      .from('dish_modifier_groups')
      .select('loyverse_modifier_list_id, sort_order')
      .eq('dish_id', dishId)
    if (groupsRes.error) {
      setError(groupsRes.error.message)
      setIsLoading(false)
      return
    }
    const listIds = (groupsRes.data ?? []).map(
      (r: { loyverse_modifier_list_id: string }) => r.loyverse_modifier_list_id,
    )
    if (listIds.length === 0) {
      setModifiers([])
      setIsLoading(false)
      return
    }

    // 2. Group names, options, and cost links in parallel.
    const [listsRes, optsRes, costRes] = await Promise.all([
      supabase.from('pos_loyverse_modifier_lists').select('id, name').in('id', listIds),
      supabase.from('pos_loyverse_modifier_options').select('id, list_id, name, price').in('list_id', listIds),
      supabase
        .from('modifier_option_cost')
        .select('loyverse_modifier_option_id, quantity_per_unit, modifier:modifier_id ( product_code, cost_per_unit )'),
    ])
    const firstErr = listsRes.error ?? optsRes.error ?? costRes.error
    if (firstErr) {
      setError(firstErr.message)
      setIsLoading(false)
      return
    }

    const listName = new Map<string, string>(
      ((listsRes.data ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name]),
    )
    type CostRow = {
      loyverse_modifier_option_id: string
      quantity_per_unit: number
      modifier: { product_code: string; cost_per_unit: number | null } | { product_code: string; cost_per_unit: number | null }[] | null
    }
    const costByOption = new Map<string, { code: string; cost: number | null }>()
    for (const c of (costRes.data ?? []) as CostRow[]) {
      const mod = Array.isArray(c.modifier) ? c.modifier[0] : c.modifier
      if (!mod) continue
      const unit = mod.cost_per_unit != null ? Number(mod.cost_per_unit) : null
      costByOption.set(c.loyverse_modifier_option_id, {
        code: mod.product_code,
        cost: unit != null ? unit * Number(c.quantity_per_unit) : null,
      })
    }

    const rows: ModifierOption[] = ((optsRes.data ?? []) as {
      id: string
      list_id: string
      name: string
      price: number | null
    }[])
      .map((o, idx) => {
        const c = costByOption.get(o.id)
        const price = o.price != null ? Number(o.price) : 0
        const cost = c?.cost ?? null
        return {
          id: o.id,
          dish_id: dishId,
          modifier_id: '',
          modifier_name: o.name,
          modifier_code: c?.code ?? '',
          group_name: listName.get(o.list_id) ?? '',
          price_delta: price,
          is_default: false,
          sort_order: idx,
          cost,
          margin: cost != null ? price - cost : null,
        }
      })
      .sort((a, b) => a.group_name.localeCompare(b.group_name) || a.modifier_name.localeCompare(b.modifier_name))

    setModifiers(rows)
    setIsLoading(false)
  }, [dishId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { modifiers, isLoading, error, refetch: fetchData }
}
