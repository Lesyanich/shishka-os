import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
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
  Pencil,
  Save,
  X as CancelIcon,
  AlertCircle,
  ChevronLeft,
  MapPin,
} from 'lucide-react'
import {
  fetchVaultPageFresh,
  saveVaultPage,
  VaultApiError,
} from '../../api/vault'

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

interface AssetEntry {
  label: string
  path?: string
  url?: string
}

interface TocEntry {
  level: number
  text: string
  id: string
}

const VAULT_URL = '/vault.json'

/* -- Wikilink resolver ------------------------------------------------ */

function resolveWikilink(target: string, knownPaths: string[]): string | null {
  const cleanTarget = target.trim()
  if (!cleanTarget) return null

  const asPath = cleanTarget.endsWith('.md') ? cleanTarget : `${cleanTarget}.md`
  if (knownPaths.includes(asPath)) return asPath

  const asFolderIndex = `${cleanTarget}/README.md`
  if (knownPaths.includes(asFolderIndex)) return asFolderIndex

  const basenameMatch = knownPaths.find((p) => {
    const last = p.split('/').pop()?.replace(/\.md$/, '')
    return last === cleanTarget
  })
  return basenameMatch ?? null
}

function transformWikilinks(md: string, knownPaths: string[]): string {
  return md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => {
    const resolved = resolveWikilink(target, knownPaths)
    const text = (label ?? target).trim()
    if (!resolved) return `*${text}*`
    return `[${text}](wiki:${encodeURIComponent(resolved)})`
  })
}

/* -- Tree + TOC ------------------------------------------------------- */

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
  return Array.from(byFolder.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function extractToc(markdown: string): TocEntry[] {
  const out: TocEntry[] = []
  const lines = markdown.split('\n')
  let inCodeBlock = false
  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue
    const m = /^(#{2,4})\s+(.+?)\s*$/.exec(line)
    if (!m) continue
    const text = m[2].replace(/[#*_`]/g, '').trim()
    if (!text) continue
    out.push({ level: m[1].length, text, id: slugifyHeading(text) })
  }
  return out
}

function readAssets(frontmatter: Record<string, unknown>): AssetEntry[] {
  const raw = frontmatter.assets
  if (!Array.isArray(raw)) return []
  const out: AssetEntry[] = []
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue
    const obj = a as Record<string, unknown>
    const label = typeof obj.label === 'string' ? obj.label : null
    if (!label) continue
    out.push({
      label,
      path: typeof obj.path === 'string' ? obj.path : undefined,
      url: typeof obj.url === 'string' ? obj.url : undefined,
    })
  }
  return out
}

/* -- Component -------------------------------------------------------- */

export function BrainWikiPage() {
  const navigate = useNavigate()
  const params = useParams()
  const currentPath = params['*'] || ''

  const [vault, setVault] = useState<VaultJson | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Edit-mode state
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState<string>('')
  const [editSha, setEditSha] = useState<string>('')
  const [editLoading, setEditLoading] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [savedNotice, setSavedNotice] = useState<string | null>(null)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Drop edit mode when path changes
  useEffect(() => {
    setEditing(false)
    setEditError(null)
    setSavedNotice(null)
  }, [currentPath])

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
    const source = editing ? editContent : selectedPage.content
    return transformWikilinks(source, knownPaths)
  }, [selectedPage, knownPaths, editing, editContent])

  const toc = useMemo(() => {
    if (!selectedPage) return []
    return extractToc(editing ? editContent : selectedPage.content)
  }, [selectedPage, editing, editContent])

  const assets = useMemo(
    () => (selectedPage ? readAssets(selectedPage.frontmatter) : []),
    [selectedPage]
  )

  const breadcrumb = useMemo(() => {
    if (!currentPath) return []
    return currentPath.split('/').filter(Boolean)
  }, [currentPath])

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

  const startEdit = useCallback(async () => {
    if (!currentPath) return
    setEditLoading(true)
    setEditError(null)
    try {
      const fresh = await fetchVaultPageFresh(currentPath)
      setEditContent(fresh.content)
      setEditSha(fresh.sha)
      setEditing(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const status = err instanceof VaultApiError ? ` (HTTP ${err.status})` : ''
      setEditError(`Cannot open editor: ${msg}${status}`)
    } finally {
      setEditLoading(false)
    }
  }, [currentPath])

  const cancelEdit = useCallback(() => {
    setEditing(false)
    setEditContent('')
    setEditSha('')
    setEditError(null)
  }, [])

  const saveEdit = useCallback(async () => {
    if (!currentPath || !editSha) return
    setEditSaving(true)
    setEditError(null)
    try {
      const result = await saveVaultPage({
        path: currentPath,
        content: editContent,
        sha: editSha,
      })
      setEditing(false)
      setEditContent('')
      setEditSha('')
      setSavedNotice(
        result.commitUrl
          ? `Saved · ${new Date(result.committedAt).toLocaleTimeString()}`
          : 'Saved'
      )
      // Optimistic local update — don't wait for vault.json rebuild
      setVault((prev) => {
        if (!prev) return prev
        const newPages = { ...prev.pages }
        const existing = newPages[currentPath]
        if (existing) {
          newPages[currentPath] = { ...existing, content: stripFrontmatter(editContent) }
        }
        return { ...prev, pages: newPages }
      })
    } catch (err) {
      if (err instanceof VaultApiError && err.status === 409) {
        setEditError('File changed since you opened the editor. Reopen to see latest.')
      } else {
        const msg = err instanceof Error ? err.message : String(err)
        setEditError(`Save failed: ${msg}`)
      }
    } finally {
      setEditSaving(false)
    }
  }, [currentPath, editSha, editContent])

  /* -- Render --------------------------------------------------------- */

  if (loadError) {
    return (
      <div className="p-4 text-sm text-rose-400">
        Failed to load vault: {loadError}
      </div>
    )
  }
  if (!vault) {
    return <div className="p-4 text-xs text-slate-500">Loading vault…</div>
  }

  return (
    <div className="flex h-full min-h-0 gap-4">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/40 p-2">
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
                      className={pageBtnClass(indexActive)}
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
                        className={pageBtnClass(isActive)}
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

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/40 p-6">
        {!selectedPage ? (
          <EmptyState totalPages={vault.count} generatedAt={vault.generated_at} />
        ) : (
          <article>
            <Breadcrumb
              parts={breadcrumb}
              onJump={(prefix) => {
                // Click "Menu" in "Menu / Salads.md" → open Menu/README.md
                const candidate = `${prefix}/README.md`
                if (knownPaths.includes(candidate)) navigateToPage(candidate)
              }}
            />

            <header className="mb-4 flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold text-slate-100">
                  {selectedPage.title}
                </h1>
                <PageMeta frontmatter={selectedPage.frontmatter} />
              </div>
              <EditControls
                editing={editing}
                editLoading={editLoading}
                editSaving={editSaving}
                onStart={startEdit}
                onCancel={cancelEdit}
                onSave={saveEdit}
              />
            </header>

            {editError && (
              <div className="mb-3 flex items-start gap-2 rounded border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-xs text-rose-300">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{editError}</span>
              </div>
            )}
            {savedNotice && !editing && (
              <div className="mb-3 rounded border border-emerald-700/40 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-300">
                {savedNotice}
              </div>
            )}

            <div className="flex gap-6">
              <div className="flex-1 min-w-0">
                {editing ? (
                  <Editor content={editContent} onChange={setEditContent} />
                ) : (
                  <div className="wiki-prose">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h2: ({ children }) => {
                          const text = typeof children === 'string' ? children : String(children)
                          return <h2 id={slugifyHeading(text)}>{children}</h2>
                        },
                        h3: ({ children }) => {
                          const text = typeof children === 'string' ? children : String(children)
                          return <h3 id={slugifyHeading(text)}>{children}</h3>
                        },
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
                )}
              </div>

              {/* Right rail: TOC + assets */}
              <aside className="hidden w-52 shrink-0 lg:block">
                <div className="sticky top-0 space-y-4">
                  {assets.length > 0 && <AssetsPanel assets={assets} />}
                  {toc.length > 0 && <TocPanel entries={toc} />}
                </div>
              </aside>
            </div>
          </article>
        )}
      </main>
    </div>
  )
}

/* -- Sub-components --------------------------------------------------- */

function pageBtnClass(active: boolean): string {
  return [
    'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs',
    active
      ? 'bg-fuchsia-500/10 text-fuchsia-300'
      : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200',
  ].join(' ')
}

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

function Breadcrumb({
  parts,
  onJump,
}: {
  parts: string[]
  onJump: (prefix: string) => void
}) {
  if (parts.length === 0) return null
  return (
    <nav className="mb-2 flex items-center gap-1 text-[11px] text-slate-500">
      {parts.map((p, idx) => {
        const isLast = idx === parts.length - 1
        const prefix = parts.slice(0, idx + 1).join('/')
        return (
          <span key={prefix} className="flex items-center gap-1">
            {idx > 0 && <ChevronLeft className="h-3 w-3 rotate-180 text-slate-700" />}
            {isLast ? (
              <span className="text-slate-400">{p.replace(/\.md$/, '')}</span>
            ) : (
              <button
                type="button"
                onClick={() => onJump(prefix)}
                className="hover:text-slate-300"
              >
                {p}
              </button>
            )}
          </span>
        )
      })}
    </nav>
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

function EditControls({
  editing,
  editLoading,
  editSaving,
  onStart,
  onCancel,
  onSave,
}: {
  editing: boolean
  editLoading: boolean
  editSaving: boolean
  onStart: () => void
  onCancel: () => void
  onSave: () => void
}) {
  if (editing) {
    return (
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={editSaving}
          className="flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          <CancelIcon className="h-3.5 w-3.5" />
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={editSaving}
          className="flex items-center gap-1.5 rounded bg-fuchsia-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {editSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={editLoading}
      className="flex shrink-0 items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-fuchsia-500/50 hover:text-fuchsia-300 disabled:opacity-50"
    >
      <Pencil className="h-3.5 w-3.5" />
      {editLoading ? 'Loading…' : 'Edit'}
    </button>
  )
}

function Editor({
  content,
  onChange,
}: {
  content: string
  onChange: (next: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <textarea
        ref={ref}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="min-h-[60vh] w-full resize-y rounded border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 focus:border-fuchsia-500 focus:outline-none"
        placeholder="Markdown content with [[wikilinks]] and YAML frontmatter…"
      />
      <div className="hidden xl:block">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
          Preview
        </div>
        <div className="wiki-prose max-h-[60vh] overflow-y-auto rounded border border-slate-800 bg-slate-900/30 p-3">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content.replace(/^---\n[\s\S]*?\n---\n/, '')}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

function TocPanel({ entries }: { entries: TocEntry[] }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
        On this page
      </div>
      <ul className="space-y-1">
        {entries.map((e, idx) => (
          <li key={`${e.id}-${idx}`}>
            <a
              href={`#${e.id}`}
              className={[
                'block text-xs hover:text-fuchsia-300',
                e.level === 2 ? 'text-slate-300' : '',
                e.level === 3 ? 'pl-3 text-slate-400' : '',
                e.level === 4 ? 'pl-6 text-slate-500' : '',
              ].join(' ')}
            >
              {e.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AssetsPanel({ assets }: { assets: AssetEntry[] }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500">
        <MapPin className="h-3 w-3" />
        Where things live
      </div>
      <ul className="space-y-1.5">
        {assets.map((a, idx) => (
          <li key={`${a.label}-${idx}`} className="text-xs">
            <div className="font-medium text-slate-300">{a.label}</div>
            {a.path && (
              <div className="text-[11px] text-slate-500">{a.path}</div>
            )}
            {a.url && (
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:underline"
              >
                Open <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* -- Helpers ---------------------------------------------------------- */

function stripFrontmatter(md: string): string {
  return md.replace(/^---\n[\s\S]*?\n---\n/, '')
}
