import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────

export type ProductionOrderStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled'
export type ProductionOrderPriority = 0 | 1 | 2

export interface RawRequirement {
  nomenclature_id: string
  product_code: string
  qty: number
  unit: string
}

export interface ProductionOrder {
  id: string
  order_number: string
  nomenclature_id: string
  product_name: string | null
  product_code: string | null
  target_qty: number
  target_unit: string
  deadline_at: string
  raw_requirements: RawRequirement[] | null
  estimated_start_at: string | null
  estimated_duration_min: number | null
  status: ProductionOrderStatus
  assigned_to: string | null
  assigned_name: string | null
  priority: ProductionOrderPriority
  actual_qty: number | null
  actual_started_at: string | null
  actual_completed_at: string | null
  waste_qty: number
  waste_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CreateProductionOrderInput {
  nomenclature_id: string
  target_qty: number
  target_unit: string
  deadline_at: string
  priority?: ProductionOrderPriority
  assigned_to?: string | null
  notes?: string | null
  raw_requirements?: RawRequirement[]
  estimated_start_at?: string
  estimated_duration_min?: number
}

export interface UpdateProductionOrderInput {
  status?: ProductionOrderStatus
  actual_qty?: number
  actual_started_at?: string
  actual_completed_at?: string
  waste_qty?: number
  waste_reason?: string
  assigned_to?: string | null
  priority?: ProductionOrderPriority
  notes?: string
  raw_requirements?: RawRequirement[]
  estimated_start_at?: string
  estimated_duration_min?: number
}

export interface UseProductionOrdersResult {
  orders: ProductionOrder[]
  isLoading: boolean
  error: string | null
  createOrder: (input: CreateProductionOrderInput) => Promise<ProductionOrder | null>
  updateOrder: (id: string, input: UpdateProductionOrderInput) => Promise<boolean>
  cancelOrder: (id: string) => Promise<boolean>
  startOrder: (id: string) => Promise<boolean>
  completeOrder: (id: string, actualQty: number, wasteQty?: number, wasteReason?: string) => Promise<boolean>
  refetch: () => void
}

// ─── Filter options ───────────────────────────────────────────────

interface FilterOptions {
  status?: ProductionOrderStatus | ProductionOrderStatus[]
  date?: string  // ISO date string — filter by deadline date
}

// ─── Hook ─────────────────────────────────────────────────────────

export function useProductionOrders(filters?: FilterOptions): UseProductionOrdersResult {
  const [orders, setOrders] = useState<ProductionOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchOrders = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    let query = supabase
      .from('production_orders')
      .select(`
        *,
        nomenclature:nomenclature_id (name, product_code),
        staff:assigned_to (name)
      `)
      .order('deadline_at', { ascending: true })
      .order('priority', { ascending: false })

    // Apply status filter
    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        query = query.in('status', filters.status)
      } else {
        query = query.eq('status', filters.status)
      }
    }

    // Apply date filter (deadline date)
    if (filters?.date) {
      const dayStart = `${filters.date}T00:00:00`
      const dayEnd = `${filters.date}T23:59:59`
      query = query.gte('deadline_at', dayStart).lte('deadline_at', dayEnd)
    }

    const { data, error: fetchError } = await query

    if (fetchError) {
      console.error('[useProductionOrders] fetch error', fetchError)
      setError(fetchError.message)
      setIsLoading(false)
      return
    }

    const mapped: ProductionOrder[] = (data ?? []).map((row: Record<string, unknown>) => {
      const nom = row.nomenclature as { name: string; product_code: string } | null
      const staff = row.staff as { name: string } | null
      return {
        id: row.id as string,
        order_number: row.order_number as string,
        nomenclature_id: row.nomenclature_id as string,
        product_name: nom?.name ?? null,
        product_code: nom?.product_code ?? null,
        target_qty: row.target_qty as number,
        target_unit: row.target_unit as string,
        deadline_at: row.deadline_at as string,
        raw_requirements: row.raw_requirements as RawRequirement[] | null,
        estimated_start_at: row.estimated_start_at as string | null,
        estimated_duration_min: row.estimated_duration_min as number | null,
        status: row.status as ProductionOrderStatus,
        assigned_to: row.assigned_to as string | null,
        assigned_name: staff?.name ?? null,
        priority: row.priority as ProductionOrderPriority,
        actual_qty: row.actual_qty as number | null,
        actual_started_at: row.actual_started_at as string | null,
        actual_completed_at: row.actual_completed_at as string | null,
        waste_qty: (row.waste_qty as number) ?? 0,
        waste_reason: row.waste_reason as string | null,
        notes: row.notes as string | null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
      }
    })

    setOrders(mapped)
    setIsLoading(false)
  }, [filters?.status, filters?.date])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // ─── Realtime subscription ──────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel('production_orders_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'production_orders' },
        () => { fetchOrders() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchOrders])

  // ─── Mutations ──────────────────────────────────────────────────

  const createOrder = useCallback(async (input: CreateProductionOrderInput): Promise<ProductionOrder | null> => {
    const { data, error: insertError } = await supabase
      .from('production_orders')
      .insert({
        nomenclature_id: input.nomenclature_id,
        target_qty: input.target_qty,
        target_unit: input.target_unit,
        deadline_at: input.deadline_at,
        priority: input.priority ?? 0,
        assigned_to: input.assigned_to ?? null,
        notes: input.notes ?? null,
        raw_requirements: input.raw_requirements ?? null,
        estimated_start_at: input.estimated_start_at ?? null,
        estimated_duration_min: input.estimated_duration_min ?? null,
        order_number: '',  // trigger will auto-generate
      })
      .select()
      .single()

    if (insertError) {
      console.error('[useProductionOrders] create error', insertError)
      setError(insertError.message)
      return null
    }

    return data as unknown as ProductionOrder
  }, [])

  const updateOrder = useCallback(async (id: string, input: UpdateProductionOrderInput): Promise<boolean> => {
    const { error: updateError } = await supabase
      .from('production_orders')
      .update(input)
      .eq('id', id)

    if (updateError) {
      console.error('[useProductionOrders] update error', updateError)
      setError(updateError.message)
      return false
    }
    return true
  }, [])

  const cancelOrder = useCallback(async (id: string): Promise<boolean> => {
    return updateOrder(id, { status: 'cancelled' })
  }, [updateOrder])

  const startOrder = useCallback(async (id: string): Promise<boolean> => {
    return updateOrder(id, {
      status: 'in_progress',
      actual_started_at: new Date().toISOString(),
    })
  }, [updateOrder])

  const completeOrder = useCallback(async (
    id: string,
    actualQty: number,
    wasteQty?: number,
    wasteReason?: string,
  ): Promise<boolean> => {
    return updateOrder(id, {
      status: 'completed',
      actual_qty: actualQty,
      actual_completed_at: new Date().toISOString(),
      waste_qty: wasteQty ?? 0,
      waste_reason: wasteReason,
    })
  }, [updateOrder])

  return {
    orders,
    isLoading,
    error,
    createOrder,
    updateOrder,
    cancelOrder,
    startOrder,
    completeOrder,
    refetch: fetchOrders,
  }
}
