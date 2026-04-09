import { supabase } from '../lib/supabase'

export interface BrainQueryRow {
  id: string
  ts: string
  agent_id: string | null
  query_mode: string
  query_preview: string | null
  chunks_returned: number | null
  llm_tokens_in: number
  llm_tokens_out: number
  embed_tokens: number
  cost_usd: number
  latency_ms: number | null
  error: string | null
}

export interface DailyCost {
  date: string
  cost_usd: number
  queries: number
}

export interface AgentCost {
  agent_id: string
  cost_usd: number
  queries: number
}

export async function fetchRecentQueries(limit = 50): Promise<BrainQueryRow[]> {
  const { data, error } = await supabase
    .from('brain_query_log')
    .select('*')
    .order('ts', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []) as BrainQueryRow[]
}

export async function fetchDailyCosts(days = 30): Promise<DailyCost[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('brain_query_log')
    .select('ts, cost_usd')
    .gte('ts', since.toISOString())
    .order('ts', { ascending: true })

  if (error) throw new Error(error.message)

  const byDay: Record<string, { cost: number; count: number }> = {}
  for (const row of data ?? []) {
    const day = row.ts.slice(0, 10)
    if (!byDay[day]) byDay[day] = { cost: 0, count: 0 }
    byDay[day].cost += Number(row.cost_usd)
    byDay[day].count += 1
  }

  return Object.entries(byDay).map(([date, v]) => ({
    date,
    cost_usd: Math.round(v.cost * 1_000_000) / 1_000_000,
    queries: v.count,
  }))
}

export async function fetchAgentBreakdown(): Promise<AgentCost[]> {
  const { data, error } = await supabase
    .from('brain_query_log')
    .select('agent_id, cost_usd')

  if (error) throw new Error(error.message)

  const byAgent: Record<string, { cost: number; count: number }> = {}
  for (const row of data ?? []) {
    const agent = row.agent_id ?? 'unknown'
    if (!byAgent[agent]) byAgent[agent] = { cost: 0, count: 0 }
    byAgent[agent].cost += Number(row.cost_usd)
    byAgent[agent].count += 1
  }

  return Object.entries(byAgent)
    .map(([agent_id, v]) => ({
      agent_id,
      cost_usd: Math.round(v.cost * 1_000_000) / 1_000_000,
      queries: v.count,
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd)
}

export async function fetchTotalSpend30d(): Promise<number> {
  const since = new Date()
  since.setDate(since.getDate() - 30)

  const { data, error } = await supabase
    .from('brain_query_log')
    .select('cost_usd')
    .gte('ts', since.toISOString())

  if (error) throw new Error(error.message)

  return (data ?? []).reduce((sum, r) => sum + Number(r.cost_usd), 0)
}
