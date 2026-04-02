import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface EquipmentItem {
  id: string
  name: string
  category: string | null
  equipment_code: string | null
  capacity_value: number | null
  capacity_unit: string | null
}

export interface UseEquipmentCategoriesResult {
  equipment: EquipmentItem[]
  categories: string[]
  selectedCategory: string | null
  setSelectedCategory: (c: string | null) => void
  isLoading: boolean
  error: string | null
}

export function useEquipmentCategories(): UseEquipmentCategoriesResult {
  const [equipment, setEquipment] = useState<EquipmentItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const fetchEquipment = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('equipment')
      .select('id, name, category, equipment_code, capacity_value, capacity_unit')
      .order('category', { ascending: true })
      .order('name', { ascending: true })

    if (fetchError) {
      console.error('[useEquipmentCategories] fetch error', fetchError)
      setError(fetchError.message)
    } else {
      setEquipment((data ?? []) as EquipmentItem[])
    }

    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchEquipment()
  }, [fetchEquipment])

  const categories = [...new Set(equipment.map((e) => e.category).filter(Boolean))] as string[]

  return {
    equipment,
    categories,
    selectedCategory,
    setSelectedCategory,
    isLoading,
    error,
  }
}
