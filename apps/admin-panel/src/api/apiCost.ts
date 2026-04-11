import { supabase } from '../lib/supabase'

/* ────────────────────────── Types ────────────────────────── */

export interface ApiCostRow {
  id: string
  ts: string
  service: string
  model: string
  feature: string
  tokens_in: number
  tokens_out: number
  cost_usd: number
  reference_id: string | null
  reference_type: string | null
  error: string | null
}

export interface DailyCost {
  date: string
  cost_usd: number
  count: number
  feature: string
}

export interface ModelBreakdown {
  model: string
  service: string
  feature: string
  cost_usd: number
  count: number
  avg_cost: number
}

/* ────────────────────────── Queries ────────────────────────── */

export async function fetchRecentApiCosts(limit = 50): Promise<ApiCostRow[]> {
  const { data, error } = await supabase
    .from('api_cost_log')
    .select('*')
    .order('ts', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []) as ApiCostRow[]
}

export async function fetchTotalSpend30d(): Promise<{ total: number; receipt: number; brain: number }> {
  const since = new Date()
  since.setDate(since.getDate() - 30)
  const sinceIso = since.toISOString()

  // api_cost_log (receipts + any future features)
  const { data: apiData, error: apiErr } = await supabase
    .from('api_cost_log')
    .select('cost_usd, feature')
    .gte('ts', sinceIso)

  if (apiErr) throw new Error(apiErr.message)

  // brain_query_log (existing brain costs)
  const { data: brainData, error: brainErr } = await supabase
    .from('brain_query_log')
    .select('cost_usd')
    .gte('ts', sinceIso)

  if (brainErr) throw new Error(brainErr.message)

  const receiptCost = (apiData ?? [])
    .filter((r) => r.feature === 'receipt-ocr')
    .reduce((sum, r) => sum + Number(r.cost_usd), 0)

  const brainCost = (brainData ?? []).reduce((sum, r) => sum + Number(r.cost_usd), 0)

  const otherApiCost = (apiData ?? [])
    .filter((r) => r.feature !== 'receipt-ocr')
    .reduce((sum, r) => sum + Number(r.cost_usd), 0)

  return {
    total: receiptCost + brainCost + otherApiCost,
    receipt: receiptCost,
    brain: brainCost,
  }
}

export async function fetchDailyCosts(days = 30): Promise<DailyCost[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceIso = since.toISOString()

  // api_cost_log
  const { data: apiData, error: apiErr } = await supabase
    .from('api_cost_log')
    .select('ts, cost_usd, feature')
    .gte('ts', sinceIso)
    .order('ts', { ascending: true })

  if (apiErr) throw new Error(apiErr.message)

  // brain_query_log
  const { data: brainData, error: brainErr } = await supabase
    .from('brain_query_log')
    .select('ts, cost_usd')
    .gte('ts', sinceIso)
    .order('ts', { ascending: true })

  if (brainErr) throw new Error(brainErr.message)

  const byDay: Record<string, Record<string, { cost: number; count: number }>> = {}

  for (const row of apiData ?? []) {
    const day = row.ts.slice(0, 10)
    const feature = row.feature || 'other'
    if (!byDay[day]) byDay[day] = {}
    if (!byDay[day][feature]) byDay[day][feature] = { cost: 0, count: 0 }
    byDay[day][feature].cost += Number(row.cost_usd)
    byDay[day][feature].count += 1
  }

  for (const row of brainData ?? []) {
    const day = row.ts.slice(0, 10)
    if (!byDay[day]) byDay[day] = {}
    if (!byDay[day]['brain-query']) byDay[day]['brain-query'] = { cost: 0, count: 0 }
    byDay[day]['brain-query'].cost += Number(row.cost_usd)
    byDay[day]['brain-query'].count += 1
  }

  const result: DailyCost[] = []
  for (const [date, features] of Object.entries(byDay)) {
    for (const [feature, v] of Object.entries(features)) {
      result.push({
        date,
        cost_usd: Math.round(v.cost * 1_000_000) / 1_000_000,
        count: v.count,
        feature,
      })
    }
  }

  return result.sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchModelBreakdown(): Promise<ModelBreakdown[]> {
  const { data, error } = await supabase
    .from('api_cost_log')
    .select('model, service, feature, cost_usd')

  if (error) throw new Error(error.message)

  const byModel: Record<string, { service: string; feature: string; cost: number; count: number }> = {}
  for (const row of data ?? []) {
    const key = `${row.model}|${row.feature}`
    if (!byModel[key]) byModel[key] = { service: row.service, feature: row.feature, cost: 0, count: 0 }
    byModel[key].cost += Number(row.cost_usd)
    byModel[key].count += 1
  }

  return Object.entries(byModel)
    .map(([key, v]) => ({
      model: key.split('|')[0],
      service: v.service,
      feature: v.feature,
      cost_usd: Math.round(v.cost * 1_000_000) / 1_000_000,
      count: v.count,
      avg_cost: v.count > 0 ? Math.round((v.cost / v.count) * 1_000_000) / 1_000_000 : 0,
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd)
}
