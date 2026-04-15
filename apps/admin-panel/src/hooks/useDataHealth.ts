import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// ── Types matching 128_data_health_infra.sql + 136_v_data_health_items.sql ──

export type HealthSeverity = 'error' | 'warning' | 'action' | 'info'

export type HealthMetricKey =
  | 'type_mismatch'
  | 'duplicate_names'
  | 'no_category'
  | 'zero_cost_with_purchases'
  | 'misclassified_cogs'
  | 'unmatched_queue'
  | 'orphan_items'
  | 'stale_prices'

export interface HealthMetric {
  metric: HealthMetricKey
  severity: HealthSeverity
  val: number
  health_score: number
}

export type HealthEntityKind = 'nomenclature' | 'unmatched_items' | 'expense'

export interface HealthItem {
  metric: HealthMetricKey
  entity_id: string
  entity_kind: HealthEntityKind
  product_code: string | null
  name: string
  extra_json: Record<string, unknown> | null
}

export interface UseDataHealthResult {
  metrics: HealthMetric[]
  healthScore: number
  totalFailing: number
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  fetchItems: (metric: HealthMetricKey) => Promise<HealthItem[]>
}

/**
 * Reads the v_data_health + v_data_health_items views.
 *
 * - Summary metrics are fetched upfront and cached.
 * - Failing items are lazy-loaded per metric on demand (orphan_items can be
 *   109 rows, so we don't pull them unless the user expands the section).
 */
export function useDataHealth(): UseDataHealthResult {
  const [metrics, setMetrics] = useState<HealthMetric[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('v_data_health')
      .select('metric, severity, val, health_score')

    if (fetchError) {
      console.error('[useDataHealth] fetch error', fetchError)
      setError(fetchError.message)
      setMetrics([])
    } else {
      setMetrics((data ?? []) as HealthMetric[])
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const fetchItems = useCallback(async (metric: HealthMetricKey): Promise<HealthItem[]> => {
    const { data, error: fetchError } = await supabase
      .from('v_data_health_items')
      .select('metric, entity_id, entity_kind, product_code, name, extra_json')
      .eq('metric', metric)
      .order('product_code', { ascending: true, nullsFirst: false })
      .limit(500)

    if (fetchError) {
      console.error('[useDataHealth] fetchItems error', fetchError)
      return []
    }
    return (data ?? []) as HealthItem[]
  }, [])

  // Both v_data_health rows carry the same health_score (CROSS JOIN). Take the
  // first one; fall back to 100 when metrics haven't loaded yet.
  const healthScore = metrics[0]?.health_score ?? 100
  const totalFailing = metrics.reduce((sum, m) => sum + m.val, 0)

  return {
    metrics,
    healthScore,
    totalFailing,
    isLoading,
    error,
    refetch,
    fetchItems,
  }
}
