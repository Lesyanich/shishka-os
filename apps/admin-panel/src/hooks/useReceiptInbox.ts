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
  status: 'pending' | 'processing' | 'parsed' | 'processed' | 'error' | 'skipped'
  expense_id: string | null
  error_message: string | null
  parsed_payload: Record<string, unknown> | null
  parsed_at: string | null
  gdrive_paths: string[] | null
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
  approve: (inboxId: string, payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; expense_id?: string }>
  skip: (inboxId: string) => Promise<string | null>
  reopen: (inboxId: string) => Promise<string | null>
  deleteRow: (inboxId: string) => Promise<string | null>
  syncStatus: (inboxId: string) => Promise<string | null>
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
        parsed_payload: (r.parsed_payload ?? null) as Record<string, unknown> | null,
        parsed_at: (r.parsed_at ?? null) as string | null,
        gdrive_paths: (r.gdrive_paths ?? null) as string[] | null,
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

  const approve = useCallback(async (inboxId: string, payload: Record<string, unknown>) => {
    try {
      const { data, error: rpcErr } = await supabase.rpc('fn_approve_receipt', {
        p_payload: payload,
      })
      if (rpcErr) return { ok: false, error: rpcErr.message }
      if (data && !data.ok) return { ok: false, error: data.error || 'RPC returned error' }

      // Mark inbox as processed
      await supabase
        .from('receipt_inbox')
        .update({ status: 'processed', expense_id: data?.expense_id ?? null, processed_at: new Date().toISOString() })
        .eq('id', inboxId)

      await fetchData()
      return { ok: true, expense_id: data?.expense_id }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }, [fetchData])

  const skip = useCallback(async (inboxId: string): Promise<string | null> => {
    const { error: err } = await supabase
      .from('receipt_inbox')
      .update({ status: 'skipped' })
      .eq('id', inboxId)
    if (err) return err.message
    await fetchData()
    return null
  }, [fetchData])

  const reopen = useCallback(async (inboxId: string): Promise<string | null> => {
    const { error: err } = await supabase
      .from('receipt_inbox')
      .update({ status: 'parsed' })
      .eq('id', inboxId)
    if (err) return err.message
    await fetchData()
    return null
  }, [fetchData])

  const deleteRow = useCallback(async (inboxId: string): Promise<string | null> => {
    const { data, error: err } = await supabase.rpc('fn_delete_inbox_row', {
      p_inbox_id: inboxId,
    })
    if (err) return err.message
    if (data && !data.ok) return data.error || 'Delete failed'
    await fetchData()
    return null
  }, [fetchData])

  // Sync inbox status if expense_id exists but status is wrong
  const syncStatus = useCallback(async (inboxId: string): Promise<string | null> => {
    const { data, error: err } = await supabase.rpc('fn_sync_inbox_status', {
      p_inbox_id: inboxId,
    })
    if (err) return err.message
    if (data?.fixed) await fetchData()
    return null
  }, [fetchData])

  return { rows, isLoading, error, refetch: fetchData, insert, approve, skip, reopen, deleteRow, syncStatus }
}
