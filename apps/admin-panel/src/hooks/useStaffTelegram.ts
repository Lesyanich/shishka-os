import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCoalescedRealtimeRefetch } from './useCoalescedRealtimeRefetch'

export const TELEGRAM_BOT_USERNAME = 'Shishka_Kitchen_bot'

export interface StaffTelegramLink {
  staff_id: string
  telegram_chat_id: string
  telegram_username: string | null
  linked_at: string | null
}

export interface GeneratedCode {
  code: string
  deepLink: string
  expiresAt: string
}

export interface UseStaffTelegramResult {
  links: Record<string, StaffTelegramLink>
  isLoading: boolean
  error: string | null
  refetch: () => void
  generateCode: (staffId: string) => Promise<GeneratedCode | null>
}

function randomCode(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10)
}

export function useStaffTelegram(): UseStaffTelegramResult {
  const [links, setLinks] = useState<Record<string, StaffTelegramLink>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(true)
    setError(null)
    const { data, error: fetchError } = await supabase
      .from('staff_telegram')
      .select('staff_id, telegram_chat_id, telegram_username, linked_at')

    if (fetchError) {
      console.error('[useStaffTelegram] fetch error', fetchError)
      setError(fetchError.message)
      setIsLoading(false)
      return
    }

    const map: Record<string, StaffTelegramLink> = {}
    for (const row of (data ?? []) as StaffTelegramLink[]) {
      map[row.staff_id] = row
    }
    setLinks(map)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useCoalescedRealtimeRefetch('staff-telegram-realtime', [{ table: 'staff_telegram' }],
    () => { fetchData({ silent: true }) })

  const generateCode = useCallback(async (staffId: string): Promise<GeneratedCode | null> => {
    const code = randomCode()
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    const { error: insertError } = await supabase
      .from('telegram_link_codes')
      .insert({ code, staff_id: staffId, expires_at: expiresAt })

    if (insertError) {
      console.error('[useStaffTelegram] code insert error', insertError)
      setError(insertError.message)
      return null
    }
    return {
      code,
      deepLink: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${code}`,
      expiresAt,
    }
  }, [])

  return { links, isLoading, error, refetch: fetchData, generateCode }
}
