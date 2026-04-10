import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronRight,
  Database,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import {
  fetchHealth,
  fetchTaxonomy,
  fetchDrawers,
  searchDrawers,
  getBaseUrl,
  MemPalaceError,
  type MemPalaceDrawer,
  type MemPalaceSearchHit,
} from '../../api/mempalace'

// ── Types ──

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'unreachable' }
  | { kind: 'error'; message: string }

interface TaxonomyTree {
  [wing: string]: { [room: string]: number }
}

// ── Component ──

export function MemPalaceBrowser() {
  // Connection state
  const [load, setLoad] = useState<LoadState>({ kind: 'idle' })

  // Data
  const [taxonomy, setTaxonomy] = useState<TaxonomyTree>({})
  const [drawers, setDrawers] = useState<MemPalaceDrawer[]>([])
  const [searchResults, setSearchResults] = useState<MemPalaceSearchHit[] | null>(null)

  // Selection
  const [selectedWing, setSelectedWing] = useState<string | null>(null)
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null)
  const [expandedWings, setExpandedWings] = useState<Set<string>>(new Set())
  const [selectedDrawerId, setSelectedDrawerId] = useState<string | null>(null)

  // Search
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  // ── Stats ──
  const totalDrawers = useMemo(() => {
    let count = 0
    for (const rooms of Object.values(taxonomy)) {
      for (const n of Object.values(rooms)) count += n
    }
    return count
  }, [taxonomy])

  const wingCount = Object.keys(taxonomy).length
  const roomCount = useMemo(() => {
    const rooms = new Set<string>()
    for (const wing of Object.values(taxonomy)) {
      for (const room of Object.keys(wing)) rooms.add(room)
    }
    return rooms.size
  }, [taxonomy])

  // ── Load taxonomy ──
  const reload = useCallback(async () => {
    setLoad({ kind: 'loading' })
    try {
      await fetchHealth()
    } catch {
      setLoad({ kind: 'unreachable' })
      return
    }
    try {
      const data = await fetchTaxonomy()
      setTaxonomy(data.taxonomy)
      // Auto-expand first wing
      const wings = Object.keys(data.taxonomy)
      if (wings.length > 0) {
        setExpandedWings(new Set(wings))
      }
      setLoad({ kind: 'ready' })
    } catch (err) {
      setLoad({
        kind: 'error',
        message: err instanceof MemPalaceError ? err.message : String(err),
      })
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // ── Load drawers on wing/room selection ──
  useEffect(() => {
    if (load.kind !== 'ready') return
    if (!selectedWing) {
      setDrawers([])
      return
    }
    let cancelled = false
    void fetchDrawers({ wing: selectedWing, room: selectedRoom ?? undefined }).then(
      (data) => {
        if (!cancelled) {
          setDrawers(data.drawers)
          setSelectedDrawerId(null)
          setSearchResults(null)
          setSearchQuery('')
          setSearchInput('')
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [load.kind, selectedWing, selectedRoom])

  // ── Search ──
  useEffect(() => {
    if (!searchQuery) {
      setSearchResults(null)
      return
    }
    let cancelled = false
    setIsSearching(true)
    void searchDrawers({
      query: searchQuery,
      wing: selectedWing ?? undefined,
      room: selectedRoom ?? undefined,
      limit: 20,
    }).then((data) => {
      if (!cancelled) {
        setSearchResults(data.results)
        setIsSearching(false)
      }
    }).catch(() => {
      if (!cancelled) setIsSearching(false)
    })
    return () => {
      cancelled = true
    }
  }, [searchQuery, selectedWing, selectedRoom])

  // Debounced search
  useEffect(() => {
    if (!searchInput.trim()) {
      setSearchQuery('')
      return
    }
    const t = window.setTimeout(() => setSearchQuery(searchInput.trim()), 400)
    return () => window.clearTimeout(t)
  }, [searchInput])

  // ── Selected drawer content ──
  const selectedDrawer = useMemo(() => {
    if (!selectedDrawerId) return null
    return drawers.find((d) => d.id === selectedDrawerId) ?? null
  }, [drawers, selectedDrawerId])

  // ── Wing/room click handlers ──
  function handleWingClick(wing: string) {
    setExpandedWings((prev) => {
      const next = new Set(prev)
      if (next.has(wing)) next.delete(wing)
      else next.add(wing)
      return next
    })
    setSelectedWing(wing)
    setSelectedRoom(null)
  }

  function handleRoomClick(wing: string, room: string) {
    setSelectedWing(wing)
    setSelectedRoom(room)
  }

  // ── Render: unreachable / error states ──
  if (load.kind === 'loading' || load.kind === 'idle') {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Connecting to MemPalace…
      </div>
    )
  }

  if (load.kind === 'unreachable') {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md text-center">
          <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-300">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <h2 className="text-sm font-semibold text-slate-100">MemPalace API unreachable</h2>
          <p className="mt-2 text-xs text-slate-500">
            Cannot reach <code className="rounded bg-slate-900 px-1">{getBaseUrl()}</code>.
            Start it:
          </p>
          <pre className="mx-auto mt-2 max-w-xs rounded bg-slate-900 px-3 py-2 text-left text-[11px] text-slate-400">
            cd services/mempalace{'\n'}.venv/bin/python serve.py
          </pre>
          <button
            type="button"
            onClick={() => void reload()}
            className="mt-4 inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 transition hover:border-fuchsia-500/60 hover:text-fuchsia-200"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (load.kind === 'error') {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md text-center">
          <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-300">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <h2 className="text-sm font-semibold text-slate-100">MemPalace error</h2>
          <p className="mt-2 text-xs text-slate-400">{load.message}</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="mt-4 inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 transition hover:border-fuchsia-500/60 hover:text-fuchsia-200"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  // ── Main layout ──
  return (
    <div className="flex h-full min-h-[500px] overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
      {/* Left: Wing/Room tree */}
      <div className="flex w-52 shrink-0 flex-col border-r border-slate-800">
        {/* Stats header */}
        <div className="border-b border-slate-800 px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Database className="h-3 w-3 text-fuchsia-400" />
            <span>{totalDrawers} drawers</span>
            <span className="text-slate-600">·</span>
            <span>{wingCount}W</span>
            <span className="text-slate-600">·</span>
            <span>{roomCount}R</span>
          </div>
        </div>

        {/* Tree nav */}
        <nav className="flex-1 overflow-y-auto p-2">
          {/* "All" option */}
          <button
            type="button"
            onClick={() => {
              setSelectedWing(null)
              setSelectedRoom(null)
            }}
            className={[
              'mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] transition',
              !selectedWing
                ? 'bg-fuchsia-500/10 text-fuchsia-200'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200',
            ].join(' ')}
          >
            <FolderOpen className="h-3 w-3" />
            All drawers
          </button>

          {Object.entries(taxonomy)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([wing, rooms]) => {
              const isExpanded = expandedWings.has(wing)
              const wingTotal = Object.values(rooms).reduce((s, n) => s + n, 0)
              const isWingSelected = selectedWing === wing && !selectedRoom

              return (
                <div key={wing}>
                  <button
                    type="button"
                    onClick={() => handleWingClick(wing)}
                    className={[
                      'flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] transition',
                      isWingSelected
                        ? 'bg-fuchsia-500/10 text-fuchsia-200'
                        : 'text-slate-300 hover:bg-slate-900 hover:text-slate-100',
                    ].join(' ')}
                  >
                    <ChevronRight
                      className={`h-3 w-3 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                    <span className="truncate font-medium">{wing}</span>
                    <span className="ml-auto text-[10px] text-slate-600">{wingTotal}</span>
                  </button>

                  {isExpanded && (
                    <div className="ml-3 border-l border-slate-800 pl-2">
                      {Object.entries(rooms)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([room, count]) => {
                          const isRoomSelected =
                            selectedWing === wing && selectedRoom === room

                          return (
                            <button
                              key={room}
                              type="button"
                              onClick={() => handleRoomClick(wing, room)}
                              className={[
                                'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] transition',
                                isRoomSelected
                                  ? 'bg-fuchsia-500/10 text-fuchsia-200'
                                  : 'text-slate-500 hover:bg-slate-900 hover:text-slate-300',
                              ].join(' ')}
                            >
                              <span className="truncate">{room}</span>
                              <span className="ml-auto text-[10px] text-slate-600">{count}</span>
                            </button>
                          )
                        })}
                    </div>
                  )}
                </div>
              )
            })}
        </nav>

        {/* Refresh */}
        <div className="border-t border-slate-800 p-2">
          <button
            type="button"
            onClick={() => void reload()}
            className="flex w-full items-center justify-center gap-1 rounded px-2 py-1 text-[11px] text-slate-500 transition hover:bg-slate-900 hover:text-slate-300"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>
      </div>

      {/* Right: drawer list + content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Search bar */}
        <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Semantic search across drawers…"
              className="w-full rounded-md border border-slate-800 bg-slate-900 py-1.5 pl-7 pr-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-fuchsia-500/60 focus:outline-none"
            />
          </div>
          {isSearching && <Loader2 className="h-3.5 w-3.5 animate-spin text-fuchsia-400" />}
          {searchResults && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('')
                setSearchQuery('')
              }}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
          <span className="ml-auto text-[11px] text-slate-500">
            {searchResults
              ? `${searchResults.length} results`
              : selectedRoom
                ? `${selectedWing} / ${selectedRoom}`
                : selectedWing
                  ? selectedWing
                  : 'Select a wing'}
          </span>
        </div>

        {/* Content area */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Drawer list */}
          <div className="w-80 shrink-0 overflow-y-auto border-r border-slate-800">
            {searchResults ? (
              <SearchResultList
                results={searchResults}
                selectedId={selectedDrawerId}
                onSelect={setSelectedDrawerId}
                drawers={drawers}
              />
            ) : drawers.length > 0 ? (
              <DrawerList
                drawers={drawers}
                selectedId={selectedDrawerId}
                onSelect={setSelectedDrawerId}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-xs text-slate-600">
                {selectedWing ? 'No drawers found' : 'Select a wing or room to browse'}
              </div>
            )}
          </div>

          {/* Drawer content viewer */}
          <div className="flex-1 overflow-y-auto">
            {selectedDrawer ? (
              <DrawerViewer drawer={selectedDrawer} />
            ) : searchResults && selectedDrawerId ? (
              <SearchHitViewer
                hit={searchResults.find((_, i) => `search-${i}` === selectedDrawerId) ?? null}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-600">
                Select a drawer to view its content
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──

function DrawerList({
  drawers,
  selectedId,
  onSelect,
}: {
  drawers: MemPalaceDrawer[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="divide-y divide-slate-800/50">
      {drawers.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => onSelect(d.id)}
          className={[
            'w-full px-3 py-2.5 text-left transition',
            selectedId === d.id
              ? 'bg-fuchsia-500/10'
              : 'hover:bg-slate-900/50',
          ].join(' ')}
        >
          <div className="flex items-center gap-2">
            <span className="truncate text-[11px] font-medium text-slate-200">
              {extractTitle(d.content_preview)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-600">
            <span>{d.wing}/{d.room}</span>
            {d.filed_at && (
              <>
                <span>·</span>
                <span>{formatDate(d.filed_at)}</span>
              </>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
            {d.content_preview.replace(/^#+\s.*\n?/, '').trim().slice(0, 120)}
          </p>
        </button>
      ))}
    </div>
  )
}

function SearchResultList({
  results,
  selectedId,
  onSelect,
  drawers,
}: {
  results: MemPalaceSearchHit[]
  selectedId: string | null
  onSelect: (id: string) => void
  drawers: MemPalaceDrawer[]
}) {
  return (
    <div className="divide-y divide-slate-800/50">
      {results.map((hit, i) => {
        const id = `search-${i}`
        // Try to match to a real drawer for full content viewing
        const matchedDrawer = drawers.find(
          (d) => d.wing === hit.wing && d.room === hit.room && d.content.includes(hit.text.slice(0, 50)),
        )

        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(matchedDrawer?.id ?? id)}
            className={[
              'w-full px-3 py-2.5 text-left transition',
              selectedId === (matchedDrawer?.id ?? id)
                ? 'bg-fuchsia-500/10'
                : 'hover:bg-slate-900/50',
            ].join(' ')}
          >
            <div className="flex items-center gap-2">
              <span className="truncate text-[11px] font-medium text-slate-200">
                {extractTitle(hit.text)}
              </span>
              <span
                className={[
                  'ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono',
                  hit.similarity > 0
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-slate-800 text-slate-500',
                ].join(' ')}
              >
                {hit.similarity.toFixed(3)}
              </span>
            </div>
            <div className="mt-1 text-[10px] text-slate-600">
              {hit.wing}/{hit.room}
              {hit.source_file !== '?' && ` · ${hit.source_file}`}
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
              {hit.text.replace(/^#+\s.*\n?/, '').trim().slice(0, 120)}
            </p>
          </button>
        )
      })}
    </div>
  )
}

function DrawerViewer({ drawer }: { drawer: MemPalaceDrawer }) {
  return (
    <div className="p-4">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
        <span className="rounded bg-fuchsia-500/10 px-1.5 py-0.5 text-fuchsia-300">
          {drawer.wing}
        </span>
        <span className="rounded bg-slate-800 px-1.5 py-0.5">{drawer.room}</span>
        {drawer.added_by && <span>by {drawer.added_by}</span>}
        {drawer.filed_at && <span>· {formatDate(drawer.filed_at)}</span>}
        <span className="ml-auto font-mono text-slate-700">{drawer.id}</span>
      </div>

      {/* Content */}
      <div className="prose-invert max-w-none">
        <pre className="whitespace-pre-wrap rounded-lg bg-slate-900/50 p-4 text-xs leading-relaxed text-slate-300">
          {drawer.content}
        </pre>
      </div>
    </div>
  )
}

function SearchHitViewer({ hit }: { hit: MemPalaceSearchHit | null }) {
  if (!hit) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-600">
        Select a search result
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-2 text-[10px] text-slate-500">
        <span className="rounded bg-fuchsia-500/10 px-1.5 py-0.5 text-fuchsia-300">
          {hit.wing}
        </span>
        <span className="rounded bg-slate-800 px-1.5 py-0.5">{hit.room}</span>
        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400">
          sim: {hit.similarity.toFixed(3)}
        </span>
      </div>

      <pre className="whitespace-pre-wrap rounded-lg bg-slate-900/50 p-4 text-xs leading-relaxed text-slate-300">
        {hit.text}
      </pre>
    </div>
  )
}

// ── Helpers ──

function extractTitle(text: string): string {
  // Try to find a markdown heading
  const match = text.match(/^#+\s+(.+)/m)
  if (match) return match[1].trim()
  // Fall back to first non-empty line
  const firstLine = text.trim().split('\n')[0]
  return firstLine?.slice(0, 80) || 'Untitled'
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso.slice(0, 10)
  }
}
