import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface RecipeFeedbackEntry {
  id: string
  dish_id: string
  staff_id: string | null
  staff_name: string
  body: string
  created_at: string
  updated_at: string
}

interface UseFeedbackResult {
  feedback: RecipeFeedbackEntry[]
  isLoading: boolean
  addFeedback: (
    body: string,
    staffId: string | null,
    staffName: string,
  ) => Promise<{ ok: boolean; error?: string }>
  deleteFeedback: (id: string) => Promise<{ ok: boolean; error?: string }>
}

/** Load, post, and delete feedback for a single dish. */
export function useRecipeFeedback(dishId: string | null): UseFeedbackResult {
  const [feedback, setFeedback] = useState<RecipeFeedbackEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!dishId) {
      setFeedback([])
      return
    }
    let cancelled = false
    setIsLoading(true)
    supabase
      .from('recipe_feedback')
      .select('*')
      .eq('dish_id', dishId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        setIsLoading(false)
        if (!error && data) setFeedback(data as RecipeFeedbackEntry[])
      })
    return () => { cancelled = true }
  }, [dishId])

  const addFeedback = useCallback(
    async (
      body: string,
      staffId: string | null,
      staffName: string,
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!dishId) return { ok: false, error: 'No dish selected' }
      const trimmed = body.trim()
      if (!trimmed) return { ok: false, error: 'Comment cannot be empty' }

      const newEntry: Partial<RecipeFeedbackEntry> = {
        dish_id: dishId,
        staff_id: staffId,
        staff_name: staffName || 'Staff',
        body: trimmed,
      }

      // Optimistic insert
      const tempId = `temp-${Date.now()}`
      const optimistic: RecipeFeedbackEntry = {
        ...newEntry as RecipeFeedbackEntry,
        id: tempId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setFeedback((prev) => [optimistic, ...prev])

      const { data, error } = await supabase
        .from('recipe_feedback')
        .insert(newEntry)
        .select()
        .single()

      if (error || !data) {
        setFeedback((prev) => prev.filter((f) => f.id !== tempId))
        return { ok: false, error: error?.message ?? 'Insert failed' }
      }
      // Replace temp with real
      setFeedback((prev) =>
        prev.map((f) => (f.id === tempId ? (data as RecipeFeedbackEntry) : f)),
      )
      return { ok: true }
    },
    [dishId],
  )

  const deleteFeedback = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      setFeedback((prev) => prev.filter((f) => f.id !== id))
      const { error } = await supabase
        .from('recipe_feedback')
        .delete()
        .eq('id', id)
      if (error) {
        // Refetch to restore on failure
        if (dishId) {
          const { data } = await supabase
            .from('recipe_feedback')
            .select('*')
            .eq('dish_id', dishId)
            .order('created_at', { ascending: false })
          if (data) setFeedback(data as RecipeFeedbackEntry[])
        }
        return { ok: false, error: error.message }
      }
      return { ok: true }
    },
    [dishId],
  )

  return { feedback, isLoading, addFeedback, deleteFeedback }
}

/** Fetch comment counts for a list of dish IDs in one query. */
export function useFeedbackCounts(dishIds: string[]): {
  counts: Map<string, number>
  isLoading: boolean
  refetch: () => void
} {
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [tick, setTick] = useState(0)

  const refetch = useCallback(() => setTick((n) => n + 1), [])

  const key = dishIds.join(',')

  useEffect(() => {
    if (!key) return
    let cancelled = false
    setIsLoading(true)
    supabase
      .from('recipe_feedback')
      .select('dish_id')
      .in('dish_id', key.split(','))
      .then(({ data, error }) => {
        if (cancelled) return
        setIsLoading(false)
        if (error || !data) return
        const map = new Map<string, number>()
        for (const row of data) {
          map.set(row.dish_id, (map.get(row.dish_id) ?? 0) + 1)
        }
        setCounts(map)
      })
    return () => { cancelled = true }
  }, [key, tick])

  return { counts, isLoading, refetch }
}
