import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface SaleItem {
  id: string
  product_code: string
  name: string
  hasBOM: boolean
}

export interface UseBOMCoverageResult {
  total: number
  withBOM: number
  missing: SaleItem[]
  percentage: number
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useBOMCoverage(): UseBOMCoverageResult {
  const [saleItems, setSaleItems] = useState<SaleItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    // Step 1: all active SALE items
    const { data: saleData, error: saleError } = await supabase
      .from('nomenclature')
      .select('id, product_code, name')
      .ilike('product_code', 'SALE-%')
      .eq('is_deleted', false)
      .order('product_code', { ascending: true })

    if (saleError) {
      console.error('[useBOMCoverage] nomenclature fetch error', saleError)
      setError(saleError.message)
      setIsLoading(false)
      return
    }

    const saleRows = (saleData ?? []) as { id: string; product_code: string; name: string }[]

    if (saleRows.length === 0) {
      setSaleItems([])
      setIsLoading(false)
      return
    }

    // Step 2: which SALE ids have at least one BOM entry
    const saleIds = saleRows.map((r) => r.id)
    const { data: bomData, error: bomError } = await supabase
      .from('bom_structures')
      .select('parent_id')
      .in('parent_id', saleIds)

    if (bomError) {
      console.error('[useBOMCoverage] bom_structures fetch error', bomError)
      setError(bomError.message)
      setIsLoading(false)
      return
    }

    const coveredIds = new Set((bomData ?? []).map((r) => r.parent_id as string))

    setSaleItems(
      saleRows.map((r) => ({
        id: r.id,
        product_code: r.product_code,
        name: r.name,
        hasBOM: coveredIds.has(r.id),
      })),
    )
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const withBOM = saleItems.filter((i) => i.hasBOM).length
  const total = saleItems.length
  const missing = saleItems.filter((i) => !i.hasBOM)
  const percentage = total > 0 ? Math.round((withBOM / total) * 100) : 0

  return { total, withBOM, missing, percentage, isLoading, error, refetch: fetchData }
}
