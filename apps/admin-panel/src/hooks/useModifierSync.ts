import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Phase 5 (MC 38911fde): drives the "Push to Loyverse" button + sync status.
// - last_pushed_at / last_pulled_at from modifier_sync_state (single row id=1).
// - "pending" = attachments edited since last sync (attachments_dirty) OR there are
//   staged option prices that differ from the live Loyverse price (mirror).
// push() calls the edge fn which applies prices then re-attaches dish groups in the
// fixed order (modifier edit detaches items), then re-pulls.

interface SyncStateRow {
  attachments_dirty: boolean
  last_pushed_at: string | null
  last_pulled_at: string | null
}

interface PushResult {
  ok: boolean
  dry_run?: boolean
  price_changes?: unknown[]
  reattach_dishes?: unknown[]
  prices_applied?: number
  dishes_reattached?: number
  error?: string
}

export function useModifierSync() {
  const [state, setState] = useState<SyncStateRow | null>(null)
  const [priceDraftCount, setPriceDraftCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isPushing, setIsPushing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [stateRes, ovRes, optRes] = await Promise.all([
      supabase.from('modifier_sync_state').select('attachments_dirty, last_pushed_at, last_pulled_at').eq('id', 1).maybeSingle(),
      supabase.from('modifier_option_overrides').select('loyverse_modifier_option_id, price'),
      supabase.from('pos_loyverse_modifier_options').select('id, price'),
    ])
    if (stateRes.data) setState(stateRes.data as SyncStateRow)
    const mirror = new Map<string, number | null>(
      ((optRes.data ?? []) as { id: string; price: number | null }[]).map((o) => [o.id, o.price]),
    )
    let drafts = 0
    for (const r of (ovRes.data ?? []) as { loyverse_modifier_option_id: string; price: number }[]) {
      const m = mirror.get(r.loyverse_modifier_option_id)
      if (Number(r.price) !== (m == null ? null : Number(m))) drafts++
    }
    setPriceDraftCount(drafts)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    reload()
    // Live status: reload when any of the three driving tables change.
    const channel = supabase
      .channel('modifier-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'modifier_sync_state' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'modifier_option_overrides' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dish_modifier_groups' }, () => reload())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [reload])

  const push = useCallback(async (dryRun = false): Promise<PushResult> => {
    setIsPushing(true)
    setError(null)
    const { data: sessionData } = await supabase.auth.getSession()
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
    const url = `${supabaseUrl}/functions/v1/loyverse-sync?action=push_modifiers${dryRun ? '&dry_run=true' : ''}`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session?.access_token ?? anonKey}`,
          'Content-Type': 'application/json',
        },
      })
      const body = (await res.json()) as PushResult
      if (!body.ok) setError(body.error ?? 'push failed')
      if (!dryRun) await reload()
      setIsPushing(false)
      return body
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setIsPushing(false)
      return { ok: false, error: msg }
    }
  }, [reload])

  const pending = (state?.attachments_dirty ?? false) || priceDraftCount > 0

  return {
    lastPushedAt: state?.last_pushed_at ?? null,
    lastPulledAt: state?.last_pulled_at ?? null,
    attachmentsDirty: state?.attachments_dirty ?? false,
    priceDraftCount,
    pending,
    isLoading,
    isPushing,
    error,
    push,
    reload,
  }
}
