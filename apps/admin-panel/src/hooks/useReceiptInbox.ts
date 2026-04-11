import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

/* ────────────────────────── Types ────────────────────────── */

export type OcrModel = 'gemini-flash' | 'gemini-flash-lite' | 'gemini-3-flash' | 'gemini-pro' | 'claude-sonnet' | 'claude-haiku' | 'gpt-4o' | 'claude-sub'

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
  model_used: string | null
  parse_cost_usd: number | null
  parse_tokens_in: number | null
  parse_tokens_out: number | null
  created_at: string
}

export interface InboxInsert {
  uploaded_by: string
  photo_urls: string[]
  receipt_date?: string | null
  supplier_hint?: string | null
  amount_hint?: number | null
  notes?: string | null
  model_used?: string | null
}

export interface UseReceiptInboxResult {
  rows: InboxRow[]
  isLoading: boolean
  error: string | null
  refetch: () => void
  insert: (payload: InboxInsert) => Promise<string | null>
  parseReceipt: (inboxId: string, model: OcrModel) => Promise<{ ok: boolean; error?: string }>
  approve: (inboxId: string, payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; expense_id?: string }>
  skip: (inboxId: string) => Promise<string | null>
  reopen: (inboxId: string) => Promise<string | null>
  resetToPending: (inboxId: string) => Promise<string | null>
  deleteRow: (inboxId: string) => Promise<string | null>
  deleteManyRows: (ids: string[]) => Promise<string | null>
  syncStatus: (inboxId: string) => Promise<string | null>
}

/* ────────────────────────── Row mapper ────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: Record<string, any>): InboxRow {
  return {
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
    model_used: (r.model_used ?? null) as string | null,
    parse_cost_usd: r.parse_cost_usd != null ? Number(r.parse_cost_usd) : null,
    parse_tokens_in: r.parse_tokens_in != null ? Number(r.parse_tokens_in) : null,
    parse_tokens_out: r.parse_tokens_out != null ? Number(r.parse_tokens_out) : null,
    created_at: r.created_at as string,
  }
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

    setRows((data ?? []).map(mapRow))
    setIsLoading(false)
  }, [])

  // ── Realtime subscription — targeted row patch, not full refetch ──
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    fetchData()

    const channel = supabase
      .channel('receipt_inbox_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'receipt_inbox' },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const updated = payload.new as Record<string, any>
          if (!updated?.id) return
          const mapped = mapRow(updated)
          setRows((prev) =>
            prev.map((r) => (r.id === mapped.id ? mapped : r)),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'receipt_inbox' },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newRow = payload.new as Record<string, any>
          if (!newRow?.id) return
          const mapped = mapRow(newRow)
          setRows((prev) => {
            if (prev.some((r) => r.id === mapped.id)) return prev
            return [mapped, ...prev]
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'receipt_inbox' },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const old = payload.old as Record<string, any>
          if (!old?.id) return
          setRows((prev) => prev.filter((r) => r.id !== old.id))
        },
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
    }
  }, [fetchData])

  const insert = useCallback(async (payload: InboxInsert): Promise<string | null> => {
    const { error: err } = await supabase.from('receipt_inbox').insert(payload)
    if (err) {
      console.error('[useReceiptInbox] insert error', err)
      return err.message
    }
    // Realtime INSERT subscription will add the row
    return null
  }, [])

  const parseReceipt = useCallback(async (inboxId: string, model: OcrModel): Promise<{ ok: boolean; error?: string }> => {
    if (model === 'claude-sub') {
      const { error: err } = await supabase
        .from('receipt_inbox')
        .update({ model_used: 'claude-subscription' })
        .eq('id', inboxId)
      if (err) return { ok: false, error: err.message }
      setRows((prev) =>
        prev.map((r) => (r.id === inboxId ? { ...r, model_used: 'claude-subscription' } : r)),
      )
      return { ok: true }
    }

    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        `ocr-receipt?inbox_id=${inboxId}&model=${model}`,
      )
      if (fnErr) return { ok: false, error: fnErr.message }
      if (data && !data.ok) return { ok: false, error: data.error || 'Parse failed' }
      // Realtime will update the row status from processing → parsed/error
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }, [])

  const approve = useCallback(async (inboxId: string, payload: Record<string, unknown>) => {
    try {
      const { data, error: rpcErr } = await supabase.rpc('fn_approve_receipt', {
        p_payload: payload,
      })
      if (rpcErr) return { ok: false, error: rpcErr.message }
      if (data && !data.ok) return { ok: false, error: data.error || 'RPC returned error' }

      const expenseId = data?.expense_id ?? null
      await supabase
        .from('receipt_inbox')
        .update({ status: 'processed', expense_id: expenseId, processed_at: new Date().toISOString() })
        .eq('id', inboxId)

      setRows((prev) =>
        prev.map((r) =>
          r.id === inboxId ? { ...r, status: 'processed' as const, expense_id: expenseId } : r,
        ),
      )
      return { ok: true, expense_id: expenseId }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }, [])

  const skip = useCallback(async (inboxId: string): Promise<string | null> => {
    const { error: err } = await supabase
      .from('receipt_inbox')
      .update({ status: 'skipped' })
      .eq('id', inboxId)
    if (err) return err.message
    setRows((prev) =>
      prev.map((r) => (r.id === inboxId ? { ...r, status: 'skipped' as const } : r)),
    )
    return null
  }, [])

  const reopen = useCallback(async (inboxId: string): Promise<string | null> => {
    const { error: err } = await supabase
      .from('receipt_inbox')
      .update({ status: 'parsed' })
      .eq('id', inboxId)
    if (err) return err.message
    setRows((prev) =>
      prev.map((r) => (r.id === inboxId ? { ...r, status: 'parsed' as const } : r)),
    )
    return null
  }, [])

  const resetToPending = useCallback(async (inboxId: string): Promise<string | null> => {
    const { error: err } = await supabase
      .from('receipt_inbox')
      .update({ status: 'pending', error_message: null, model_used: null })
      .eq('id', inboxId)
    if (err) return err.message
    setRows((prev) =>
      prev.map((r) =>
        r.id === inboxId
          ? { ...r, status: 'pending' as const, error_message: null, model_used: null }
          : r,
      ),
    )
    return null
  }, [])

  const deleteRow = useCallback(async (inboxId: string): Promise<string | null> => {
    const { data, error: err } = await supabase.rpc('fn_delete_inbox_row', {
      p_inbox_id: inboxId,
    })
    if (err) return err.message
    if (data && !data.ok) return data.error || 'Delete failed'
    setRows((prev) => prev.filter((r) => r.id !== inboxId))
    return null
  }, [])

  const deleteManyRows = useCallback(async (ids: string[]): Promise<string | null> => {
    for (const id of ids) {
      const err = await deleteRow(id)
      if (err) return `Failed to delete ${id}: ${err}`
    }
    return null
  }, [deleteRow])

  const syncStatus = useCallback(async (inboxId: string): Promise<string | null> => {
    const { data, error: err } = await supabase.rpc('fn_sync_inbox_status', {
      p_inbox_id: inboxId,
    })
    if (err) return err.message
    if (data?.fixed) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === inboxId ? { ...r, status: 'processed' as const } : r,
        ),
      )
    }
    return null
  }, [])

  return { rows, isLoading, error, refetch: fetchData, insert, parseReceipt, approve, skip, reopen, resetToPending, deleteRow, deleteManyRows, syncStatus }
}
