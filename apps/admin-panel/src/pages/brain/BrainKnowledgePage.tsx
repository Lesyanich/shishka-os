import { useState, useEffect, useMemo, useRef, useCallback, createPortal } from 'react'
import { ForceGraph3D } from 'react-force-graph'
import {
  Search,
  Plus,
  X,
  ChevronRight,
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
  const [expandedComms, setExpandedComms] = useState<Set<number>>(new Set())
  const graphContainerRef = useRef<HTMLDivElement>(null)
  const [graphDimensions, setGraphDimensions] = useState({ width: 800, height: 500 })
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
      .then((data) => setGraph({ nodes: data.nodes, edges: data.links || [] }))
      .catch(() => {})

    fetch('/graph-analytics.json')
      .then((r) => r.json())
      .then((data: GraphAnalytics) => setAnalytics(data))
      .catch(() => {})
  }, [])

  // Track graph container size for ForceGraph3D
  useEffect(() => {
    const el = graphContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setGraphDimensions({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [graphFullscreen])

  // Community color palette for 3D graph
  const commColor = useCallback((node: { community?: number }) => {
    const palette = ['#fb7185', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#e879f9', '#38bdf8', '#2dd4bf', '#818cf8', '#94a3b8', '#f97316', '#06b6d4', '#84cc16', '#ec4899', '#8b5cf6']
    return palette[(node.community ?? 0) % palette.length]
  }, [])

  // Graph data in ForceGraph3D format
  const graphData3D = useMemo(() => {
    if (!graph) return { nodes: [], links: [] }
    return {
      nodes: graph.nodes.map((n) => ({ id: n.id, label: n.label, community: n.community, file_type: n.file_type })),
      links: graph.edges.map((e) => ({ source: e.source, target: e.target })),
    }
  }, [graph])

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

        {/* ─── 3D Brain Graph ─── */}
        <section>
          <div className={graphFullscreen ? 'fixed inset-0 z-50 flex flex-col bg-slate-950' : 'flex flex-col'}>
            <div className="flex items-center justify-between rounded-t-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-[11px]">
              <div className="flex items-center gap-4 text-slate-400">
                <GitGraph className="h-3 w-3 text-fuchsia-400" />
                <span className="text-slate-200">{graph?.nodes.length.toLocaleString() ?? '...'}</span> nodes ·{' '}
                <span className="text-slate-200">{graph?.edges.length.toLocaleString() ?? '...'}</span> edges
              </div>
              <button
                onClick={() => setGraphFullscreen((f) => !f)}
                className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-slate-300"
              >
                {graphFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div
              ref={graphContainerRef}
              className="rounded-b-lg border border-t-0 border-slate-800 overflow-hidden"
              style={{ height: graphFullscreen ? 'calc(100% - 36px)' : 500, minHeight: 400, background: '#060612' }}
            >
              {graphData3D.nodes.length > 0 && (
                <ForceGraph3D
                  width={graphDimensions.width}
                  height={graphFullscreen ? window.innerHeight - 36 : 500}
                  graphData={graphData3D}
                  backgroundColor="#060612"
                  nodeColor={commColor}
                  nodeOpacity={0.9}
                  nodeResolution={8}
                  nodeVal={(node: { community?: number }) => Math.max(2, (connectionCount.get((node as { id: string }).id) || 1) * 0.5)}
                  linkColor={() => 'rgba(100, 116, 139, 0.15)'}
                  linkWidth={0.3}
                  linkOpacity={0.2}
                  showNavInfo={false}
                  nodeLabel={(node: { label?: string; file_type?: string }) => `${node.label ?? ''} (${node.file_type ?? ''})`}
                />
              )}
            </div>
          </div>
        </section>

        {/* ─── Communities (expandable) ─── */}
        {commGroups.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Communities · {commGroups.length}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setExpandedComms(new Set(commGroups.map((c) => c.id)))}
                  className="text-[10px] text-slate-500 hover:text-slate-300 transition"
                >
                  Expand all
                </button>
                <span className="text-slate-700">|</span>
                <button
                  onClick={() => setExpandedComms(new Set())}
                  className="text-[10px] text-slate-500 hover:text-slate-300 transition"
                >
                  Collapse all
                </button>
              </div>
            </div>
            <div className="space-y-1">
              {commGroups.map((c) => {
                const isOpen = expandedComms.has(c.id)
                return (
                  <div key={c.id}>
                    <button
                      onClick={() => {
                        setExpandedComms((prev) => {
                          const next = new Set(prev)
                          if (next.has(c.id)) next.delete(c.id)
                          else next.add(c.id)
                          return next
                        })
                      }}
                      className="flex w-full items-center justify-between rounded-lg bg-slate-800/30 px-3 py-2 text-xs hover:bg-slate-800/50 transition text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ChevronRight className={`h-3 w-3 shrink-0 text-slate-600 transition ${isOpen ? 'rotate-90' : ''}`} />
                        <span className="truncate font-medium text-slate-200">{c.label}</span>
                      </div>
                      <span className="shrink-0 ml-2 text-[10px] text-amber-400">{c.size} nodes</span>
                    </button>
                    {isOpen && c.nodes.length > 0 && (
                      <div className="ml-5 mt-1 mb-2 space-y-0.5">
                        {c.nodes.slice(0, 20).map((n) => (
                          <div key={n.id} className="flex items-center justify-between rounded px-3 py-1 text-xs text-slate-400 hover:bg-slate-800/20">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="truncate text-slate-300">{n.label}</span>
                              <span className="shrink-0 rounded bg-slate-700 px-1 py-0.5 text-[9px] text-slate-500">{n.file_type}</span>
                            </div>
                            <span className={`shrink-0 ml-2 text-[10px] ${(connectionCount.get(n.id) || 0) > 5 ? 'text-fuchsia-400' : 'text-slate-600'}`}>
                              {connectionCount.get(n.id) || 0} links
                            </span>
                          </div>
                        ))}
                        {c.nodes.length > 20 && (
                          <p className="pl-3 text-[10px] text-slate-600">+{c.nodes.length - 20} more</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>

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
