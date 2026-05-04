// The unified Brain explore view: graph is the dominant first surface,
// reader slides in as a right-side drawer when the user picks a vault node
// (from the graph or the sidebar). State syncs through `?page=<path>`.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { X as CloseIcon, ExternalLink } from 'lucide-react'
import { VaultSidebar } from '../../components/brain/VaultSidebar'
import { PageReader } from '../../components/brain/PageReader'
import { GraphCanvas } from '../../components/brain/GraphCanvas'
import { useVault } from '../../lib/vault'

export function BrainExplorePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { vault, error, loading, setVault } = useVault()

  const selectedPath = searchParams.get('page') ?? ''
  // Drawer is open when a path is in URL (so refresh restores state).
  const [readerOpen, setReaderOpen] = useState(!!selectedPath)

  // Open drawer whenever a fresh path arrives via URL / external nav.
  useEffect(() => {
    if (selectedPath) setReaderOpen(true)
  }, [selectedPath])

  const updateSelected = useCallback(
    (path: string) => {
      setSearchParams({ page: path })
      setReaderOpen(true)
    },
    [setSearchParams]
  )

  const closeReader = useCallback(() => {
    setReaderOpen(false)
    // Drop the URL param so back-button is intuitive — graph alone == empty path.
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  const handleLocalUpdate = useCallback(
    (next: Parameters<typeof setVault>[0]) => setVault(next),
    [setVault]
  )

  const headerHint = useMemo(() => {
    if (!vault) return ''
    if (selectedPath && vault.pages[selectedPath]) return selectedPath
    return `${vault.count} pages · ${vault.tree.length} nodes`
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
    <div className="relative flex h-full min-h-0 gap-3">
      {/* Left: vault sidebar (compact) */}
      <aside className="w-48 shrink-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40">
        <VaultSidebar
          vault={vault}
          selectedPath={selectedPath}
          onSelect={updateSelected}
          compact
        />
      </aside>

      {/* Center: graph — full remaining width, the primary view */}
      <section className="flex flex-1 flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40">
        <header className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-fuchsia-400" />
            Brain map
          </span>
          <span className="truncate font-mono text-[10px] text-slate-600">
            {headerHint}
          </span>
          <div className="flex items-center gap-2">
            {selectedPath && !readerOpen && (
              <button
                type="button"
                onClick={() => setReaderOpen(true)}
                className="rounded border border-fuchsia-500/40 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] text-fuchsia-300 hover:bg-fuchsia-500/20"
              >
                Open page
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/brain/knowledge')}
              className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 hover:border-fuchsia-500/50 hover:text-fuchsia-300"
              title="Open the standalone graph view with search, communities, fullscreen"
            >
              <ExternalLink className="inline h-2.5 w-2.5" /> Full view
            </button>
          </div>
        </header>
        <div className="flex-1 min-h-0">
          <GraphCanvas selectedPath={selectedPath} onNodeClick={updateSelected} />
        </div>
      </section>

      {/* Right: reader as slide-out drawer over the graph */}
      {readerOpen && selectedPath && (
        <>
          {/* Backdrop — click to close */}
          <button
            type="button"
            aria-label="Close reader"
            onClick={closeReader}
            className="absolute inset-0 z-10 cursor-pointer bg-black/40 backdrop-blur-[2px] transition-opacity"
          />
          {/* Drawer */}
          <aside className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[55%] flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
              <span className="truncate font-mono text-[11px] text-slate-500">
                {selectedPath}
              </span>
              <button
                type="button"
                onClick={closeReader}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <CloseIcon className="h-3.5 w-3.5" />
                Close
              </button>
            </header>
            <div className="flex-1 min-h-0">
              <PageReader
                vault={vault}
                selectedPath={selectedPath}
                onNavigate={updateSelected}
                onLocalUpdate={handleLocalUpdate}
                compactRails
              />
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
