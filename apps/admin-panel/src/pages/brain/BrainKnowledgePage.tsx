/* eslint-disable @typescript-eslint/no-unused-vars -- scaffold phase: imports/state used in Tasks 2-6 */
import { useState, useEffect, useMemo, useRef, createPortal } from 'react'
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
  ArrowRight,
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

/** Hex colors for dynamic styles where Tailwind classes can't be used */
const ACCENT_HEX: Record<string, string> = {
  'text-rose-400': '#fb7185', 'text-amber-400': '#fbbf24', 'text-emerald-400': '#34d399',
  'text-blue-400': '#60a5fa', 'text-violet-400': '#a78bfa', 'text-fuchsia-400': '#e879f9',
  'text-sky-400': '#38bdf8', 'text-teal-400': '#2dd4bf', 'text-indigo-400': '#818cf8',
  'text-slate-400': '#94a3b8',
}

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

function categorizeNodes(nodes: GraphNode[]) {
  const result: { def: CategoryDef; nodes: GraphNode[] }[] = CATEGORIES.map((def) => ({
    def,
    nodes: [],
  }))
  const other: GraphNode[] = []

  for (const node of nodes) {
    let matched = false
    for (const cat of result) {
      if (cat.def.pattern.test(node.source_file)) {
        cat.nodes.push(node)
        matched = true
        break
      }
    }
    if (!matched) other.push(node)
  }

  // Only include categories with nodes, sorted by count desc
  const filled = result.filter((c) => c.nodes.length > 0).sort((a, b) => b.nodes.length - a.nodes.length)
  return { categories: filled, other }
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

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function BrainKnowledgePage() {
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [showGraph, setShowGraph] = useState(false)
  const [graphFullscreen, setGraphFullscreen] = useState(false)
  const [mode, setMode] = useState<'search' | 'add'>('search')
  const [noteText, setNoteText] = useState('')
  const [notes, setNotes] = useState<BrainNote[]>(loadNotes)
  const searchRef = useRef<HTMLInputElement>(null)

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
      .finally(() => setLoading(false))

    fetch('/graph-analytics.json')
      .then((r) => r.json())
      .then((data: GraphAnalytics) => setAnalytics(data))
      .catch(() => {})
  }, [])

  // Categorized nodes
  const { categories: cats, other } = useMemo(
    () => (graph ? categorizeNodes(graph.nodes) : { categories: [], other: [] }),
    [graph],
  )

  // Search results
  const searchResults = useMemo(() => {
    if (!graph || search.length < 2) return null
    const q = search.toLowerCase()
    const matches = graph.nodes.filter(
      (n) => n.label.toLowerCase().includes(q) || n.source_file.toLowerCase().includes(q),
    )
    // Group by category
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

  // Selected category nodes
  const selectedNodes = useMemo(() => {
    if (!selectedCat) return null
    const cat = cats.find((c) => c.def.name === selectedCat)
    if (!cat) return null
    // Sort by connections desc
    return [...cat.nodes].sort(
      (a, b) => (connectionCount.get(b.id) || 0) - (connectionCount.get(a.id) || 0),
    )
  }, [selectedCat, cats, connectionCount])

  const selectedDef = selectedCat ? cats.find((c) => c.def.name === selectedCat)?.def : null

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>
      <div className="space-y-12">
        {/* ─── Section 1: Constellation Hero ─── */}
        <section
          className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-slate-800/50"
          style={{ background: '#060612', minHeight: 340 }}
        >
          {/* Radial gradient depth */}
          <div className="pointer-events-none absolute inset-0" style={{
            background: 'radial-gradient(ellipse at 30% 40%, rgba(139,92,246,0.08) 0%, transparent 60%), radial-gradient(ellipse at 70% 60%, rgba(56,189,248,0.06) 0%, transparent 50%)',
          }} />

          {/* SVG constellation */}
          {analytics && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
              <defs>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {(() => {
                const dots = constellationDots(analytics.top_communities)
                return (
                  <>
                    {dots.map((d, i) =>
                      dots.slice(i + 1).filter((_, j) => j < 2).map((d2) => (
                        <line
                          key={`${d.id}-${d2.id}`}
                          x1={`${d.cx}%`} y1={`${d.cy}%`}
                          x2={`${d2.cx}%`} y2={`${d2.cy}%`}
                          stroke={d.color}
                          strokeOpacity={0.1}
                          strokeWidth={1}
                        />
                      )),
                    )}
                    {dots.map((d, i) => (
                      <circle
                        key={d.id}
                        cx={`${d.cx}%`} cy={`${d.cy}%`}
                        r={d.r}
                        fill={d.color}
                        fillOpacity={0.7}
                        filter="url(#glow)"
                        style={{ animation: `pulse 3s ease-in-out ${i * 0.3}s infinite` }}
                      />
                    ))}
                  </>
                )
              })()}
            </svg>
          )}

          {/* Center content */}
          <div className="relative z-10 flex flex-col items-center py-12">
            <p className="text-[11px] uppercase tracking-[3px] text-purple-400/60 mb-2">Shishka Brain</p>
            <p
              className="text-5xl font-extrabold tracking-tight"
              style={{
                background: 'linear-gradient(135deg, #a78bfa, #38bdf8, #34d399)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {analytics?.summary.nodes.toLocaleString() ?? '...'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              nodes across {analytics?.summary.communities.toLocaleString() ?? '...'} constellations
            </p>

            {/* Stat pills */}
            <div className="mt-6 flex gap-6">
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

            {/* Category color legend */}
            <div className="mt-4 flex gap-1.5">
              {cats.slice(0, 7).map(({ def }) => (
                <div
                  key={def.name}
                  className="h-2 w-2 rounded-full"
                  title={def.nameRu}
                  style={{ background: ACCENT_HEX[def.accent] ?? '#94a3b8' }}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ─── Section 2: Knowledge Domains Treemap ─── */}
        {!selectedCat ? (
          <section>
            <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">
              Knowledge Domains
            </h3>
            {loading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-800 bg-slate-900/50" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {cats.map(({ def, nodes }, i) => (
                  <button
                    key={def.name}
                    onClick={() => setSelectedCat(def.name)}
                    className={[
                      'group relative overflow-hidden rounded-xl border text-left transition-all duration-200',
                      'hover:scale-[1.02] hover:border-slate-600',
                      i === 0 ? 'sm:row-span-2 sm:min-h-[172px]' : 'min-h-[80px]',
                    ].join(' ')}
                    style={{
                      background: `${ACCENT_HEX[def.accent] ?? '#94a3b8'}08`,
                      borderColor: `${ACCENT_HEX[def.accent] ?? '#94a3b8'}25`,
                    }}
                  >
                    <div className="flex h-full flex-col justify-between p-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <def.icon className={`h-4 w-4 ${def.accent}`} />
                          <span className="text-sm font-medium text-slate-200">{def.nameRu}</span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-500">{def.name}</p>
                      </div>
                      <div className="mt-2 flex items-end justify-between">
                        <span
                          className="text-2xl font-bold"
                          style={{ color: ACCENT_HEX[def.accent] ?? '#94a3b8' }}
                        >
                          {nodes.length}
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-700 transition group-hover:text-slate-400" />
                      </div>
                    </div>
                  </button>
                ))}
                {other.length > 0 && (
                  <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-800 p-4">
                    <p className="text-[10px] text-slate-600">+{other.length} uncategorized</p>
                  </div>
                )}
              </div>
            )}
          </section>
        ) : null}

        {/* ─── Section 2b: Category Detail (inline) ─── */}
        {selectedCat && selectedDef && selectedNodes ? (
          <section>
            <button
              onClick={() => setSelectedCat(null)}
              className="mb-3 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition"
            >
              <ArrowRight className="h-3 w-3 rotate-180" />
              Back to categories
            </button>
            <div
              className="rounded-xl border border-l-2 border-slate-800 bg-slate-900/50 p-4"
              style={{ borderLeftColor: ACCENT_HEX[selectedDef.accent] ?? '#94a3b8' }}
            >
              <div className="mb-4 flex items-center gap-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ background: `${ACCENT_HEX[selectedDef.accent] ?? '#94a3b8'}15` }}
                >
                  <selectedDef.icon className={`h-5 w-5 ${selectedDef.accent}`} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">{selectedDef.nameRu}</h3>
                  <p className="text-[10px] text-slate-500">
                    {selectedDef.name} · {selectedNodes.length} entities
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                {selectedNodes.slice(0, 30).map((n) => (
                  <div
                    key={n.id}
                    className="flex items-center justify-between rounded-lg border border-slate-800/50 bg-slate-800/20 px-3 py-2 text-xs hover:bg-slate-800/40 transition"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate font-medium text-slate-200">{n.label}</span>
                      <span className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">
                        {n.file_type}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      <span className="text-[10px] text-slate-600">community {n.community}</span>
                      <span className={`text-[10px] ${(connectionCount.get(n.id) || 0) > 5 ? 'text-fuchsia-400' : 'text-slate-600'}`}>
                        {connectionCount.get(n.id) || 0} links
                      </span>
                    </div>
                  </div>
                ))}
                {selectedNodes.length > 30 && (
                  <p className="py-2 text-center text-[10px] text-slate-600">
                    +{selectedNodes.length - 30} more entities
                  </p>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {/* ─── Section 3: God Nodes & Analytics ─── */}
        {!selectedCat && analytics ? (
          <section>
            <p className="text-slate-500 text-sm">Analytics — Task 4</p>
          </section>
        ) : null}

        {/* ─── Section 4: Interactive Graph ─── */}
        {!selectedCat && (
          <section>
            <button
              onClick={() => setShowGraph((v) => !v)}
              className="mb-2 flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition"
            >
              <GitGraph className="h-3.5 w-3.5" />
              Interactive Graph
              <ChevronRight className={`h-3 w-3 transition ${showGraph ? 'rotate-90' : ''}`} />
            </button>
            {showGraph && (
              <div className={graphFullscreen ? 'fixed inset-0 z-50 flex flex-col bg-slate-950' : 'flex flex-col'}>
                <div className="flex items-center justify-between rounded-t-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-[11px]">
                  <div className="flex items-center gap-4 text-slate-400">
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
                <iframe
                  src="/graph.html"
                  title="Graphify knowledge graph"
                  className="rounded-b-lg border border-t-0 border-slate-800"
                  style={{ height: graphFullscreen ? '100%' : 500, minHeight: 400 }}
                />
              </div>
            )}
          </section>
        )}
      </div>

      {/* ─── Floating Search Pill ─── */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        <p className="text-slate-500 text-xs bg-slate-900 border border-slate-700 rounded-full px-4 py-2">Search pill — Task 5</p>
      </div>
    </>
  )
}
