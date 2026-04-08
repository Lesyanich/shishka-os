import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import { Loader2, RefreshCw, Search, AlertTriangle } from 'lucide-react'
import {
  fetchGraph,
  fetchHealth,
  getBaseUrl,
  LightragError,
  type LightragEdge,
  type LightragGraphPayload,
  type LightragNode,
} from '../../api/lightrag'
import { NodeDetailPanel } from './components/NodeDetailPanel'
import { GraphFilters, type GraphFiltersState } from './components/GraphFilters'

// ── Color palette (deterministic per entity_type) ──
const PALETTE = [
  '#e879f9', // fuchsia
  '#34d399', // emerald
  '#60a5fa', // blue
  '#fbbf24', // amber
  '#f87171', // red
  '#a78bfa', // violet
  '#22d3ee', // cyan
  '#fb923c', // orange
]
const FALLBACK_COLOR = '#64748b' // slate-500

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function colorForType(type: string | undefined): string {
  if (!type) return FALLBACK_COLOR
  return PALETTE[hashString(type) % PALETTE.length]
}

// ── Graph node shape consumed by react-force-graph-2d ──
interface GraphNode {
  id: string
  name: string
  type: string
  color: string
  raw: LightragNode
  // Force-graph injects x, y, vx, vy at runtime
  x?: number
  y?: number
}

interface GraphLink {
  source: string
  target: string
  raw: LightragEdge
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; payload: LightragGraphPayload }
  | { kind: 'unreachable' }
  | { kind: 'error'; message: string; details?: string }

const MIN_ENTITY_TYPES_FOR_FILTER_DEFAULT_ON = true

export function LightragGraph() {
  const [load, setLoad] = useState<LoadState>({ kind: 'idle' })
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filters, setFilters] = useState<GraphFiltersState>({
    enabledTypes: new Set<string>(),
    showIsolated: true,
    maxNodes: 500,
  })

  const containerRef = useRef<HTMLDivElement | null>(null)
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined)
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 600 })

  // Debounce search input (300ms)
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 300)
    return () => window.clearTimeout(t)
  }, [search])

  // Resize observer for the canvas container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setSize({ w: Math.max(200, Math.floor(width)), h: Math.max(200, Math.floor(height)) })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const reload = useCallback(async () => {
    setLoad({ kind: 'loading' })
    try {
      // Health check first — gives us a clean "server down" branch
      await fetchHealth()
    } catch {
      setLoad({ kind: 'unreachable' })
      return
    }
    try {
      const payload = await fetchGraph({ label: '*', maxDepth: 3, maxNodes: filters.maxNodes })
      setLoad({ kind: 'ready', payload })
    } catch (err) {
      if (err instanceof LightragError) {
        setLoad({
          kind: 'error',
          message: err.message,
          details: err.body,
        })
      } else {
        setLoad({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }
  }, [filters.maxNodes])

  useEffect(() => {
    void reload()
  }, [reload])

  // Initialize entity-type filter from first successful load
  useEffect(() => {
    if (load.kind !== 'ready') return
    const types = new Set<string>()
    for (const n of load.payload.nodes) {
      types.add((n.properties.entity_type as string) || '')
    }
    setFilters((prev) => {
      // Only seed if untouched (empty set) — preserves user toggles on reload
      if (prev.enabledTypes.size > 0) return prev
      return MIN_ENTITY_TYPES_FOR_FILTER_DEFAULT_ON
        ? { ...prev, enabledTypes: types }
        : prev
    })
  }, [load])

  // Compute graph data after filters/search
  const { graphNodes, graphLinks, allTypes, isolatedCount } = useMemo(() => {
    if (load.kind !== 'ready') {
      return { graphNodes: [], graphLinks: [], allTypes: [] as string[], isolatedCount: 0 }
    }
    const types = new Set<string>()
    for (const n of load.payload.nodes) types.add((n.properties.entity_type as string) || '')

    // Edge index → degree
    const degree = new Map<string, number>()
    for (const e of load.payload.edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
    }

    const nodes: GraphNode[] = []
    let isolated = 0
    for (const n of load.payload.nodes) {
      const t = (n.properties.entity_type as string) || ''
      const d = degree.get(n.id) ?? 0
      if (d === 0) isolated += 1
      if (!filters.enabledTypes.has(t)) continue
      if (!filters.showIsolated && d === 0) continue
      if (debouncedSearch && !n.id.toLowerCase().includes(debouncedSearch)) continue
      nodes.push({
        id: n.id,
        name: n.id,
        type: t,
        color: colorForType(t),
        raw: n,
      })
    }
    const allowedIds = new Set(nodes.map((n) => n.id))
    const links: GraphLink[] = load.payload.edges
      .filter((e) => allowedIds.has(e.source) && allowedIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, raw: e }))

    return {
      graphNodes: nodes,
      graphLinks: links,
      allTypes: Array.from(types).sort(),
      isolatedCount: isolated,
    }
  }, [load, filters, debouncedSearch])

  // Selected node + its edges from the full payload
  const { selectedNode, relatedEdges } = useMemo(() => {
    if (load.kind !== 'ready' || !selectedId) {
      return { selectedNode: null as LightragNode | null, relatedEdges: [] as LightragEdge[] }
    }
    const node = load.payload.nodes.find((n) => n.id === selectedId) ?? null
    const edges = load.payload.edges.filter(
      (e) => e.source === selectedId || e.target === selectedId,
    )
    return { selectedNode: node, relatedEdges: edges }
  }, [load, selectedId])

  // Focus first search match
  useEffect(() => {
    if (!debouncedSearch || graphNodes.length === 0 || !fgRef.current) return
    const match = graphNodes[0]
    if (match && typeof match.x === 'number' && typeof match.y === 'number') {
      fgRef.current.centerAt(match.x, match.y, 600)
      fgRef.current.zoom(2.5, 600)
    }
  }, [debouncedSearch, graphNodes])

  return (
    <div className="flex h-full min-h-[600px] overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
      {/* Main canvas column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search entities…"
              className="w-full rounded-md border border-slate-800 bg-slate-900 py-1.5 pl-7 pr-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-fuchsia-500/60 focus:outline-none"
            />
          </div>
          <div className="flex-1" />
          <span className="text-[11px] text-slate-500">
            {load.kind === 'ready'
              ? `${graphNodes.length}/${load.payload.nodes.length} nodes · ${graphLinks.length} edges`
              : '—'}
          </span>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={load.kind === 'loading'}
            className="flex items-center gap-1 rounded-md border border-slate-800 px-2 py-1 text-[11px] text-slate-300 transition hover:border-slate-700 hover:text-slate-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${load.kind === 'loading' ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Canvas */}
        <div ref={containerRef} className="relative flex-1 min-h-0 bg-slate-950">
          {load.kind === 'loading' && (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading graph…
            </div>
          )}

          {load.kind === 'unreachable' && (
            <UnreachableState onRetry={() => void reload()} />
          )}

          {load.kind === 'error' && (
            <ErrorState message={load.message} details={load.details} onRetry={() => void reload()} />
          )}

          {load.kind === 'ready' && load.payload.nodes.length === 0 && (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              No entities indexed yet. Run an ingest into LightRAG.
            </div>
          )}

          {load.kind === 'ready' && load.payload.nodes.length > 0 && (
            <ForceGraph2D
              ref={fgRef}
              width={size.w}
              height={size.h}
              graphData={{ nodes: graphNodes, links: graphLinks }}
              backgroundColor="#020617" /* slate-950 */
              nodeRelSize={5}
              nodeLabel={(n) => {
                const node = n as GraphNode
                return node.type ? `${node.name} · ${node.type}` : node.name
              }}
              nodeAutoColorBy={undefined}
              nodeColor={(n) => (n as GraphNode).color}
              linkColor={() => 'rgba(148,163,184,0.35)' /* slate-400 35% */}
              linkDirectionalArrowLength={3}
              linkDirectionalArrowRelPos={1}
              linkLabel={(l) => {
                const link = l as unknown as GraphLink
                return link.raw.properties.description ?? link.raw.properties.keywords ?? ''
              }}
              onNodeClick={(n) => setSelectedId((n as GraphNode).id)}
              cooldownTicks={120}
            />
          )}
        </div>
      </div>

      {/* Right: detail panel OR filters */}
      {selectedNode ? (
        <NodeDetailPanel
          node={selectedNode}
          relatedEdges={relatedEdges}
          onClose={() => setSelectedId(null)}
          onSelectNode={(id) => setSelectedId(id)}
        />
      ) : (
        <GraphFilters
          allTypes={allTypes}
          typeColor={colorForType}
          state={filters}
          onChange={setFilters}
          isolatedCount={isolatedCount}
        />
      )}
    </div>
  )
}

function UnreachableState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-300">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <h2 className="text-sm font-semibold text-slate-100">LightRAG server unreachable</h2>
        <p className="mt-2 text-xs text-slate-500">
          Cannot reach <code className="rounded bg-slate-900 px-1">{getBaseUrl()}</code>. Start it via{' '}
          <code className="rounded bg-slate-900 px-1">services/lightrag/run-server.sh</code> and click
          retry.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 transition hover:border-fuchsia-500/60 hover:text-fuchsia-200"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    </div>
  )
}

function ErrorState({
  message,
  details,
  onRetry,
}: {
  message: string
  details?: string
  onRetry: () => void
}) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="max-w-md">
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-300">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <h2 className="text-sm font-semibold text-slate-100">LightRAG error</h2>
        <p className="mt-2 text-xs text-slate-400">{message}</p>
        {details && (
          <details className="mt-2 text-[11px] text-slate-500">
            <summary className="cursor-pointer">Raw response</summary>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-900 p-2 font-mono">
              {details}
            </pre>
          </details>
        )}
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 transition hover:border-fuchsia-500/60 hover:text-fuchsia-200"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    </div>
  )
}
