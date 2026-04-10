/**
 * MemPalace REST client for Brain View (L1 tab).
 *
 * Talks to the local MemPalace HTTP API (default http://localhost:9622).
 * Server: services/mempalace/serve.py
 */

const DEFAULT_BASE_URL = 'http://localhost:9622'

const baseUrl: string =
  (import.meta.env.VITE_MEMPALACE_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  DEFAULT_BASE_URL

// ── Types ──

export interface MemPalaceStatus {
  total_drawers: number
  wings: Record<string, number>
  rooms: Record<string, number>
  palace_path: string
}

export interface MemPalaceTaxonomy {
  taxonomy: Record<string, Record<string, number>>
}

export interface MemPalaceDrawer {
  id: string
  wing: string
  room: string
  source_file: string
  added_by: string
  filed_at: string
  content_preview: string
  content: string
}

export interface MemPalaceDrawerList {
  drawers: MemPalaceDrawer[]
  count: number
}

export interface MemPalaceSearchHit {
  text: string
  wing: string
  room: string
  source_file: string
  similarity: number
}

export interface MemPalaceSearchResult {
  query: string
  filters: { wing: string | null; room: string | null }
  results: MemPalaceSearchHit[]
}

// ── Error ──

export class MemPalaceError extends Error {
  status: number
  body: string
  constructor(message: string, status: number, body: string) {
    super(message)
    this.name = 'MemPalaceError'
    this.status = status
    this.body = body
  }
}

// ── Fetcher ──

async function getJson<T>(path: string, params?: URLSearchParams): Promise<T> {
  const qs = params?.toString() ? `?${params.toString()}` : ''
  const url = `${baseUrl}${path}${qs}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new MemPalaceError(
      `MemPalace ${res.status} ${res.statusText} on ${path}`,
      res.status,
      body,
    )
  }
  return (await res.json()) as T
}

// ── Public API ──

export async function fetchHealth(): Promise<{ status: string }> {
  return getJson('/health')
}

export async function fetchStatus(): Promise<MemPalaceStatus> {
  return getJson('/status')
}

export async function fetchTaxonomy(): Promise<MemPalaceTaxonomy> {
  return getJson('/taxonomy')
}

export async function fetchDrawers(opts?: {
  wing?: string
  room?: string
}): Promise<MemPalaceDrawerList> {
  const params = new URLSearchParams()
  if (opts?.wing) params.set('wing', opts.wing)
  if (opts?.room) params.set('room', opts.room)
  return getJson('/drawers', params)
}

export async function searchDrawers(opts: {
  query: string
  wing?: string
  room?: string
  limit?: number
}): Promise<MemPalaceSearchResult> {
  const params = new URLSearchParams({ q: opts.query })
  if (opts.wing) params.set('wing', opts.wing)
  if (opts.room) params.set('room', opts.room)
  if (opts.limit) params.set('limit', String(opts.limit))
  return getJson('/search', params)
}

export function getBaseUrl(): string {
  return baseUrl
}
