import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ProductionTarget, Channel, TargetStatus } from '../types/scheduling'

export interface UseProductionTargetsResult {
  targets: ProductionTarget[]
  isLoading: boolean
  error: string | null
  addTarget: (target: {
    date: string
    nomenclature_id: string
    channel: Channel
    target_qty: number
    deadline_at: string
    location_id?: string
  }) => Promise<{ ok: boolean; error?: string }>
  updateTarget: (id: string, updates: Partial<Pick<ProductionTarget, 'target_qty' | 'deadline_at' | 'channel' | 'status'>>) => Promise<{ ok: boolean; error?: string }>
  deleteTarget: (id: string) => Promise<{ ok: boolean; error?: string }>
  confirmAll: (date: string) => Promise<{ ok: boolean; error?: string }>
  refetch: () => void
}

export function useProductionTargets(date: string): UseProductionTargetsResult {
  const [targets, setTargets] = useState<ProductionTarget[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTargets = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('production_targets')
      .select('*, nomenclature!nomenclature_id(name, product_code), locations!location_id(name)')
      .eq('date', date)
      .order('deadline_at', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      const mapped = (data ?? []).map((row: Record<string, unknown>) => ({
        ...row,
        nomenclature: row.nomenclature as ProductionTarget['nomenclature'],
        location: row.locations as ProductionTarget['location'],
        locations: undefined,
      })) as unknown as ProductionTarget[]
      setTargets(mapped)
    }
    setIsLoading(false)
  }, [date])

  useEffect(() => {
    fetchTargets()

    const channel = supabase
      .channel(`targets-${date}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'production_targets',
        filter: `date=eq.${date}`,
      }, () => { fetchTargets() })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [date, fetchTargets])

  const addTarget = useCallback(async (target: {
    date: string
    nomenclature_id: string
    channel: Channel
    target_qty: number
    deadline_at: string
    location_id?: string
  }) => {
    const { error } = await supabase
      .from('production_targets')
      .insert({ ...target, status: 'draft' as TargetStatus })

    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }, [])

  const updateTarget = useCallback(async (id: string, updates: Partial<Pick<ProductionTarget, 'target_qty' | 'deadline_at' | 'channel' | 'status'>>) => {
    const { error } = await supabase
      .from('production_targets')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }, [])

  const deleteTarget = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('production_targets')
      .delete()
      .eq('id', id)

    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }, [])

  const confirmAll = useCallback(async (targetDate: string) => {
    const { error } = await supabase
      .from('production_targets')
      .update({ status: 'confirmed' as TargetStatus, updated_at: new Date().toISOString() })
      .eq('date', targetDate)
      .eq('status', 'draft')

    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }, [])

  return { targets, isLoading, error, addTarget, updateTarget, deleteTarget, confirmAll, refetch: fetchTargets }
}
