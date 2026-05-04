import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, MapPin, FileText } from 'lucide-react'
import { driveLinkFor } from '../../lib/drive'

interface VaultPage {
  title: string
  frontmatter: Record<string, unknown>
  content: string
}

interface VaultJson {
  generated_at: string
  count: number
  tree: { path: string; title: string }[]
  pages: Record<string, VaultPage>
}

interface AssetWithSource {
  label: string
  path?: string
  url?: string
  sourcePath: string
  sourceTitle: string
  folder: string
}

const VAULT_URL = '/vault.json'

function readAssets(
  fmAssets: unknown,
  sourcePath: string,
  sourceTitle: string
): AssetWithSource[] {
  if (!Array.isArray(fmAssets)) return []
  const folder = sourcePath.split('/')[0]
  const out: AssetWithSource[] = []
  for (const a of fmAssets) {
    if (!a || typeof a !== 'object') continue
    const obj = a as Record<string, unknown>
    const label = typeof obj.label === 'string' ? obj.label : null
    if (!label) continue
    out.push({
      label,
      path: typeof obj.path === 'string' ? obj.path : undefined,
      url: typeof obj.url === 'string' ? obj.url : undefined,
      sourcePath,
      sourceTitle,
      folder,
    })
  }
  return out
}

export function BrainDriveMapPage() {
  const navigate = useNavigate()
  const [vault, setVault] = useState<VaultJson | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch(VAULT_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: VaultJson) => {
        if (alive) setVault(data)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      alive = false
    }
  }, [])

  const assetsByFolder = useMemo(() => {
    if (!vault) return new Map<string, AssetWithSource[]>()
    const all: AssetWithSource[] = []
    for (const [path, page] of Object.entries(vault.pages)) {
      all.push(...readAssets(page.frontmatter.assets, path, page.title))
    }
    const grouped = new Map<string, AssetWithSource[]>()
    for (const a of all) {
      const list = grouped.get(a.folder) ?? []
      list.push(a)
      grouped.set(a.folder, list)
    }
    return new Map([...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)))
  }, [vault])

  const totalAssets = useMemo(
    () => [...assetsByFolder.values()].reduce((acc, list) => acc + list.length, 0),
    [assetsByFolder]
  )

  if (error) {
    return (
      <div className="p-4 text-sm text-rose-400">
        Failed to load vault: {error}
      </div>
    )
  }
  if (!vault) {
    return <div className="p-4 text-xs text-slate-500">Loading…</div>
  }

  return (
    <div className="h-full overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/40 p-6">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-100">
          <MapPin className="h-5 w-5 text-cyan-400" />
          Drive Map
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Where things live across Google Drive and external systems. Aggregated
          from the <code className="text-fuchsia-300">assets:</code> frontmatter
          of {vault.count} vault pages — {totalAssets} entries.
        </p>
      </header>

      {totalAssets === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {[...assetsByFolder.entries()].map(([folder, items]) => (
            <section key={folder}>
              <h2 className="mb-2 text-sm font-medium text-slate-200">
                {folder}{' '}
                <span className="text-[11px] font-normal text-slate-500">
                  · {items.length} {items.length === 1 ? 'entry' : 'entries'}
                </span>
              </h2>
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {items.map((a, idx) => (
                  <li
                    key={`${a.sourcePath}-${a.label}-${idx}`}
                    className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"
                  >
                    {(() => {
                      // Build the best-guess Drive link: explicit url wins,
                      // otherwise turn the path into a Drive search.
                      const href = a.url ?? driveLinkFor(a.path)
                      const Card = (
                        <>
                          <div className="text-xs font-medium text-slate-100 group-hover:text-fuchsia-300">
                            {a.label}
                            {href && (
                              <ExternalLink className="ml-1 inline h-2.5 w-2.5 align-baseline text-slate-500 group-hover:text-fuchsia-300" />
                            )}
                          </div>
                          {a.path && (
                            <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                              {a.path}
                            </div>
                          )}
                        </>
                      )
                      return href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="group block focus:outline-none"
                        >
                          {Card}
                        </a>
                      ) : (
                        <div>{Card}</div>
                      )
                    })()}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/brain/wiki/${a.sourcePath}`)}
                        className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-fuchsia-300"
                      >
                        <FileText className="h-3 w-3" />
                        {a.sourceTitle}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <MapPin className="mb-3 h-10 w-10 text-slate-700" />
      <h2 className="text-base font-medium text-slate-300">No assets yet</h2>
      <p className="mt-1 max-w-md text-xs text-slate-500">
        Add an <code className="text-fuchsia-300">assets:</code> block to any
        vault page's frontmatter to make Drive folders, photo libraries, and
        external links discoverable here.
      </p>
      <pre className="mt-4 rounded border border-slate-800 bg-slate-950 p-3 text-left text-[11px] text-slate-300">
{`---
assets:
  - label: "Logo files"
    path: "Drive: Brand/Logos/"
    url: "https://drive.google.com/..."
---`}
      </pre>
    </div>
  )
}
