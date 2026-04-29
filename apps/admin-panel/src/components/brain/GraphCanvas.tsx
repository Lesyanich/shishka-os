// Slim vis-network canvas extracted from BrainKnowledgePage for use inside
// the unified Brain explore view (sidebar + graph + reader). Keeps the same
// look (community colors, hover tooltip) but trims search overlay, notes,
// communities sidebar, fullscreen, and god-nodes panel — those still live
// in the standalone /brain/knowledge page.
//
// Click on a vault node (source_file starting with `vault/`) → onNodeClick
// fires with the vault-relative path (e.g. "Menu/README.md"). The parent
// uses that to update the reader.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Network } from 'vis-network'
import { DataSet } from 'vis-data'

interface GraphNode {
  id: string
  label: string
  file_type: string
  source_file: string
  source_location: string
  community: number
}

interface GraphEdge {
  source: string
  target: string
  relation?: string
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const EXCLUDED_SOURCE_PATTERNS: RegExp[] = [
  /\/migrations\/.*backfill/i,
  /agents\/[^/]+\/examples\//,
  /agents\/finance\/RECEIPT_PROCESSING/i,
  /\.test\.[jt]sx?$/,
  /\/__tests__\//,
  /(^|\/)vitest\.(setup|config)\.[jt]s$/,
  /(^|\/)(vite|eslint|tailwind|postcss|playwright)\.config\.[jt]s$/,
  /(^|\/)tsconfig(\.[\w.-]+)?\.json$/,
]

// Stable, distinct community colors (subset of vis-network friendly palette).
const COMM_COLORS = [
  '#f472b6', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24',
  '#fb7185', '#22d3ee', '#84cc16', '#f97316', '#c084fc',
  '#2dd4bf', '#facc15', '#f43f5e', '#38bdf8', '#a3e635',
]

interface Props {
  /** Currently-selected vault page path (e.g. "Menu/README.md"). When provided
   *  and the corresponding node exists, it gets a fuchsia ring + camera focus. */
  selectedPath?: string
  /** Called when the user clicks a node whose source_file is under vault/.
   *  Receives the vault-relative path (without the `vault/` prefix). */
  onNodeClick: (vaultPath: string) => void
  className?: string
}

export function GraphCanvas({ selectedPath, onNodeClick, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const networkRef = useRef<Network | null>(null)
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [hoverNode, setHoverNode] = useState<{ label: string; x: number; y: number } | null>(null)

  // Load graph.json
  useEffect(() => {
    fetch('/graph.json')
      .then((r) => r.json())
      .then((data) => {
        const isExcluded = (sf: string) =>
          EXCLUDED_SOURCE_PATTERNS.some((p) => p.test(sf))
        const nodes: GraphNode[] = (data.nodes ?? []).filter(
          (n: GraphNode) => !isExcluded(n.source_file ?? '')
        )
        const keepIds = new Set(nodes.map((n) => n.id))
        const edges: GraphEdge[] = (data.links ?? []).filter(
          (e: GraphEdge) => keepIds.has(e.source) && keepIds.has(e.target)
        )
        setGraph({ nodes, edges })
      })
      .catch(() => setGraph({ nodes: [], edges: [] }))
  }, [])

  // Connection count per node — for sizing
  const connectionCount = useMemo(() => {
    if (!graph) return new Map<string, number>()
    const counts = new Map<string, number>()
    for (const e of graph.edges) {
      counts.set(e.source, (counts.get(e.source) || 0) + 1)
      counts.set(e.target, (counts.get(e.target) || 0) + 1)
    }
    return counts
  }, [graph])

  // The id of the currently-selected vault node (if any in graph)
  const selectedNodeId = useMemo(() => {
    if (!graph || !selectedPath) return null
    const wanted = `vault/${selectedPath}`
    return graph.nodes.find((n) => (n.source_file ?? '') === wanted)?.id ?? null
  }, [graph, selectedPath])

  // Initialize / re-initialize network
  useEffect(() => {
    if (!graph || !containerRef.current) return

    const nodes = new DataSet(
      graph.nodes.map((n) => {
        const isSelected = selectedNodeId === n.id
        // Some Graphify nodes (community aggregates) lack source_file —
        // coerce to empty string before startsWith.
        const isVault = (n.source_file ?? '').startsWith('vault/')
        const color = COMM_COLORS[n.community % COMM_COLORS.length]
        const conn = connectionCount.get(n.id) || 0
        const size = Math.min(8 + conn * 0.8, 26)
        return {
          id: n.id,
          label: n.label,
          shape: isVault ? 'dot' : 'dot',
          size,
          color: {
            background: color,
            border: isSelected ? '#f0abfc' : isVault ? '#94a3b8' : color,
            highlight: { background: color, border: '#f0abfc' },
          },
          borderWidth: isSelected ? 3 : isVault ? 1.5 : 0.5,
          font: { size: 10, color: '#cbd5e1' },
        }
      })
    )

    const edges = new DataSet(
      graph.edges.map((e, i) => ({
        id: i,
        from: e.source,
        to: e.target,
        color: { color: 'rgba(148, 163, 184, 0.15)', highlight: '#f0abfc' },
        width: 0.5,
        smooth: false,
      }))
    )

    if (networkRef.current) {
      networkRef.current.destroy()
      networkRef.current = null
    }

    networkRef.current = new Network(
      containerRef.current,
      { nodes, edges },
      {
        physics: {
          enabled: true,
          solver: 'forceAtlas2Based',
          forceAtlas2Based: { gravitationalConstant: -50, springLength: 90 },
          stabilization: { iterations: 200 },
        },
        interaction: { hover: true, dragNodes: true, zoomView: true, hideEdgesOnDrag: true },
        nodes: { shadow: false },
        edges: { shadow: false },
        layout: { improvedLayout: false },
      }
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    networkRef.current.on('hoverNode', (p: any) => {
      const node = graph.nodes.find((n) => n.id === p.node)
      if (node && p.event?.center) {
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect) {
          setHoverNode({
            label: node.label,
            x: rect.left + p.event.center.x,
            y: rect.top + p.event.center.y,
          })
        }
      }
    })
    networkRef.current.on('blurNode', () => setHoverNode(null))
    networkRef.current.on('zoom', () => setHoverNode(null))
    networkRef.current.on('dragStart', () => setHoverNode(null))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    networkRef.current.on('click', (p: any) => {
      const id = (p?.nodes?.[0] as string) || null
      if (!id) return
      const node = graph.nodes.find((n) => n.id === id)
      if (!node) return
      const m = /^vault\/(.+\.md)$/.exec(node.source_file ?? '')
      if (m) onNodeClick(m[1])
    })

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy()
        networkRef.current = null
      }
      setHoverNode(null)
    }
  }, [graph, selectedNodeId, connectionCount, onNodeClick])

  // When selection changes after network is built, focus the camera on it
  useEffect(() => {
    if (!networkRef.current || !selectedNodeId) return
    networkRef.current.focus(selectedNodeId, {
      scale: 1.1,
      animation: { duration: 600, easingFunction: 'easeInOutQuad' },
    })
  }, [selectedNodeId])

  return (
    <div className={['relative h-full w-full', className ?? ''].join(' ')}>
      <div ref={containerRef} className="h-full w-full" />
      {hoverNode && (
        <div
          style={{ left: hoverNode.x + 14, top: hoverNode.y + 14 }}
          className="pointer-events-none fixed z-50 rounded border border-slate-700 bg-slate-900/95 px-2 py-1 text-[11px] text-slate-200 shadow-lg"
        >
          {hoverNode.label}
        </div>
      )}
      {!graph && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
          Loading graph…
        </div>
      )}
    </div>
  )
}
