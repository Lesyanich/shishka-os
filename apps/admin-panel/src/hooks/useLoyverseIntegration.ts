import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

interface SyncLogEntry {
  id: string
  sync_type: string
  direction: string
  status: string
  records_total: number
  records_synced: number
  records_failed: number
  error_message: string | null
  started_at: string
  completed_at: string | null
}

interface SyncResult {
  ok: boolean
  error?: string
  total?: number
  synced?: number
  failed?: number
  errors?: string[]
  message?: string
}

export function useLoyverseIntegration() {
  const [isLoading, setIsLoading] = useState(false)
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([])
  const [lastResult, setLastResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const callEdgeFunction = useCallback(
    async (action: string, method: 'GET' | 'POST' = 'POST'): Promise<SyncResult> => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(
        `${supabaseUrl}/functions/v1/loyverse-sync?action=${action}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      )
      return (await res.json()) as SyncResult
    },
    [],
  )

  const loadStatus = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await callEdgeFunction('status', 'GET')
      if (result.ok) {
        setSyncLogs(
          (result as unknown as { logs: SyncLogEntry[] }).logs ?? [],
        )
      } else {
        setError(result.error ?? 'Failed to load status')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Status request failed')
    } finally {
      setIsLoading(false)
    }
  }, [callEdgeFunction])

  const syncCategories = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setLastResult(null)
    try {
      const result = await callEdgeFunction('categories')
      setLastResult(result)
      if (!result.ok) setError(result.error ?? 'Sync failed')
      await loadStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync request failed')
    } finally {
      setIsLoading(false)
    }
  }, [callEdgeFunction, loadStatus])

  const syncItems = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setLastResult(null)
    try {
      const result = await callEdgeFunction('items')
      setLastResult(result)
      if (!result.ok) setError(result.error ?? 'Sync failed')
      await loadStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync request failed')
    } finally {
      setIsLoading(false)
    }
  }, [callEdgeFunction, loadStatus])

  const fullSync = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setLastResult(null)
    try {
      const result = await callEdgeFunction('full')
      setLastResult(result)
      if (!result.ok) setError(result.error ?? 'Sync failed')
      await loadStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Full sync request failed')
    } finally {
      setIsLoading(false)
    }
  }, [callEdgeFunction, loadStatus])

  return {
    isLoading,
    syncLogs,
    lastResult,
    error,
    loadStatus,
    syncCategories,
    syncItems,
    fullSync,
  }
}
