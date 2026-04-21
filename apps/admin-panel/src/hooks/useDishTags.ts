import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface DishTag {
  id: string
  slug: string
  name: string
  tagGroup: string
  color: string | null
}

export interface UseDishTagsResult {
  tags: DishTag[]
  available: DishTag[]
  isLoading: boolean
  error: string | null
  addTag: (tagId: string) => Promise<{ ok: boolean; error?: string }>
  removeTag: (tagId: string) => Promise<{ ok: boolean; error?: string }>
  refetch: () => void
}

interface RawTag {
  id: string
  slug: string
  name: string
  tag_group: string
  color: string | null
}

export function useDishTags(dishId: string | null): UseDishTagsResult {
  const [tags, setTags] = useState<DishTag[]>([])
  const [available, setAvailable] = useState<DishTag[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTags = useCallback(async () => {
    if (!dishId) {
      setTags([])
      setAvailable([])
      return
    }
    setIsLoading(true)
    setError(null)

    const [assignedResult, allTagsResult] = await Promise.all([
      supabase
        .from('nomenclature_tags')
        .select('tags(id, slug, name, tag_group, color)')
        .eq('nomenclature_id', dishId),
      supabase
        .from('tags')
        .select('id, slug, name, tag_group, color')
        .order('tag_group', { ascending: true })
        .order('sort_order', { ascending: true }),
    ])

    if (assignedResult.error) {
      setError(assignedResult.error.message)
      setIsLoading(false)
      return
    }
    if (allTagsResult.error) {
      setError(allTagsResult.error.message)
      setIsLoading(false)
      return
    }

    const assignedRaw = (assignedResult.data ?? [])
      .map((r) => r.tags as unknown as RawTag | null)
      .filter((t): t is RawTag => t != null)
    const assigned: DishTag[] = assignedRaw.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      tagGroup: t.tag_group,
      color: t.color,
    }))
    const assignedIds = new Set(assigned.map((t) => t.id))
    const allTags: DishTag[] = ((allTagsResult.data ?? []) as RawTag[]).map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      tagGroup: t.tag_group,
      color: t.color,
    }))

    setTags(assigned)
    setAvailable(allTags.filter((t) => !assignedIds.has(t.id)))
    setIsLoading(false)
  }, [dishId])

  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  const addTag = useCallback(
    async (tagId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!dishId) return { ok: false, error: 'No dish selected' }
      const { error: insertErr } = await supabase
        .from('nomenclature_tags')
        .insert({ nomenclature_id: dishId, tag_id: tagId })
      if (insertErr) return { ok: false, error: insertErr.message }
      await fetchTags()
      return { ok: true }
    },
    [dishId, fetchTags],
  )

  const removeTag = useCallback(
    async (tagId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!dishId) return { ok: false, error: 'No dish selected' }
      const { error: delErr } = await supabase
        .from('nomenclature_tags')
        .delete()
        .eq('nomenclature_id', dishId)
        .eq('tag_id', tagId)
      if (delErr) return { ok: false, error: delErr.message }
      await fetchTags()
      return { ok: true }
    },
    [dishId, fetchTags],
  )

  return { tags, available, isLoading, error, addTag, removeTag, refetch: fetchTags }
}
