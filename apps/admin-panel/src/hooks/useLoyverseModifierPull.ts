import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface LoyverseModifierListRow {
  id: string
  name: string
  min_select: number | null
  max_select: number | null
  pulled_at: string
}

export interface LoyverseModifierOptionRow {
  id: string
  list_id: string
  name: string
  price: number | null
  pulled_at: string
}

interface PullResult {
  ok: boolean
  lists?: number
  options?: number
  warnings?: string[]
  error?: string
}

export function useLoyverseModifierPull() {
  const [lists, setLists] = useState<LoyverseModifierListRow[]>([])
  const [options, setOptions] = useState<LoyverseModifierOptionRow[]>([])
  const [lastPulledAt, setLastPulledAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPulling, setIsPulling] = useState(false)
  const [lastWarnings, setLastWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    const [listsRes, optsRes] = await Promise.all([
      supabase.from('pos_loyverse_modifier_lists').select('*').order('name'),
      supabase.from('pos_loyverse_modifier_options').select('*').order('name'),
    ])
    if (listsRes.error) setError(listsRes.error.message)
    if (optsRes.error) setError(optsRes.error.message)
    setLists((listsRes.data ?? []) as LoyverseModifierListRow[])
    setOptions((optsRes.data ?? []) as LoyverseModifierOptionRow[])
    setLastPulledAt(
      ((listsRes.data ?? [])[0] as LoyverseModifierListRow | undefined)?.pulled_at ?? null,
    )
    setIsLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const pull = useCallback(async () => {
    setIsPulling(true)
    setError(null)
    const { data: sessionData } = await supabase.auth.getSession()
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
    const url = `${supabaseUrl}/functions/v1/loyverse-sync?action=pull_modifiers`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionData.session?.access_token ?? anonKey}`,
        'Content-Type': 'application/json',
      },
    })
    const body = (await res.json()) as PullResult
    if (!body.ok) {
      setError(body.error ?? 'pull failed')
      setIsPulling(false)
      return body
    }
    setLastWarnings(body.warnings ?? [])
    await reload()
    setIsPulling(false)
    return body
  }, [reload])

  return { lists, options, lastPulledAt, lastWarnings, isLoading, isPulling, error, pull, reload }
}
