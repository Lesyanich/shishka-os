import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Phase 4 (MC 38911fde): per-dish modifier-GROUP attachment editor.
// dish_modifier_groups maps a SALE-* dish to the Loyverse modifier lists (groups)
// that apply to it — the mirror of Loyverse item.modifier_ids. Editing here writes
// ONLY our DB; the change reaches Loyverse later via the orchestrated Push (Phase 5).
// (Reminder: editing a modifier in Loyverse detaches it from items, so re-attach is
// always the LAST push step — that ordering lives in the push flow, not here.)

export interface DishRow {
  id: string
  product_code: string
  name: string
  category: string | null
}

type CatRel = { name: string } | { name: string }[] | null
type RawDish = { id: string; product_code: string; name: string; product_categories: CatRel }
type RawAttach = { dish_id: string; loyverse_modifier_list_id: string }

function resolveCat(rel: CatRel): string | null {
  if (!rel) return null
  const r = Array.isArray(rel) ? rel[0] : rel
  return r?.name ?? null
}

export function useDishModifierGroups() {
  const [dishes, setDishes] = useState<DishRow[]>([])
  // dishId -> set of attached loyverse_modifier_list_id
  const [attachmentsByDish, setAttachmentsByDish] = useState<Record<string, string[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    const [dishRes, attachRes] = await Promise.all([
      supabase
        .from('nomenclature')
        .select('id, product_code, name, product_categories!category_id ( name )')
        .like('product_code', 'SALE-%')
        .order('product_code'),
      supabase.from('dish_modifier_groups').select('dish_id, loyverse_modifier_list_id'),
    ])

    if (dishRes.error) setError(dishRes.error.message)
    else if (attachRes.error) setError(attachRes.error.message)
    else setError(null)

    setDishes(
      ((dishRes.data ?? []) as RawDish[]).map((d) => ({
        id: d.id,
        product_code: d.product_code,
        name: d.name,
        category: resolveCat(d.product_categories),
      })),
    )
    const map: Record<string, string[]> = {}
    for (const r of (attachRes.data ?? []) as RawAttach[]) {
      ;(map[r.dish_id] ??= []).push(r.loyverse_modifier_list_id)
    }
    setAttachmentsByDish(map)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // Local attach/detach diverges admin from Loyverse → flag "needs push".
  const markDirty = async () => {
    await supabase.from('modifier_sync_state').update({ attachments_dirty: true }).eq('id', 1)
  }

  const attach = useCallback(
    async (dishId: string, listId: string) => {
      const { error: err } = await supabase
        .from('dish_modifier_groups')
        .upsert(
          { dish_id: dishId, loyverse_modifier_list_id: listId },
          { onConflict: 'dish_id,loyverse_modifier_list_id' },
        )
      if (err) return { ok: false as const, error: err.message }
      await markDirty()
      await reload()
      return { ok: true as const }
    },
    [reload],
  )

  const detach = useCallback(
    async (dishId: string, listId: string) => {
      const { error: err } = await supabase
        .from('dish_modifier_groups')
        .delete()
        .eq('dish_id', dishId)
        .eq('loyverse_modifier_list_id', listId)
      if (err) return { ok: false as const, error: err.message }
      await markDirty()
      await reload()
      return { ok: true as const }
    },
    [reload],
  )

  return { dishes, attachmentsByDish, isLoading, error, attach, detach, reload }
}
