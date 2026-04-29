import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  ExternalLink,
} from 'lucide-react'

interface VaultTreeEntry {
  path: string
  title: string
  type: string | null
  lastModified: string
  isFolderIndex: boolean
}

interface VaultPage {
  title: string
  frontmatter: Record<string, unknown>
  content: string
}

interface VaultJson {
  generated_at: string
  count: number
  tree: VaultTreeEntry[]
  pages: Record<string, VaultPage>
}

interface FolderNode {
  name: string
  index: VaultTreeEntry | null
  pages: VaultTreeEntry[]
}

const VAULT_URL = '/vault.json'

/* -- Wikilink resolver ------------------------------------------------ */
// Match `[[Foo]]` or `[[Folder/Foo]]`. Resolve against vault page paths by
// matching either the exact path-without-extension or the basename-without-extension.

function resolveWikilink(
  target: string,
  knownPaths: string[]
): string | null {
  const cleanTarget = target.trim()
  if (!cleanTarget) return null

  // 1. Exact path match: `Folder/Page` → `Folder/Page.md`
  const asPath = cleanTarget.endsWith('.md') ? cleanTarget : `${cleanTarget}.md`
  if (knownPaths.includes(asPath)) return asPath

  // 2. Folder name (entity README): `Brand` → `Brand/README.md`
  const asFolderIndex = `${cleanTarget}/README.md`
  if (knownPaths.includes(asFolderIndex)) return asFolderIndex

  // 3. Basename match across all paths
  const basenameMatch = knownPaths.find((p) => {
    const last = p.split('/').pop()?.replace(/\.md$/, '')
    return last === cleanTarget
  })
  return basenameMatch ?? null
}

// Pre-process markdown: replace [[link]] with placeholder anchor that
// react-markdown's link renderer will turn into an internal Link.
function transformWikilinks(md: string, knownPaths: string[]): string {
  return md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => {
    const resolved = resolveWikilink(target, knownPaths)
    const text = (label ?? target).trim()
    if (!resolved) {
      // Unresolved → render as italicized broken-link span (still readable text)
      return `*${text}*`
    }
    // Use a special URL scheme that the link renderer below intercepts
    return `[${text}](wiki:${encodeURIComponent(resolved)})`
  })
}

/* -- Tree building ---------------------------------------------------- */

function buildFolderNodes(tree: VaultTreeEntry[]): FolderNode[] {
  const byFolder = new Map<string, FolderNode>()
  for (const entry of tree) {
    const folder = entry.path.split('/')[0]
    if (!byFolder.has(folder)) {
      byFolder.set(folder, { name: folder, index: null, pages: [] })
    }
    const node = byFolder.get(folder)!
    if (entry.isFolderIndex && entry.path === `${folder}/README.md`) {
      node.index = entry
    } else {
      node.pages.push(entry)
    }
  }
  return Array.from(byFolder.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  )
}

/* -- Component -------------------------------------------------------- */

export function BrainWikiPage() {
  const navigate = useNavigate()
  const params = useParams()
  // Catch-all path: `/brain/wiki/Menu/Salads.md` → params['*'] === 'Menu/Salads.md'
  const currentPath = params['*'] || ''

  const [vault, setVault] = useState<VaultJson | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    fetch(VAULT_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: VaultJson) => {
        if (!alive) return
        setVault(data)
        // Auto-expand the folder of the currently-selected page
        if (currentPath) {
          const folder = currentPath.split('/')[0]
          setExpanded((prev) => new Set([...prev, folder]))
        }
      })
      .catch((err) => {
        if (!alive) return
        setLoadError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      alive = false
    }
    // Only run on mount + when route segment changes (we re-expand the folder)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const folderNodes = useMemo(
    () => (vault ? buildFolderNodes(vault.tree) : []),
    [vault]
  )

  const knownPaths = useMemo(
    () => (vault ? Object.keys(vault.pages) : []),
    [vault]
  )

  const selectedPage = useMemo<VaultPage | null>(() => {
    if (!vault || !currentPath) return null
    return vault.pages[currentPath] ?? null
  }, [vault, currentPath])

  const transformedMarkdown = useMemo(() => {
    if (!selectedPage) return ''
    return transformWikilinks(selectedPage.content, knownPaths)
  }, [selectedPage, knownPaths])

  const toggleFolder = useCallback((folder: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }, [])

  const navigateToPage = useCallback(
    (path: string) => {
      navigate(`/brain/wiki/${path}`)
    },
    [navigate]
  )

  /* -- Render --------------------------------------------------------- */

  if (loadError) {
    return (
      <div className="p-4 text-sm text-rose-400">
        Failed to load vault: {loadError}
      </div>
    )
  }

  if (!vault) {
    return (
      <div className="p-4 text-xs text-slate-500">Loading vault…</div>
    )
  }

  return (
    <div className="flex h-full min-h-0 gap-4">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/40 p-2">
        <div className="mb-2 flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wide text-slate-500">
          <span>Vault</span>
          <span>{vault.count} pages</span>
        </div>
        {folderNodes.map((node) => {
          const isExpanded = expanded.has(node.name)
          const indexActive = node.index?.path === currentPath
          return (
            <div key={node.name} className="mb-1">
              <button
                type="button"
                onClick={() => toggleFolder(node.name)}
                className="group flex w-full items-center gap-1 rounded px-2 py-1 text-left text-xs text-slate-300 hover:bg-slate-800/50"
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3 shrink-0 text-slate-500" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0 text-slate-500" />
                )}
                {isExpanded ? (
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                ) : (
                  <Folder className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                )}
                <span className="truncate font-medium">{node.name}</span>
                <span className="ml-auto text-[10px] text-slate-600">
                  {node.pages.length + (node.index ? 1 : 0)}
                </span>
              </button>
              {isExpanded && (
                <div className="ml-5 border-l border-slate-800 pl-1">
                  {node.index && (
                    <button
                      type="button"
                      onClick={() => navigateToPage(node.index!.path)}
                      className={[
                        'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs',
                        indexActive
                          ? 'bg-fuchsia-500/10 text-fuchsia-300'
                          : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200',
                      ].join(' ')}
                    >
                      <FileText className="h-3 w-3 shrink-0" />
                      <span className="truncate italic">overview</span>
                    </button>
                  )}
                  {node.pages.map((p) => {
                    const isActive = p.path === currentPath
                    const label = p.path.split('/').slice(1).join('/').replace(/\.md$/, '')
                    return (
                      <button
                        key={p.path}
                        type="button"
                        onClick={() => navigateToPage(p.path)}
                        className={[
                          'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs',
                          isActive
                            ? 'bg-fuchsia-500/10 text-fuchsia-300'
                            : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200',
                        ].join(' ')}
                      >
                        <FileText className="h-3 w-3 shrink-0" />
                        <span className="truncate">{label || p.title}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </aside>

      {/* Reader */}
      <main className="flex-1 min-w-0 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/40 p-6">
        {!selectedPage ? (
          <EmptyState totalPages={vault.count} generatedAt={vault.generated_at} />
        ) : (
          <article>
            <header className="mb-4 border-b border-slate-800 pb-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">
                {currentPath}
              </div>
              <h1 className="mt-1 text-2xl font-semibold text-slate-100">
                {selectedPage.title}
              </h1>
              <PageMeta frontmatter={selectedPage.frontmatter} />
            </header>

            <div className="wiki-prose">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children, ...rest }) => {
                    if (href?.startsWith('wiki:')) {
                      const target = decodeURIComponent(href.slice('wiki:'.length))
                      return (
                        <button
                          type="button"
                          className="text-fuchsia-300 underline-offset-2 hover:underline"
                          onClick={(e) => {
                            e.preventDefault()
                            navigateToPage(target)
                          }}
                        >
                          {children}
                        </button>
                      )
                    }
                    return (
                      <a
                        {...rest}
                        href={href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-sky-400 underline-offset-2 hover:underline"
                      >
                        {children}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )
                  },
                }}
              >
                {transformedMarkdown}
              </ReactMarkdown>
            </div>
          </article>
        )}
      </main>
    </div>
  )
}

/* -- Helpers ---------------------------------------------------------- */

function EmptyState({
  totalPages,
  generatedAt,
}: {
  totalPages: number
  generatedAt: string
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <FileText className="mb-3 h-10 w-10 text-slate-700" />
      <h2 className="text-base font-medium text-slate-300">Pick a page</h2>
      <p className="mt-1 max-w-md text-xs text-slate-500">
        {totalPages} pages indexed across the vault. Choose any from the left
        sidebar to start reading.
      </p>
      <p className="mt-4 text-[10px] text-slate-600">
        Index regenerated {new Date(generatedAt).toLocaleString()}
      </p>
    </div>
  )
}

function PageMeta({
  frontmatter,
}: {
  frontmatter: Record<string, unknown>
}) {
  const status = typeof frontmatter.status === 'string' ? frontmatter.status : null
  const date = typeof frontmatter.date === 'string' ? frontmatter.date : null
  const tags = Array.isArray(frontmatter.tags) ? (frontmatter.tags as string[]) : []
  if (!status && !date && tags.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
      {status && (
        <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">
          {status}
        </span>
      )}
      {date && <span>·  {date}</span>}
      {tags.length > 0 && (
        <span className="flex gap-1">
          {tags.map((t) => (
            <span key={t} className="text-slate-600">
              #{t}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}
