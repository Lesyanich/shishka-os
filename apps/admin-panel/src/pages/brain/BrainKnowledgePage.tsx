import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Network } from 'vis-network'
import { DataSet } from 'vis-data'
import {
  Search,
  Plus,
  X,
  Maximize2,
  Minimize2,
  Shield,
  UtensilsCrossed,
  Wallet,
  Target,
  FileText,
  Bot,
  Monitor,
  Server,
  Wrench,
  BookOpen,

  Save,
  StickyNote,
  GitGraph,
  Trash2,
  MessagesSquare,
} from 'lucide-react'
import {
  searchDrawers,
  MemPalaceError,
  type MemPalaceSearchHit,
} from '../../api/mempalace'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface GraphNode {
  id: string
  label: string
  file_type: string
  source_file: string
  source_location: string
  community: number
}

interface GraphData {
  nodes: GraphNode[]
  edges: { source: string; target: string; relation: string }[]
}

interface BrainNote {
  id: string
  text: string
  ts: string
}

interface GraphAnalytics {
  generated_at: string
  summary: { nodes: number; edges: number; communities: number; cross_community_edges: number }
  confidence: { extracted: number; inferred: number; ambiguous: number }
  god_nodes: { id: string; label: string; degree: number; source_file: string; community: number }[]
  top_communities: { id: number; label: string; size: number }[]
}

interface CategoryDef {
  name: string
  nameRu: string
  icon: React.ElementType
  pattern: RegExp
  accent: string
  accentBg: string
  accentBorder: string
}

/* ------------------------------------------------------------------ */
/*  Categories                                                         */
/* ------------------------------------------------------------------ */

const CATEGORIES: CategoryDef[] = [
  {
    name: 'Rules & Protocol',
    nameRu: 'Правила и протокол',
    icon: Shield,
    pattern: /^docs\/constitution/,
    accent: 'text-rose-400',
    accentBg: 'bg-rose-500/10',
    accentBorder: 'border-l-rose-500',
  },
  {
    name: 'Kitchen & Bible',
    nameRu: 'Кухня и библия',
    icon: UtensilsCrossed,
    pattern: /^(docs\/bible|docs\/domain\/(kitchen|food|menu|recipe|product))/,
    accent: 'text-amber-400',
    accentBg: 'bg-amber-500/10',
    accentBorder: 'border-l-amber-500',
  },
  {
    name: 'Finance',
    nameRu: 'Финансы',
    icon: Wallet,
    pattern: /^docs\/(domain\/financ|projects\/admin\/modules\/financ)/,
    accent: 'text-emerald-400',
    accentBg: 'bg-emerald-500/10',
    accentBorder: 'border-l-emerald-500',
  },
  {
    name: 'Business Strategy',
    nameRu: 'Бизнес-стратегия',
    icon: Target,
    pattern: /^docs\/business/,
    accent: 'text-blue-400',
    accentBg: 'bg-blue-500/10',
    accentBorder: 'border-l-blue-500',
  },
  {
    name: 'Plans & Architecture',
    nameRu: 'Планы и архитектура',
    icon: FileText,
    pattern: /^docs\/(plans|projects)/,
    accent: 'text-violet-400',
    accentBg: 'bg-violet-500/10',
    accentBorder: 'border-l-violet-500',
  },
  {
    name: 'Agents',
    nameRu: 'Агенты',
    icon: Bot,
    pattern: /^agents\//,
    accent: 'text-fuchsia-400',
    accentBg: 'bg-fuchsia-500/10',
    accentBorder: 'border-l-fuchsia-500',
  },
  {
    name: 'Admin Panel',
    nameRu: 'Интерфейс',
    icon: Monitor,
    pattern: /^apps\/admin-panel/,
    accent: 'text-sky-400',
    accentBg: 'bg-sky-500/10',
    accentBorder: 'border-l-sky-500',
  },
  {
    name: 'Backend Services',
    nameRu: 'Сервисы',
    icon: Server,
    pattern: /^services\//,
    accent: 'text-teal-400',
    accentBg: 'bg-teal-500/10',
    accentBorder: 'border-l-teal-500',
  },
  {
    name: 'AI & Knowledge',
    nameRu: 'ИИ и знания',
    icon: BookOpen,
    pattern: /^knowledge\//,
    accent: 'text-indigo-400',
    accentBg: 'bg-indigo-500/10',
    accentBorder: 'border-l-indigo-500',
  },
  {
    name: 'Operations',
    nameRu: 'Операции',
    icon: Wrench,
    pattern: /^(docs\/operations|scripts\/)/,
    accent: 'text-slate-400',
    accentBg: 'bg-slate-500/10',
    accentBorder: 'border-l-slate-500',
  },
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const NOTES_KEY = 'shishka-brain-notes'

// Source-file patterns that don't belong in the Knowledge Graph:
//  - transactional/fixture data (receipt JSON, SQL backfills)
//  - tests and configs (infrastructure, not knowledge)
// graphify scans the whole repo and turns receipt JSON, line-items, test
// scaffolding etc. into nodes. The Brain is for concepts/architecture/rules,
// so we filter those nodes out at load time. Mirror this list in .claudeignore
// to keep noise out of future graph rebuilds at extraction time.
const EXCLUDED_SOURCE_PATTERNS: RegExp[] = [
  // Transactional / fixture data
  /\/migrations\/.*backfill/i,
  /agents\/[^/]+\/examples\//,
  /agents\/finance\/RECEIPT_PROCESSING/i,
  // Tests
  /\.test\.[jt]sx?$/,
  /\/__tests__\//,
  /(^|\/)vitest\.(setup|config)\.[jt]s$/,
  // Build / tool configs
  /(^|\/)(vite|eslint|tailwind|postcss|playwright)\.config\.[jt]s$/,
  /(^|\/)tsconfig(\.[\w.-]+)?\.json$/,
]

function loadNotes(): BrainNote[] {
  try {
    return JSON.parse(localStorage.getItem(NOTES_KEY) || '[]')
  } catch {
    return []
  }
}

function saveNotes(notes: BrainNote[]) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
}

/** Generate deterministic constellation dot positions from community data */
function constellationDots(
  communities: GraphAnalytics['top_communities'],
) {
  const seed = (id: number) => {
    const x = Math.sin(id * 127.1 + 311.7) * 43758.5453
    return x - Math.floor(x)
  }
  const colors = ['#fb7185', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#e879f9', '#38bdf8', '#2dd4bf', '#818cf8', '#94a3b8']
  return communities.slice(0, 12).map((c, i) => ({
    id: c.id,
    cx: seed(c.id * 3 + 1) * 80 + 10,
    cy: seed(c.id * 7 + 3) * 70 + 15,
    r: Math.max(3, Math.min(10, c.size / 8)),
    color: colors[i % colors.length],
  }))
}

/** Derive human-readable community label from god nodes in that community */
function communityLabel(
  communityId: number,
  godNodes: GraphAnalytics['god_nodes'],
  fallbackLabel: string,
): string {
  const god = godNodes.find((g) => g.community === communityId)
  if (god) return `${god.label} cluster`
  return fallbackLabel
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function BrainKnowledgePage() {
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [search, setSearch] = useState('')
  const [graphFullscreen, setGraphFullscreen] = useState(false)
  const [selectedComms, setSelectedComms] = useState<Set<number> | 'all'>('all')
  const [expandedComms, setExpandedComms] = useState<Set<number>>(new Set())
  const graphRef = useRef<HTMLDivElement>(null)
  const networkRef = useRef<Network | null>(null)
  const [hoverNode, setHoverNode] = useState<{ label: string; x: number; y: number } | null>(null)
  const [mode, setMode] = useState<'search' | 'add'>('search')
  const [noteText, setNoteText] = useState('')
  const [notes, setNotes] = useState<BrainNote[]>(loadNotes)
  const searchRef = useRef<HTMLInputElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  // Graph analytics
  const [analytics, setAnalytics] = useState<GraphAnalytics | null>(null)

  // MemPalace semantic search state
  const [memHits, setMemHits] = useState<MemPalaceSearchHit[] | null>(null)
  const [memLoading, setMemLoading] = useState(false)
  const [memError, setMemError] = useState<'offline' | 'error' | null>(null)
  const memSeq = useRef(0)

  // Debounced MemPalace semantic search (parallel to regex file search)
  useEffect(() => {
    if (search.length < 3) {
      setMemHits(null)
      setMemError(null)
      setMemLoading(false)
      return
    }
    const mySeq = ++memSeq.current
    setMemLoading(true)
    setMemError(null)
    const timer = setTimeout(() => {
      searchDrawers({ query: search, limit: 6 })
        .then((res) => {
          if (mySeq !== memSeq.current) return
          setMemHits(res.results)
          setMemLoading(false)
        })
        .catch((err: unknown) => {
          if (mySeq !== memSeq.current) return
          // HTTP error vs network failure (serve.py not running)
          setMemError(err instanceof MemPalaceError ? 'error' : 'offline')
          setMemHits(null)
          setMemLoading(false)
        })
    }, 250)
    return () => clearTimeout(timer)
  }, [search])

  // Load graph.json + analytics
  useEffect(() => {
    fetch('/graph.json')
      .then((r) => r.json())
      .then((data) => {
        const isExcluded = (sourceFile: string) =>
          EXCLUDED_SOURCE_PATTERNS.some((p) => p.test(sourceFile))
        const nodes: GraphNode[] = (data.nodes ?? []).filter(
          (n: GraphNode) => !isExcluded(n.source_file ?? ''),
        )
        const keepIds = new Set(nodes.map((n) => n.id))
        const edges = (data.links ?? []).filter(
          (e: { source: string; target: string }) =>
            keepIds.has(e.source) && keepIds.has(e.target),
        )
        setGraph({ nodes, edges })
      })
      .catch(() => {})

    fetch('/graph-analytics.json')
      .then((r) => r.json())
      .then((data: GraphAnalytics) => setAnalytics(data))
      .catch(() => {})
  }, [])

  // Cmd+K / Ctrl+K shortcut to open search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
      if (e.key === 'Escape') {
        setSearchOpen(false)
        setSearch('')
        setMode('search')
        setNoteText('')
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Search results
  const searchResults = useMemo(() => {
    if (!graph || search.length < 2) return null
    const q = search.toLowerCase()
    const matches = graph.nodes.filter(
      (n) => n.label.toLowerCase().includes(q) || n.source_file.toLowerCase().includes(q),
    )
    const grouped = new Map<string, GraphNode[]>()
    for (const node of matches) {
      let catName = 'Other'
      for (const cat of CATEGORIES) {
        if (cat.pattern.test(node.source_file)) {
          catName = cat.name
          break
        }
      }
      if (!grouped.has(catName)) grouped.set(catName, [])
      grouped.get(catName)!.push(node)
    }
    return { total: matches.length, grouped }
  }, [graph, search])

  // Connection count per node
  const connectionCount = useMemo(() => {
    if (!graph) return new Map<string, number>()
    const counts = new Map<string, number>()
    for (const e of graph.edges) {
      counts.set(e.source, (counts.get(e.source) || 0) + 1)
      counts.set(e.target, (counts.get(e.target) || 0) + 1)
    }
    return counts
  }, [graph])

  // Nodes grouped by community
  const commGroups = useMemo(() => {
    if (!graph || !analytics) return []
    const byComm = new Map<number, GraphNode[]>()
    for (const n of graph.nodes) {
      if (!byComm.has(n.community)) byComm.set(n.community, [])
      byComm.get(n.community)!.push(n)
    }
    return analytics.top_communities.map((c) => ({
      id: c.id,
      label: communityLabel(c.id, analytics.god_nodes, c.label),
      size: c.size,
      nodes: (byComm.get(c.id) ?? []).sort(
        (a, b) => (connectionCount.get(b.id) || 0) - (connectionCount.get(a.id) || 0),
      ),
    }))
  }, [graph, analytics, connectionCount])

  // Community color palette
  const COMM_COLORS = useMemo(() => {
    const palette = ['#fb7185', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#e879f9', '#38bdf8', '#2dd4bf', '#818cf8', '#94a3b8', '#f97316', '#06b6d4', '#84cc16', '#ec4899', '#8b5cf6']
    const map = new Map<number, string>()
    commGroups.forEach((c, i) => map.set(c.id, palette[i % palette.length]))
    return map
  }, [commGroups])

  // Render vis-network graph
  useEffect(() => {
    if (!graph || !graphRef.current) return

    const visibleComms = selectedComms === 'all'
      ? null
      : selectedComms

    const filteredNodes = visibleComms
      ? graph.nodes.filter((n) => visibleComms.has(n.community))
      : graph.nodes

    const nodeIds = new Set(filteredNodes.map((n) => n.id))
    const filteredEdges = graph.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))

    const nodes = new DataSet(filteredNodes.map((n) => ({
      id: n.id,
      label: n.label,
      color: {
        background: COMM_COLORS.get(n.community) ?? '#94a3b8',
        border: COMM_COLORS.get(n.community) ?? '#94a3b8',
        highlight: { background: '#fff', border: COMM_COLORS.get(n.community) ?? '#94a3b8' },
      },
      title: `${n.label}\n${n.file_type} · ${connectionCount.get(n.id) || 0} links`,
      font: { color: '#e0e0e0', size: 14, strokeWidth: 3, strokeColor: '#0f0f1a' },
      scaling: { label: { enabled: true, min: 10, max: 20 } },
      size: Math.max(5, Math.min(20, (connectionCount.get(n.id) || 1) * 2)),
    })))

    const edges = new DataSet(filteredEdges.map((e, i) => ({
      id: `e${i}`,
      from: e.source,
      to: e.target,
      color: { color: 'rgba(100,116,139,0.15)', highlight: 'rgba(100,116,139,0.4)' },
      width: 0.5,
    })))

    if (networkRef.current) {
      networkRef.current.destroy()
    }

    networkRef.current = new Network(graphRef.current, { nodes, edges }, {
      physics: {
        solver: 'forceAtlas2Based',
        forceAtlas2Based: { gravitationalConstant: -30, centralGravity: 0.005, springLength: 100 },
        stabilization: { iterations: 150 },
      },
      nodes: { shape: 'dot', borderWidth: 1, font: { vadjust: -8 } },
      edges: { smooth: { enabled: true, type: 'continuous', roundness: 0.5 } },
      interaction: { hover: true, tooltipDelay: 200, zoomView: true, dragView: true, hideEdgesOnDrag: true, hideEdgesOnZoom: true },
      layout: { improvedLayout: false },
    })

    // Custom hover tooltip via vis-network events
    const nodeMap = new Map(filteredNodes.map((n) => [n.id, n.label]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    networkRef.current.on('hoverNode', (p: any) => {
      const label = nodeMap.get(p.node as string)
      if (label && p.event?.center) {
        const rect = graphRef.current?.getBoundingClientRect()
        if (rect) {
          setHoverNode({ label, x: rect.left + p.event.center.x, y: rect.top + p.event.center.y })
        }
      }
    })
    networkRef.current.on('blurNode', () => setHoverNode(null))
    networkRef.current.on('zoom', () => setHoverNode(null))
    networkRef.current.on('dragStart', () => setHoverNode(null))

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy()
        networkRef.current = null
      }
      setHoverNode(null)
    }
  }, [graph, selectedComms, COMM_COLORS, connectionCount])

  // Toggle community selection
  const toggleComm = useCallback((id: number) => {
    setSelectedComms((prev) => {
      if (prev === 'all') {
        // Deselect this one → show all except this
        const all = new Set(commGroups.map((c) => c.id))
        all.delete(id)
        return all
      }
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      // If all selected, switch back to 'all'
      if (next.size === commGroups.length) return 'all'
      return next
    })
  }, [commGroups])

  // Add note
  function addNote() {
    if (!noteText.trim()) return
    const note: BrainNote = { id: crypto.randomUUID(), text: noteText.trim(), ts: new Date().toISOString() }
    const updated = [note, ...notes]
    setNotes(updated)
    saveNotes(updated)
    setNoteText('')
    setMode('search')
  }

  function deleteNote(id: string) {
    const updated = notes.filter((n) => n.id !== id)
    setNotes(updated)
    saveNotes(updated)
  }

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>
      <div className="space-y-6">
        {/* ─── Hero Stats ─── */}
        <section
          className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-slate-800/50"
          style={{ background: '#060612', minHeight: 200 }}
        >
          <div className="pointer-events-none absolute inset-0" style={{
            background: 'radial-gradient(ellipse at 30% 40%, rgba(139,92,246,0.08) 0%, transparent 60%), radial-gradient(ellipse at 70% 60%, rgba(56,189,248,0.06) 0%, transparent 50%)',
          }} />
          {analytics && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
              <defs>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                  <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              {(() => {
                const dots = constellationDots(analytics.top_communities)
                return (
                  <>
                    {dots.map((d, i) =>
                      dots.slice(i + 1).filter((_, j) => j < 2).map((d2) => (
                        <line key={`${d.id}-${d2.id}`} x1={`${d.cx}%`} y1={`${d.cy}%`} x2={`${d2.cx}%`} y2={`${d2.cy}%`} stroke={d.color} strokeOpacity={0.1} strokeWidth={1} />
                      )),
                    )}
                    {dots.map((d, i) => (
                      <circle key={d.id} cx={`${d.cx}%`} cy={`${d.cy}%`} r={d.r} fill={d.color} fillOpacity={0.7} filter="url(#glow)" style={{ animation: `pulse 3s ease-in-out ${i * 0.3}s infinite` }} />
                    ))}
                  </>
                )
              })()}
            </svg>
          )}
          <div className="relative z-10 flex flex-col items-center py-8">
            <p className="text-[11px] uppercase tracking-[3px] text-purple-400/60 mb-2">Shishka Brain</p>
            <p className="text-5xl font-extrabold tracking-tight" style={{ background: 'linear-gradient(135deg, #a78bfa, #38bdf8, #34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {analytics?.summary.nodes.toLocaleString() ?? '...'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              nodes across {analytics?.summary.communities.toLocaleString() ?? '...'} constellations
            </p>
            <div className="mt-4 flex gap-6">
              {[
                { value: analytics?.summary.edges, label: 'connections', color: 'text-sky-400' },
                { value: analytics?.summary.communities, label: 'clusters', color: 'text-amber-400' },
                { value: analytics ? Math.round((analytics.confidence.extracted / analytics.summary.edges) * 100) : null, label: '% extracted', color: 'text-emerald-400' },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <p className={`text-lg font-semibold ${s.color}`}>{s.value?.toLocaleString() ?? '...'}</p>
                  <p className="text-[9px] uppercase tracking-wider text-slate-600">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Graph + Community Sidebar ─── */}
        <section>
          <div className={graphFullscreen ? 'fixed inset-0 z-50 flex flex-col bg-slate-950' : 'flex flex-col'}>
            {/* Header bar */}
            <div className="flex items-center justify-between rounded-t-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-[11px]">
              <div className="flex items-center gap-4 text-slate-400">
                <GitGraph className="h-3 w-3 text-fuchsia-400" />
                <span className="text-slate-200">{graph?.nodes.length.toLocaleString() ?? '...'}</span> nodes ·{' '}
                <span className="text-slate-200">{graph?.edges.length.toLocaleString() ?? '...'}</span> edges
                {selectedComms !== 'all' && (
                  <span className="text-amber-400">
                    · showing {selectedComms.size} of {commGroups.length} communities
                  </span>
                )}
              </div>
              <button
                onClick={() => setGraphFullscreen((f) => !f)}
                className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-slate-300"
              >
                {graphFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </div>

            {/* Graph + Sidebar row */}
            <div className="flex border-x border-b border-slate-800 rounded-b-lg overflow-hidden" style={{ height: graphFullscreen ? 'calc(100% - 36px)' : 500, minHeight: 400 }}>
              {/* Graph canvas */}
              <div
                ref={graphRef}
                className="flex-1"
                style={{ background: '#0f0f1a' }}
              />

              {/* Communities sidebar */}
              {commGroups.length > 0 && (
                <div className="w-56 shrink-0 border-l border-slate-800 bg-slate-900/70 flex flex-col overflow-hidden">
                  {/* Sidebar header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Communities</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setSelectedComms('all')}
                        className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition ${selectedComms === 'all' ? 'bg-fuchsia-500/20 text-fuchsia-300' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setSelectedComms(new Set())}
                        className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition ${selectedComms !== 'all' && selectedComms.size === 0 ? 'bg-slate-700 text-slate-300' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        None
                      </button>
                    </div>
                  </div>

                  {/* Community list */}
                  <div className="flex-1 overflow-y-auto py-1">
                    {commGroups.map((c) => {
                      const isSelected = selectedComms === 'all' || selectedComms.has(c.id)
                      const color = COMM_COLORS.get(c.id) ?? '#94a3b8'
                      const isExpanded = expandedComms.has(c.id)
                      return (
                        <div key={c.id}>
                          <div className="flex items-center gap-1 px-2 py-1 hover:bg-slate-800/40">
                            {/* Select checkbox */}
                            <button
                              onClick={() => toggleComm(c.id)}
                              className="shrink-0 flex h-3.5 w-3.5 items-center justify-center rounded border transition"
                              style={{
                                borderColor: isSelected ? color : '#475569',
                                background: isSelected ? `${color}30` : 'transparent',
                              }}
                            >
                              {isSelected && (
                                <span className="block h-1.5 w-1.5 rounded-sm" style={{ background: color }} />
                              )}
                            </button>
                            {/* Expand / label */}
                            <button
                              onClick={() => {
                                setExpandedComms((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(c.id)) next.delete(c.id)
                                  else next.add(c.id)
                                  return next
                                })
                              }}
                              className="flex flex-1 items-center gap-1 min-w-0 text-left"
                            >
                              <span
                                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                                style={{ background: color }}
                              />
                              <span className={`truncate text-[10px] ${isSelected ? 'text-slate-200' : 'text-slate-500'}`}>
                                {c.label.replace(' cluster', '')}
                              </span>
                              <span className="shrink-0 text-[9px] text-slate-600 ml-auto">{c.size}</span>
                            </button>
                          </div>
                          {/* Expanded node list */}
                          {isExpanded && (
                            <div className="pl-7 pr-2 pb-1">
                              {c.nodes.slice(0, 15).map((n) => (
                                <p key={n.id} className="truncate text-[9px] text-slate-500 py-0.5" title={n.label}>
                                  {n.label}
                                </p>
                              ))}
                              {c.nodes.length > 15 && (
                                <p className="text-[9px] text-slate-600">+{c.nodes.length - 15} more</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* ─── Node Hover Tooltip ─── */}
      {hoverNode && createPortal(
        <div
          className="pointer-events-none fixed z-[60] rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-100 shadow-xl"
          style={{ left: hoverNode.x + 12, top: hoverNode.y - 10, maxWidth: 300 }}
        >
          {hoverNode.label}
        </div>,
        document.body,
      )}

      {/* ─── Floating Search Pill ─── */}
      <button
        onClick={() => setSearchOpen(true)}
        className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/90 px-4 py-2 text-xs text-slate-500 backdrop-blur-sm transition hover:border-slate-500 hover:text-slate-300"
      >
        <Search className="h-3.5 w-3.5" />
        Search...
        <kbd className="ml-1 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">⌘K</kbd>
      </button>

      {/* ─── Search Modal (portal) ─── */}
      {searchOpen && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          onClick={(e) => { if (e.target === e.currentTarget) { setSearchOpen(false); setSearch(''); setMode('search'); setNoteText('') } }}
        >
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
              {mode === 'search' ? (
                <Search className="h-4 w-4 shrink-0 text-fuchsia-400" />
              ) : (
                <Plus className="h-4 w-4 shrink-0 text-amber-400" />
              )}
              {mode === 'search' ? (
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Найди в базе знаний... (файлы, концепты, правила)"
                  className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none"
                  autoFocus
                />
              ) : (
                <input
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addNote() }}
                  placeholder="Добавь заметку в мозг..."
                  className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none"
                  autoFocus
                />
              )}
              {mode === 'add' && noteText && (
                <button onClick={addNote} className="rounded-lg bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-300 transition hover:bg-amber-500/30">
                  <Save className="inline-block h-3 w-3 mr-1" />Save
                </button>
              )}
              <div className="ml-1 flex gap-1 border-l border-slate-700 pl-2">
                <button
                  onClick={() => setMode('search')}
                  className={`rounded-md px-2 py-1 text-[10px] font-medium transition ${mode === 'search' ? 'bg-fuchsia-500/20 text-fuchsia-300' : 'text-slate-500 hover:text-slate-300'}`}
                >Search</button>
                <button
                  onClick={() => setMode('add')}
                  className={`rounded-md px-2 py-1 text-[10px] font-medium transition ${mode === 'add' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-500 hover:text-slate-300'}`}
                >+ Note</button>
              </div>
              <button
                onClick={() => { setSearchOpen(false); setSearch(''); setMode('search'); setNoteText('') }}
                className="rounded p-1 text-slate-500 hover:text-slate-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[50vh] overflow-y-auto p-4 space-y-4">
              {/* File search results */}
              {search.length >= 2 && searchResults && (
                <div>
                  <p className="mb-2 text-xs text-slate-500">
                    {searchResults.total} {searchResults.total === 1 ? 'result' : 'results'} for &ldquo;{search}&rdquo;
                  </p>
                  {searchResults.total === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-600">Nothing found.</p>
                  ) : (
                    <div className="space-y-3">
                      {[...searchResults.grouped.entries()].map(([catName, nodes]) => {
                        const def = CATEGORIES.find((c) => c.name === catName)
                        return (
                          <div key={catName}>
                            <h4 className={`mb-1.5 text-xs font-medium ${def?.accent ?? 'text-slate-400'}`}>
                              {catName} ({nodes.length})
                            </h4>
                            <div className="space-y-1">
                              {nodes.slice(0, 8).map((n) => (
                                <div key={n.id} className="flex items-center justify-between rounded-lg border border-slate-800/50 bg-slate-800/30 px-3 py-2 text-xs">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="truncate font-medium text-slate-200">{n.label}</span>
                                    <span className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">{n.file_type}</span>
                                  </div>
                                  <span className="shrink-0 text-[10px] text-slate-600 ml-2">{connectionCount.get(n.id) || 0} links</span>
                                </div>
                              ))}
                              {nodes.length > 8 && <p className="pl-3 text-[10px] text-slate-600">+{nodes.length - 8} more</p>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* MemPalace semantic results */}
              {search.length >= 3 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-medium text-indigo-400">
                    <MessagesSquare className="h-3.5 w-3.5" />
                    Из разговоров
                    <span className="text-[10px] font-normal text-slate-600">MemPalace</span>
                    {memLoading && <span className="text-[10px] font-normal text-slate-600">ищу...</span>}
                  </h4>
                  {memError === 'offline' ? (
                    <p className="text-xs text-slate-500">MemPalace не запущен.</p>
                  ) : memError === 'error' ? (
                    <p className="text-xs text-slate-500">Ошибка запроса к MemPalace.</p>
                  ) : memHits && memHits.length > 0 ? (
                    <div className="space-y-1.5">
                      {memHits.map((h, i) => (
                        <div key={`${h.source_file}-${i}`} className="rounded-lg border border-slate-800/50 bg-slate-800/30 px-3 py-2">
                          <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                            <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-indigo-300">{h.wing}</span>
                            <span className="rounded bg-slate-700 px-1.5 py-0.5 text-slate-400">{h.room}</span>
                            <span className="text-slate-600">{(h.similarity * 100).toFixed(0)}% match</span>
                          </div>
                          <p className="line-clamp-2 text-xs text-slate-300">{h.text}</p>
                          <p className="mt-1 truncate text-[10px] text-slate-600">{h.source_file}</p>
                        </div>
                      ))}
                    </div>
                  ) : memHits && memHits.length === 0 ? (
                    <p className="text-xs text-slate-600">Ничего не найдено.</p>
                  ) : null}
                </div>
              )}

              {/* Notes */}
              {!search && notes.length > 0 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-medium text-amber-400">
                    <StickyNote className="h-3.5 w-3.5" />
                    My notes ({notes.length})
                  </h4>
                  <div className="space-y-1.5">
                    {notes.slice(0, 10).map((n) => (
                      <div key={n.id} className="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-amber-500/5">
                        <p className="flex-1 text-xs text-slate-300">{n.text}</p>
                        <span className="shrink-0 text-[10px] text-slate-600">
                          {new Date(n.ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                        </span>
                        <button
                          onClick={() => deleteNote(n.id)}
                          className="shrink-0 rounded p-0.5 text-slate-700 opacity-0 transition group-hover:opacity-100 hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!search && notes.length === 0 && mode === 'search' && (
                <p className="py-8 text-center text-sm text-slate-600">
                  Type to search knowledge graph, or switch to + Note
                </p>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
