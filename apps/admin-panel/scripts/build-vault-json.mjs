#!/usr/bin/env node
// Scans vault/*.md, parses frontmatter, computes git lastModified, emits
// apps/admin-panel/public/vault.json for the Brain Wiki reader.
//
// Output shape:
//   {
//     generated_at: ISO8601,
//     count: number,
//     tree: [{ path, title, type, lastModified, isFolderIndex }],
//     pages: { [path]: { title, frontmatter, content } }
//   }
//
// Run as part of admin-panel `prebuild`. Also safe to invoke manually:
//   node scripts/build-vault-json.mjs

import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { join, relative, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import matter from 'gray-matter'

// Script lives at apps/admin-panel/scripts/. Repo root is two levels up.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const VAULT_DIR = join(REPO_ROOT, 'vault')
const OUTPUT = join(REPO_ROOT, 'apps/admin-panel/public/vault.json')

// Folders we expose to the reader. Keep this in sync with vault/README.md taxonomy.
const ALLOWED_TOP_LEVEL = new Set([
  // Front-door entity folders
  'Menu', 'Brand', 'Recipes', 'Equipment', 'Procurement',
  'Finance', 'Operations', 'Database', 'Tech', 'Legal',
  // Sidebar audit-log folders
  'Decisions', 'Milestones', 'People', 'Open Questions',
  // Legacy / meta
  'Architecture', 'Handover',
])

async function walk(dir) {
  const out = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      out.push(...(await walk(full)))
    } else if (e.isFile() && e.name.endsWith('.md')) {
      out.push(full)
    }
  }
  return out
}

function gitLastModified(absPath) {
  try {
    const iso = execSync(
      `git log -1 --format=%cI -- "${relative(REPO_ROOT, absPath)}"`,
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim()
    return iso || null
  } catch {
    return null
  }
}

async function main() {
  const all = await walk(VAULT_DIR)
  const tree = []
  const pages = {}

  for (const abs of all) {
    const rel = relative(VAULT_DIR, abs)
    const top = rel.split('/')[0]
    // Only emit pages inside ALLOWED_TOP_LEVEL folders — never root-level files.
    // The vault root README is the ontology explainer; we render it elsewhere.
    if (!ALLOWED_TOP_LEVEL.has(top) || !rel.includes('/')) continue

    const raw = await readFile(abs, 'utf8')
    const parsed = matter(raw)
    const fm = parsed.data || {}
    const title =
      typeof fm.title === 'string' && fm.title.trim() ? fm.title.trim() : basename(rel, '.md')
    const lastModified = gitLastModified(abs) || (await stat(abs)).mtime.toISOString()
    const isFolderIndex = basename(rel) === 'README.md'

    tree.push({
      path: rel,
      title,
      type: typeof fm.type === 'string' ? fm.type : null,
      lastModified,
      isFolderIndex,
    })

    pages[rel] = {
      title,
      frontmatter: fm,
      content: parsed.content,
    }
  }

  // Stable sort: folder, then folder-index first, then alpha
  tree.sort((a, b) => {
    const af = a.path.split('/')[0]
    const bf = b.path.split('/')[0]
    if (af !== bf) return af.localeCompare(bf)
    if (a.isFolderIndex !== b.isFolderIndex) return a.isFolderIndex ? -1 : 1
    return a.path.localeCompare(b.path)
  })

  const out = {
    generated_at: new Date().toISOString(),
    count: tree.length,
    tree,
    pages,
  }

  await writeFile(OUTPUT, JSON.stringify(out, null, 2) + '\n', 'utf8')
  console.log(`[vault.json] wrote ${tree.length} pages → ${relative(REPO_ROOT, OUTPUT)}`)
}

main().catch((err) => {
  console.error('[vault.json] failed:', err)
  process.exit(1)
})
