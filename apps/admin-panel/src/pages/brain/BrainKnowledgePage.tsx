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
        <section className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-slate-800/50" style={{ background: '#060612', minHeight: 340 }}>
          <p className="text-slate-500 text-sm">Constellation Hero — Task 2</p>
        </section>

        {/* ─── Section 2: Knowledge Domains Treemap ─── */}
        {!selectedCat ? (
          <section>
            <p className="text-slate-500 text-sm">Treemap — Task 3</p>
          </section>
        ) : null}

        {/* ─── Section 2b: Category Detail (inline) ─── */}
        {selectedCat && selectedDef && selectedNodes ? (
          <section>
            <p className="text-slate-500 text-sm">Category Detail — Task 3</p>
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
