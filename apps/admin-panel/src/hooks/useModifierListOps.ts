import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'

// Phase 3 (MC 38911fde): add/remove an OPTION inside a Loyverse modifier group.
// These mutate Loyverse immediately (POST /modifiers), which detaches the list from
// its items — the edge fn re-attaches all affected dishes right after (reattachAllDishes)
// so groups never silently fall off. Caller should refresh pull/attachments after.

interface OpResult {
  ok: boolean
  error?: string
  reattached?: number
}

async function callEdge(query: string): Promise<OpResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const url = `${supabaseUrl}/functions/v1/loyverse-sync?${query}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionData.session?.access_token ?? anonKey}`,
      'Content-Type': 'application/json',
    },
  })
  return (await res.json()) as OpResult
}

export function useModifierListOps() {
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addOption = useCallback(async (listId: string, name: string, price: number) => {
    setIsBusy(true)
    setError(null)
    const q = `action=add_modifier_option&list_id=${encodeURIComponent(listId)}&name=${encodeURIComponent(name)}&price=${price}`
    const res = await callEdge(q)
    setIsBusy(false)
    if (!res.ok) setError(res.error ?? 'add failed')
    return res
  }, [])

  const removeOption = useCallback(async (listId: string, name: string) => {
    setIsBusy(true)
    setError(null)
    const q = `action=remove_modifier_option&list_id=${encodeURIComponent(listId)}&name=${encodeURIComponent(name)}`
    const res = await callEdge(q)
    setIsBusy(false)
    if (!res.ok) setError(res.error ?? 'remove failed')
    return res
  }, [])

  return { addOption, removeOption, isBusy, error }
}
