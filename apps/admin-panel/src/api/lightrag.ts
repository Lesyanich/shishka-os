/**
 * LightRAG REST client for the Brain View (L2 tab).
 *
 * Talks directly to the LightRAG server (default `http://localhost:9621`).
 * No MCP wrapper exists yet.
 * TODO(brain-view): switch to MCP wrapper when shishka-lightrag MCP server ships.
 *
 * Verified `/graphs?label=*&max_depth=3&max_nodes=50` response shape (2026-04-08):
 *
 * ```
 * {
 *   nodes: [
 *     {
 *       id: "L1 Infrastructure",
 *       labels: ["L1 Infrastructure"],
 *       properties: {
 *         entity_id: "L1 Infrastructure",
 *         entity_type: "concept",
 *         description: "...",
 *         source_id: "chunk-...",
 *         file_path: "docs/bible/menu-concept.md",
 *         created_at: 1775627768,
 *         truncate: ""
 *       }
 *     }
 *   ],
 *   edges: [
 *     {
 *       id: "CENTRAL KITCHEN MODEL-L1 KITCHEN",
 *       type: "DIRECTED",
 *       source: "CENTRAL KITCHEN MODEL",
 *       target: "L1 KITCHEN",
 *       properties: {
 *         weight: 1.0,
 *         description: "...",
 *         keywords: "model, philosophy, ...",
 *         source_id: "chunk-...",
 *         file_path: "docs/bible/operations.md",
 *         created_at: 1775636360
 *       }
 *     }
 *   ],
 *   is_truncated: false
 * }
 * ```
 */

const DEFAULT_BASE_URL = 'http://localhost:9621'

const baseUrl: string =
  (import.meta.env.VITE_LIGHTRAG_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  DEFAULT_BASE_URL

const apiKey: string = (import.meta.env.VITE_LIGHTRAG_API_KEY as string | undefined) ?? ''

export interface LightragNodeProperties {
  entity_id?: string
  entity_type?: string
  description?: string
  source_id?: string
  file_path?: string
  created_at?: number
  [k: string]: unknown
}

export interface LightragNode {
  id: string
  labels: string[]
  properties: LightragNodeProperties
}

export interface LightragEdgeProperties {
  weight?: number
  description?: string
  keywords?: string
  source_id?: string
  file_path?: string
  created_at?: number
  [k: string]: unknown
}

export interface LightragEdge {
  id: string
  type: string
  source: string
  target: string
  properties: LightragEdgeProperties
}

export interface LightragGraphPayload {
  nodes: LightragNode[]
  edges: LightragEdge[]
  is_truncated: boolean
}

export interface LightragHealth {
  status: string
  webui_available?: boolean
  working_directory?: string
  input_directory?: string
  configuration?: Record<string, unknown>
}

function withApiKey(params: URLSearchParams): URLSearchParams {
  if (apiKey) params.set('api_key_header_value', apiKey)
  return params
}

async function getJson<T>(path: string, params?: URLSearchParams): Promise<T> {
  const qs = params ? `?${params.toString()}` : ''
  const url = `${baseUrl}${path}${qs}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new LightragError(
      `LightRAG ${res.status} ${res.statusText} on ${path}`,
      res.status,
      body,
    )
  }
  return (await res.json()) as T
}

export class LightragError extends Error {
  status: number
  body: string
  constructor(message: string, status: number, body: string) {
    super(message)
    this.name = 'LightragError'
    this.status = status
    this.body = body
  }
}

export async function fetchHealth(): Promise<LightragHealth> {
  return getJson<LightragHealth>('/health')
}

export async function fetchGraph(opts: {
  label?: string
  maxDepth?: number
  maxNodes?: number
}): Promise<LightragGraphPayload> {
  const params = withApiKey(
    new URLSearchParams({
      label: opts.label ?? '*',
      max_depth: String(opts.maxDepth ?? 3),
      max_nodes: String(opts.maxNodes ?? 500),
    }),
  )
  return getJson<LightragGraphPayload>('/graphs', params)
}

export async function listLabels(): Promise<string[]> {
  return getJson<string[]>('/graph/label/list')
}

export type QueryMode = 'naive' | 'local' | 'global' | 'hybrid' | 'mix'

export interface QueryBrainResponse {
  response: string
}

export async function queryBrain(
  query: string,
  mode: QueryMode = 'mix',
): Promise<QueryBrainResponse> {
  const params = withApiKey(new URLSearchParams({ mode }))
  const qs = params.toString() ? `?${params.toString()}` : ''
  const url = `${baseUrl}/query${qs}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new LightragError(
      `LightRAG ${res.status} ${res.statusText} on /query`,
      res.status,
      body,
    )
  }
  return (await res.json()) as QueryBrainResponse
}

export function getBaseUrl(): string {
  return baseUrl
}
