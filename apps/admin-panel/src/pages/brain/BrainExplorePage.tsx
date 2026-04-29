// The unified Brain explore view: vault sidebar + graph + reader, all
// synchronized via the URL search param `?page=<vault-relative-path>`.
//
// Click a node on the graph → reader opens that page + graph re-centers.
// Click a sidebar entry → same. Click a [[wikilink]] in the reader → same.
// Refresh / share URL → state restored.

import { useCallback, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { VaultSidebar } from '../../components/brain/VaultSidebar'
import { PageReader } from '../../components/brain/PageReader'
import { GraphCanvas } from '../../components/brain/GraphCanvas'
import { useVault } from '../../lib/vault'

const DEFAULT_LANDING = 'Tech/README.md'  // first read on cold-open

export function BrainExplorePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { vault, error, loading, setVault } = useVault()

  const selectedPath = searchParams.get('page') ?? ''

  // On first load, if no ?page= and a default page exists, set it.
  useEffect(() => {
    if (loading || !vault) return
    if (selectedPath) return
    if (vault.pages[DEFAULT_LANDING]) {
      setSearchParams({ page: DEFAULT_LANDING }, { replace: true })
    }
  }, [loading, vault, selectedPath, setSearchParams])

  const updateSelected = useCallback(
    (path: string) => {
      setSearchParams({ page: path })
    },
    [setSearchParams]
  )

  const handleLocalUpdate = useCallback(
    (next: Parameters<typeof setVault>[0]) => setVault(next),
    [setVault]
  )

  const tabBarHint = useMemo(() => {
    if (!vault) return ''
    if (selectedPath && vault.pages[selectedPath]) return selectedPath
    return `${vault.count} pages indexed`
  }, [vault, selectedPath])

  if (error) {
    return (
      <div className="p-4 text-sm text-rose-400">
        Failed to load vault: {error}
      </div>
    )
  }
  if (loading || !vault) {
    return <div className="p-4 text-xs text-slate-500">Loading vault…</div>
  }

  return (
    <div className="flex h-full min-h-0 gap-3">
      {/* Left: vault sidebar */}
      <aside className="w-56 shrink-0 rounded-lg border border-slate-800 bg-slate-900/40">
        <VaultSidebar
          vault={vault}
          selectedPath={selectedPath}
          onSelect={updateSelected}
          compact
        />
      </aside>

      {/* Center: graph */}
      <section className="flex w-[42%] shrink-0 flex-col gap-2 overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40">
        <header className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-fuchsia-400" />
            Brain map
          </span>
          <span className="truncate font-mono text-[10px] text-slate-600">
            {tabBarHint}
          </span>
          <button
            type="button"
            onClick={() => navigate('/brain/knowledge')}
            className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 hover:border-fuchsia-500/50 hover:text-fuchsia-300"
            title="Open the standalone graph view with search, communities, fullscreen"
          >
            Full view
          </button>
        </header>
        <div className="flex-1 min-h-0">
          <GraphCanvas
            selectedPath={selectedPath}
            onNodeClick={updateSelected}
          />
        </div>
      </section>

      {/* Right: reader */}
      <section className="flex flex-1 flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40">
        <PageReader
          vault={vault}
          selectedPath={selectedPath}
          onNavigate={updateSelected}
          onLocalUpdate={handleLocalUpdate}
          compactRails
        />
      </section>
    </div>
  )
}
