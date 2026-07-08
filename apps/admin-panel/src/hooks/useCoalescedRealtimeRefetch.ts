import { useEffect, useRef } from 'react'
import type { RealtimePostgresChangesFilter } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/**
 * One table to watch on a realtime channel. `event` defaults to '*',
 * `schema` to 'public'. `filter` is an optional Postgres-changes filter
 * string, e.g. `status=eq.pending`.
 */
export interface RealtimeWatch {
  table: string
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  schema?: string
  filter?: string
}

/**
 * Subscribe to Supabase realtime `postgres_changes` on one or more tables and
 * invoke `onChange` in a COALESCED, DEBOUNCED way.
 *
 * WHY THIS EXISTS — the admin panel had a systemic reload/flicker: after a
 * write a hook would (1) `await fetchData()` (spinner) AND (2) an `event:'*'`
 * realtime subscription would catch the echo of that same write and fire a
 * SECOND full refetch. Every row of a multi-row transaction fired its own
 * refetch on top.
 *
 * The canonical fix (see docs/constitution/technical-rules.md
 * § RULE-REALTIME-LIST-HOOK):
 *   1. mutations update local state OPTIMISTICALLY (no refetch), and
 *   2. realtime drives a SILENT background refetch through this helper.
 *
 * This helper coalesces a burst of change events (a multi-row transaction, or
 * the echo of your own write) into a single `onChange` call after `debounceMs`
 * of quiet. Point `onChange` at a silent refetch —
 * `() => fetchData({ silent: true })` — so realtime never toggles the loading
 * spinner.
 *
 * `onChange` is held in a ref: passing a fresh closure every render does NOT
 * tear down and rebuild the channel. The subscription is (re)created only when
 * `channelName`, the serialized `watches`, or `debounceMs` change — so a hook
 * whose fetch closes over a filter can keep passing
 * `() => fetch({ silent: true })` and always run the latest closure without
 * resubscribing.
 *
 * @example single table
 *   useCoalescedRealtimeRefetch('po-live', [{ table: 'purchase_orders' }],
 *     () => fetchOrders({ silent: true }))
 *
 * @example many tables on one channel
 *   useCoalescedRealtimeRefetch('kitchen-dashboard',
 *     [{ table: 'shifts' }, { table: 'shift_tasks' }, { table: 'equipment_slots' }],
 *     () => fetchData({ silent: true }))
 */
export function useCoalescedRealtimeRefetch(
  channelName: string,
  watches: RealtimeWatch[],
  onChange: () => void,
  debounceMs = 200,
): void {
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // Serialize the watch list so a fresh array literal each render does not
  // trigger a resubscribe — only a real change to the tables/events does.
  const watchesKey = JSON.stringify(watches)

  useEffect(() => {
    const specs = JSON.parse(watchesKey) as RealtimeWatch[]
    let timer: ReturnType<typeof setTimeout> | null = null

    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        onChangeRef.current()
      }, debounceMs)
    }

    let channel = supabase.channel(channelName)
    for (const spec of specs) {
      const filter = {
        event: spec.event ?? '*',
        schema: spec.schema ?? 'public',
        table: spec.table,
        ...(spec.filter ? { filter: spec.filter } : {}),
      } as RealtimePostgresChangesFilter<'*'>
      channel = channel.on('postgres_changes', filter, schedule)
    }
    channel.subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [channelName, watchesKey, debounceMs])
}
