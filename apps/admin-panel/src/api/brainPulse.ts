import { supabase } from '../lib/supabase'

const MEMPALACE_URL =
  (import.meta.env.VITE_MEMPALACE_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:9622'

export interface BrainPulse {
  // L1 MemPalace
  l1Up: boolean
  l1Entities: number
  l1Facts: number
  // Quality
  regressionPassed: number
  regressionTotal: number
  lastNightlyRun: string | null
  avgQuality30d: number | null
  gapCount: number
  // Activity
  queriesTotal: number
  lastQueryTs: string | null
}

export async function fetchBrainPulse(): Promise<BrainPulse> {
  const [l1, quality] = await Promise.all([
    fetchL1Stats(),
    fetchQualityStats(),
  ])
  return { ...l1, ...quality }
}

async function fetchL1Stats(): Promise<{
  l1Up: boolean
  l1Entities: number
  l1Facts: number
}> {
  try {
    const res = await fetch(`${MEMPALACE_URL}/status`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return { l1Up: false, l1Entities: 0, l1Facts: 0 }
    const data = await res.json()
    // /status returns { total_drawers, wings: {name: count}, rooms: {name: count} }
    const wingCount = data.wings ? Object.keys(data.wings).length : 0
    const roomCount = data.rooms ? Object.keys(data.rooms).length : 0
    return {
      l1Up: true,
      l1Entities: data.total_drawers ?? 0,
      l1Facts: wingCount + roomCount, // structural count
    }
  } catch {
    return { l1Up: false, l1Entities: 0, l1Facts: 0 }
  }
}

async function fetchQualityStats(): Promise<{
  regressionPassed: number
  regressionTotal: number
  lastNightlyRun: string | null
  avgQuality30d: number | null
  gapCount: number
  queriesTotal: number
  lastQueryTs: string | null
}> {
  const since = new Date()
  since.setDate(since.getDate() - 30)

  const [testsRes, qualityRes, gapsRes, lastQueryRes] = await Promise.all([
    supabase
      .from('brain_quality_tests')
      .select('last_score, last_run_at'),
    supabase
      .from('brain_query_log')
      .select('quality_score')
      .not('quality_score', 'is', null)
      .gte('ts', since.toISOString()),
    supabase
      .from('brain_gaps')
      .select('hit_count'),
    supabase
      .from('brain_query_log')
      .select('ts')
      .order('ts', { ascending: false })
      .limit(1),
  ])

  const tests = testsRes.data ?? []
  const regressionTotal = tests.length
  const regressionPassed = tests.filter(t => t.last_score != null && t.last_score >= 3).length
  const lastNightlyRun = tests
    .map(t => t.last_run_at)
    .filter(Boolean)
    .sort()
    .reverse()[0] ?? null

  const qualityRows = qualityRes.data ?? []
  const avgQuality30d = qualityRows.length > 0
    ? qualityRows.reduce((s, r) => s + (r.quality_score as number), 0) / qualityRows.length
    : null

  const gapCount = (gapsRes.data ?? []).length

  const queriesTotal = qualityRows.length
  const lastQueryTs = lastQueryRes.data?.[0]?.ts ?? null

  return {
    regressionPassed,
    regressionTotal,
    lastNightlyRun,
    avgQuality30d,
    gapCount,
    queriesTotal,
    lastQueryTs,
  }
}
