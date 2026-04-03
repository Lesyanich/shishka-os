import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

interface SyrveConfig {
  api_login: string
  base_url: string
  organization_id: string
  store_id: string
  default_tax_category_id: string
  vat_rate: string
}

interface MatchedItem {
  shishka: { id: string; name: string; code: string }
  syrve: { id: string; name: string; code: string | null; unit: string }
  confidence: number
  already_mapped: boolean
}

interface UnmatchedItem {
  id: string
  name: string
  code: string
}

interface PocReport {
  ok: boolean
  error?: string
  syrve?: {
    organization_id: string
    organization_name: string
    products_count: number
    groups_count: number
    revision: number
  }
  shishka?: { items_count: number }
  matching?: {
    matched_count: number
    already_mapped: number
    fuzzy_matched: number
    unmatched_shishka: number
    unmatched_syrve: number
    match_rate_percent: number
  }
  matched?: MatchedItem[]
  unmatched_shishka?: UnmatchedItem[]
  unmatched_syrve?: Array<{ id: string; name: string; code: string | null; type: string }>
}

const DEFAULT_CONFIG: SyrveConfig = {
  api_login: '',
  base_url: 'https://api-eu.syrve.live/api/1',
  organization_id: '',
  store_id: '',
  default_tax_category_id: '',
  vat_rate: '7',
}

export function useSyrveIntegration() {
  const [config, setConfig] = useState<SyrveConfig>(DEFAULT_CONFIG)
  const [isLoadingConfig, setIsLoadingConfig] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isRunningPoc, setIsRunningPoc] = useState(false)
  const [pocReport, setPocReport] = useState<PocReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadConfig = useCallback(async () => {
    setIsLoadingConfig(true)
    try {
      const { data, error: err } = await supabase.rpc('fn_get_syrve_config')
      if (err) throw err
      if (data) {
        setConfig({ ...DEFAULT_CONFIG, ...(data as Record<string, string>) })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load config')
    } finally {
      setIsLoadingConfig(false)
    }
  }, [])

  const saveConfig = useCallback(async (key: string, value: string) => {
    setIsSaving(true)
    setError(null)
    try {
      const { error: err } = await supabase.rpc('fn_upsert_syrve_config', {
        p_key: key,
        p_value: value,
      })
      if (err) throw err
      setConfig((prev) => ({ ...prev, [key]: value }))
      setSuccess(`Saved ${key}`)
      setTimeout(() => setSuccess(null), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }, [])

  const saveAllConfig = useCallback(async (updates: Partial<SyrveConfig>) => {
    setIsSaving(true)
    setError(null)
    try {
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          const { error: err } = await supabase.rpc('fn_upsert_syrve_config', {
            p_key: key,
            p_value: value,
          })
          if (err) throw err
        }
      }
      setConfig((prev) => ({ ...prev, ...updates }))
      setSuccess('Configuration saved')
      setTimeout(() => setSuccess(null), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }, [])

  const runPoc = useCallback(async () => {
    setIsRunningPoc(true)
    setError(null)
    setPocReport(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${supabaseUrl}/functions/v1/syrve-poc`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      const report = await res.json() as PocReport
      setPocReport(report)
      if (!report.ok) {
        setError(report.error ?? 'PoC failed')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PoC request failed')
    } finally {
      setIsRunningPoc(false)
    }
  }, [])

  const applyMapping = useCallback(async (
    nomenclatureId: string,
    syrveUuid: string,
    syrveTaxCategoryId?: string,
  ) => {
    try {
      const { error: err } = await supabase.rpc('fn_save_syrve_mapping', {
        p_nomenclature_id: nomenclatureId,
        p_syrve_uuid: syrveUuid,
        p_syrve_tax_category_id: syrveTaxCategoryId ?? null,
      })
      if (err) throw err
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save mapping')
      return false
    }
  }, [])

  return {
    config,
    setConfig,
    isLoadingConfig,
    isSaving,
    isRunningPoc,
    pocReport,
    error,
    success,
    loadConfig,
    saveConfig,
    saveAllConfig,
    runPoc,
    applyMapping,
  }
}
