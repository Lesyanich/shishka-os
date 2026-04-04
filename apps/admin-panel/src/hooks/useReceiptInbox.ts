import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/* ────────────────────────── Types ────────────────────────── */

export interface InboxRow {
  id: string
  uploaded_by: string
  upload_date: string
  receipt_date: string | null
  supplier_hint: string | null
  amount_hint: number | null
  photo_urls: string[]
  notes: string | null
  status: 'pending' | 'processing' | 'processed' | 'error' | 'skipped'
  expense_id: string | null
  error_message: string | null
  created_at: string
}

export interface InboxInsert {
  uploaded_by: string
  photo_urls: string[]
  receipt_date?: string | null
  supplier_hint?: string | null
  amount_hint?: number | null
  notes?: string | null
}

export interface UseReceiptInboxResult {
  rows: InboxRow[]
  isLoading: boolean
  error: string | null
  refetch: () => void
  insert: (payload: InboxInsert) => Promise<string | null>
}

/* ────────────────────────── Hook ────────────────────────── */

export function useReceiptInbox(): UseReceiptInboxResult {
  const [rows, setRows] = useState<InboxRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: err } = await supabase
      .from('receipt_inbox')
      .select('*')
      .order('created_at', { ascending: false })

    if (err) {
      console.error('[useReceiptInbox] fetch error', err)
      setError(err.message)
      setIsLoading(false)
      return
    }

    setRows(
      (data ?? []).map((r) => ({
        id: r.id as string,
        uploaded_by: r.uploaded_by as string,
        upload_date: r.upload_date as string,
        receipt_date: (r.receipt_date ?? null) as string | null,
        supplier_hint: (r.supplier_hint ?? null) as string | null,
        amount_hint: r.amount_hint != null ? Number(r.amount_hint) : null,
        photo_urls: (r.photo_urls ?? []) as string[],
        notes: (r.notes ?? null) as string | null,
        status: (r.status ?? 'pending') as InboxRow['status'],
        expense_id: (r.expense_id ?? null) as string | null,
        error_message: (r.error_message ?? null) as string | null,
        created_at: r.created_at as string,
      })),
    )
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const insert = useCallback(async (payload: InboxInsert): Promise<string | null> => {
    const { error: err } = await supabase.from('receipt_inbox').insert(payload)
    if (err) {
      console.error('[useReceiptInbox] insert error', err)
      return err.message
    }
    await fetchData()
    return null
  }, [fetchData])

  return { rows, isLoading, error, refetch: fetchData, insert }
}
