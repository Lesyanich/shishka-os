import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface EquipmentItem {
  id: string
  name: string
  category: string | null
  equipment_code: string | null
  capacity_value: number | null
  capacity_unit: string | null
  location_zone: string | null
  location_wall: string | null
  location_floor: number | null
  location_notes: string | null
  unit_id: string | null
}

export interface UseEquipmentCategoriesResult {
  equipment: EquipmentItem[]
  categories: string[]
  zones: string[]
  selectedCategory: string | null
  setSelectedCategory: (c: string | null) => void
  selectedZone: string | null
  setSelectedZone: (z: string | null) => void
  isLoading: boolean
  error: string | null
}

export function useEquipmentCategories(): UseEquipmentCategoriesResult {
  const [equipment, setEquipment] = useState<EquipmentItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedZone, setSelectedZone] = useState<string | null>(null)

  const fetchEquipment = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const primary = await supabase
      .from('equipment')
      .select('id, name, category, equipment_code, capacity_value, capacity_unit, location_zone, location_wall, location_floor, location_notes, unit_id')
      .order('category', { ascending: true })
      .order('name', { ascending: true })

    let rows: Record<string, unknown>[] | null = null

    if (primary.error) {
      // Fallback: location columns may not exist yet
      const fallback = await supabase
        .from('equipment')
        .select('id, name, category, equipment_code, capacity_value, capacity_unit')
        .order('category', { ascending: true })
        .order('name', { ascending: true })

      if (fallback.error) {
        console.error('[useEquipmentCategories] fetch error:', fallback.error.message)
        setError(fallback.error.message)
        setIsLoading(false)
        return
      }
      rows = fallback.data as Record<string, unknown>[]
    } else {
      rows = primary.data as Record<string, unknown>[]
    }

    setEquipment((rows ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      category: (row.category as string | null) ?? null,
      equipment_code: (row.equipment_code as string | null) ?? null,
      capacity_value: (row.capacity_value as number | null) ?? null,
      capacity_unit: (row.capacity_unit as string | null) ?? null,
      location_zone: (row.location_zone as string | null) ?? null,
      location_wall: (row.location_wall as string | null) ?? null,
      location_floor: (row.location_floor as number | null) ?? null,
      location_notes: (row.location_notes as string | null) ?? null,
      unit_id: (row.unit_id as string | null) ?? null,
    })))

    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchEquipment()
  }, [fetchEquipment])

  const categories = [...new Set(equipment.map((e) => e.category).filter(Boolean))] as string[]
  const zones = [...new Set(equipment.map((e) => e.location_zone).filter(Boolean))] as string[]

  return {
    equipment,
    categories,
    zones,
    selectedCategory,
    setSelectedCategory,
    selectedZone,
    setSelectedZone,
    isLoading,
    error,
  }
}
