// Shared vault helpers used by both BrainWikiPage (single-page reader) and
// BrainExplorePage (merged graph + reader). Source of truth is `public/vault.json`,
// generated at build time from the `vault/` markdown directory.

import { useEffect, useState } from 'react'

export interface VaultTreeEntry {
  path: string
  title: string
  type: string | null
  lastModified: string
  isFolderIndex: boolean
}

export interface VaultPage {
  title: string
  frontmatter: Record<string, unknown>
  content: string
}

export interface VaultJson {
  generated_at: string
  count: number
  tree: VaultTreeEntry[]
  pages: Record<string, VaultPage>
}

export interface FolderNode {
  name: string
  index: VaultTreeEntry | null
  pages: VaultTreeEntry[]
}

export interface AssetEntry {
  label: string
  path?: string
  url?: string
}

export interface TocEntry {
  level: number
  text: string
  id: string
}

const VAULT_URL = '/vault.json'

/* -- Hook ------------------------------------------------------------- */

export interface UseVaultResult {
  vault: VaultJson | null
  error: string | null
  loading: boolean
  /** Imperative override for optimistic updates (after edit save) */
  setVault: (next: VaultJson | ((prev: VaultJson | null) => VaultJson | null)) => void
}

export function useVault(): UseVaultResult {
  const [vault, setVault] = useState<VaultJson | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  return {
    vault,
    error,
    loading,
    setVault: setVault as UseVaultResult['setVault'],
  }
}

/* -- Wikilink resolver ------------------------------------------------ */

export function resolveWikilink(target: string, knownPaths: string[]): string | null {
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

/**
 * Pre-process markdown: replace `[[Note]]` with `[Note](wiki:Path)`.
 * The `wiki:` prefix is intercepted by the markdown renderer's <a>
 * component override to navigate within the SPA instead of opening a tab.
 */
export function transformWikilinks(md: string, knownPaths: string[]): string {
  return md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => {
    const resolved = resolveWikilink(target, knownPaths)
    const text = (label ?? target).trim()
    if (!resolved) return `*${text}*`
    return `[${text}](wiki:${encodeURIComponent(resolved)})`
  })
}

/* -- Tree building ---------------------------------------------------- */

export function buildFolderNodes(tree: VaultTreeEntry[]): FolderNode[] {
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

/* -- TOC -------------------------------------------------------------- */

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

export function extractToc(markdown: string): TocEntry[] {
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

/* -- Assets ----------------------------------------------------------- */

export function readAssets(frontmatter: Record<string, unknown>): AssetEntry[] {
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

/* -- Frontmatter helpers --------------------------------------------- */

export function stripFrontmatter(md: string): string {
  return md.replace(/^---\n[\s\S]*?\n---\n/, '')
}
