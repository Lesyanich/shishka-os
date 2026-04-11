import { supabase } from '../lib/supabase'

export interface ScoreBucket {
  score: number
  count: number
}

export interface GapRow {
  layer: string
  query_pattern: string
  hit_count: number
  first_seen: string
  last_seen: string
  avg_score: number | null
  agents: string[] | null
}

export interface LowScoreQuery {
  id: string
  ts: string
  layer: string | null
  agent_id: string | null
  query_preview: string | null
  response_preview: string | null
  quality_score: number | null
  quality_source: string | null
  chunks_returned: number | null
}

export interface RegressionTest {
  id: string
  layer: string
  query: string
  expected_keywords: string[]
  last_run_at: string | null
  last_score: number | null
  last_response_preview: string | null
}

export async function fetchScoreDistribution(days = 30): Promise<ScoreBucket[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('brain_query_log')
    .select('quality_score')
    .not('quality_score', 'is', null)
    .gte('ts', since.toISOString())

  if (error) throw new Error(error.message)

  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const row of data ?? []) {
    const s = row.quality_score as number
    if (s >= 1 && s <= 5) counts[s]++
  }

  return Object.entries(counts).map(([score, count]) => ({
    score: Number(score),
    count,
  }))
}

export async function fetchGaps(limit = 50): Promise<GapRow[]> {
  const { data, error } = await supabase
    .from('brain_gaps')
    .select('*')
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []) as GapRow[]
}

export async function fetchLowScoreQueries(limit = 30): Promise<LowScoreQuery[]> {
  const { data, error } = await supabase
    .from('brain_query_log')
    .select('id, ts, layer, agent_id, query_preview, response_preview, quality_score, quality_source, chunks_returned')
    .lte('quality_score', 2)
    .order('ts', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []) as LowScoreQuery[]
}

export async function fetchQualitySummary(days = 30): Promise<{
  totalScored: number
  avgScore: number
  gapCount: number
}> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('brain_query_log')
    .select('quality_score, is_gap')
    .not('quality_score', 'is', null)
    .gte('ts', since.toISOString())

  if (error) throw new Error(error.message)

  const rows = data ?? []
  const totalScored = rows.length
  const avgScore = totalScored > 0
    ? rows.reduce((s, r) => s + (r.quality_score as number), 0) / totalScored
    : 0
  const gapCount = rows.filter(r => r.is_gap).length

  return { totalScored, avgScore, gapCount }
}

export async function fetchRegressionTests(): Promise<RegressionTest[]> {
  const { data, error } = await supabase
    .from('brain_quality_tests')
    .select('id, layer, query, expected_keywords, last_run_at, last_score, last_response_preview')
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as RegressionTest[]
}

export async function rateQuery(queryPreview: string, score: 1 | 5): Promise<boolean> {
  // Find most recent matching row (within last hour)
  const since = new Date()
  since.setHours(since.getHours() - 1)

  const { data, error: fetchErr } = await supabase
    .from('brain_query_log')
    .select('id')
    .eq('query_preview', queryPreview.slice(0, 200))
    .gte('ts', since.toISOString())
    .order('ts', { ascending: false })
    .limit(1)

  if (fetchErr || !data || data.length === 0) return false

  const { error: updateErr } = await supabase
    .from('brain_query_log')
    .update({ quality_score: score, quality_source: 'ceo' })
    .eq('id', data[0].id)

  return !updateErr
}
