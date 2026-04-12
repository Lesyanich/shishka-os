import { useState, useEffect, useMemo, useRef } from 'react'
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
} from 'lucide-react'

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

  // Load graph.json
  useEffect(() => {
    fetch('/graph.json')
      .then((r) => r.json())
      .then((data) => setGraph({ nodes: data.nodes, edges: data.links || [] }))
      .catch(() => {})
      .finally(() => setLoading(false))
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
    <div className="space-y-5">
      {/* ─── Command Bar ─── */}
      <div className="relative">
        <div
          className={[
            'flex items-center gap-2 rounded-xl border bg-slate-900/80 px-4 py-3 transition-all duration-300',
            mode === 'add'
              ? 'border-amber-500/40 shadow-[0_0_20px_-4px_rgba(245,158,11,0.15)]'
              : search
                ? 'border-fuchsia-500/40 shadow-[0_0_20px_-4px_rgba(217,70,239,0.15)]'
                : 'border-slate-700 hover:border-slate-600',
          ].join(' ')}
        >
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
            />
          ) : (
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addNote()}
              placeholder="Добавь заметку в мозг... (факт, идея, наблюдение)"
              className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none"
              autoFocus
            />
          )}

          {mode === 'add' && noteText && (
            <button
              onClick={addNote}
              className="rounded-lg bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-300 transition hover:bg-amber-500/30"
            >
              <Save className="inline-block h-3 w-3 mr-1" />
              Save
            </button>
          )}

          {(search || mode === 'add') && (
            <button
              onClick={() => { setSearch(''); setMode('search'); setNoteText('') }}
              className="rounded p-1 text-slate-500 hover:text-slate-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          <div className="ml-1 flex gap-1 border-l border-slate-700 pl-2">
            <button
              onClick={() => setMode('search')}
              className={`rounded-md px-2 py-1 text-[10px] font-medium transition ${mode === 'search' ? 'bg-fuchsia-500/20 text-fuchsia-300' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Search
            </button>
            <button
              onClick={() => setMode('add')}
              className={`rounded-md px-2 py-1 text-[10px] font-medium transition ${mode === 'add' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-500 hover:text-slate-300'}`}
            >
              + Note
            </button>
          </div>
        </div>
      </div>

      {/* ─── Search Results ─── */}
      {search.length >= 2 && searchResults && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="mb-3 text-xs text-slate-500">
            {searchResults.total} {searchResults.total === 1 ? 'result' : 'results'} for &ldquo;{search}&rdquo;
          </p>
          {searchResults.total === 0 ? (
            <p className="py-4 text-center text-sm text-slate-600">Nothing found. Try a different query.</p>
          ) : (
            <div className="space-y-4">
              {[...searchResults.grouped.entries()].map(([catName, nodes]) => {
                const def = CATEGORIES.find((c) => c.name === catName)
                return (
                  <div key={catName}>
                    <h4 className={`mb-1.5 text-xs font-medium ${def?.accent ?? 'text-slate-400'}`}>
                      {catName} ({nodes.length})
                    </h4>
                    <div className="space-y-1">
                      {nodes.slice(0, 8).map((n) => (
                        <div
                          key={n.id}
                          className="flex items-center justify-between rounded-lg border border-slate-800/50 bg-slate-800/30 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate font-medium text-slate-200">{n.label}</span>
                            <span className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">
                              {n.file_type}
                            </span>
                          </div>
                          <span className="shrink-0 text-[10px] text-slate-600 ml-2">
                            {connectionCount.get(n.id) || 0} links
                          </span>
                        </div>
                      ))}
                      {nodes.length > 8 && (
                        <p className="pl-3 text-[10px] text-slate-600">+{nodes.length - 8} more</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Notes (if any) ─── */}
      {notes.length > 0 && !search && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-medium text-amber-400">
            <StickyNote className="h-3.5 w-3.5" />
            My notes ({notes.length})
            <span className="text-[10px] font-normal text-amber-600">localStorage — sync coming soon</span>
          </h3>
          <div className="space-y-1.5">
            {notes.slice(0, 5).map((n) => (
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
            {notes.length > 5 && (
              <p className="pl-2 text-[10px] text-amber-700">+{notes.length - 5} more notes</p>
            )}
          </div>
        </div>
      )}

      {/* ─── Knowledge Categories ─── */}
      {!search && !selectedCat && (
        <div>
          <h3 className="mb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
            Knowledge Map · {graph?.nodes.length ?? '...'} entities
          </h3>
          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-800 bg-slate-900/50" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {cats.map(({ def, nodes }) => (
                <button
                  key={def.name}
                  onClick={() => setSelectedCat(def.name)}
                  className={`group relative overflow-hidden rounded-xl border-l-2 border border-slate-800 ${def.accentBorder} bg-slate-900/50 p-4 text-left transition hover:bg-slate-800/50 hover:border-slate-700`}
                >
                  <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${def.accentBg}`}>
                    <def.icon className={`h-4 w-4 ${def.accent}`} />
                  </div>
                  <p className="text-sm font-medium text-slate-200">{def.nameRu}</p>
                  <p className="text-[10px] text-slate-500">{def.name}</p>
                  <p className={`mt-1 text-lg font-semibold ${def.accent}`}>{nodes.length}</p>
                  <div className="mt-1.5 space-y-0.5">
                    {nodes.slice(0, 3).map((n) => (
                      <p key={n.id} className="truncate text-[10px] text-slate-600">
                        {n.label}
                      </p>
                    ))}
                  </div>
                  <ChevronRight className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-700 transition group-hover:text-slate-400" />
                </button>
              ))}
              {other.length > 0 && (
                <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-800 p-4 text-center">
                  <p className="text-[10px] text-slate-600">+{other.length} uncategorized</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Category Detail ─── */}
      {selectedCat && selectedDef && selectedNodes && (
        <div>
          <button
            onClick={() => setSelectedCat(null)}
            className="mb-3 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition"
          >
            <ArrowRight className="h-3 w-3 rotate-180" />
            Back to categories
          </button>
          <div className={`rounded-xl border border-slate-800 ${selectedDef.accentBorder} border-l-2 bg-slate-900/50 p-4`}>
            <div className="mb-4 flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${selectedDef.accentBg}`}>
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
                    <span className="text-[10px] text-slate-600">
                      community {n.community}
                    </span>
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
        </div>
      )}

      {/* ─── Graph Viewer (collapsible) ─── */}
      {!search && !selectedCat && (
        <div>
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
        </div>
      )}
    </div>
  )
}
