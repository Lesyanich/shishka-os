#!/usr/bin/env node
// Regenerates the AUTO-marked sections of vault/Tech/Project Map.md.
//
// The "hybrid" project map (MC task 2905d250): curated prose is hand-written
// and left untouched; the mechanical, high-churn lists (admin pages/routes,
// agents, MCP servers, DB table count) are regenerated from the REPO here so
// they never silently go stale. Repo-only by design — no live DB, no network,
// no credentials — so it's robust and safe to run anywhere, anytime.
//
// Run manually after structural changes, or wire into a build step:
//   node scripts/gen-project-map.mjs
//
// It only rewrites text BETWEEN the <!-- AUTO:x START --> / <!-- AUTO:x END -->
// markers. Everything else in the page is yours to edit.

import { readFile, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ADMIN_SRC = join(REPO_ROOT, 'apps/admin-panel/src')
const PAGE = join(REPO_ROOT, 'vault/Tech/Project Map.md')
const APP_TSX = join(REPO_ROOT, 'apps/admin-panel/src/App.tsx')
const MCP_JSON = join(REPO_ROOT, '.mcp.json')
const AGENTS_DIR = join(REPO_ROOT, 'agents')
const SCHEMA_MD = join(REPO_ROOT, 'vault/Database/Schema.md')

const WRAPPERS = new Set(['Route', 'Routes', 'Suspense', 'PageLoader', 'RoleGuard', 'Navigate', 'Outlet', 'BrowserRouter'])

// Resolve an import specifier ('./pages/x' or './pages/x/Comp') to the real file
// on disk — handles direct files and directory barrels (index.ts / re-exports).
function resolveFile(importPath, component) {
  const base = importPath.replace(/^\.\//, '')
  const tries = [
    `${base}.tsx`,
    `${base}.ts`,
    join(base, `${component}.tsx`),
    join(base, `${component}.ts`),
    join(base, 'index.tsx'),
    join(base, 'index.ts'),
  ]
  for (const t of tries) {
    if (existsSync(join(ADMIN_SRC, t))) return `apps/admin-panel/src/${t}`
  }
  const known = /\.(tsx?|jsx?)$/.test(base)
  return `apps/admin-panel/src/${base}${known ? '' : '/'}`
}

// --- Admin pages: lazy component -> source file ---
async function adminPages(appSrc) {
  const re = /const\s+(\w+)\s*=\s*lazyWithReload\(\s*\(\)\s*=>\s*import\('([^']+)'\)/g
  const rows = []
  let m
  while ((m = re.exec(appSrc)) !== null) {
    rows.push({ component: m[1], file: resolveFile(m[2], m[1]) })
  }
  rows.sort((a, b) => a.component.localeCompare(b.component))
  return rows
}

// --- Routes: every path="..." grouped by its top-level area ---
function routes(appSrc) {
  const paths = [...appSrc.matchAll(/path="([^"]+)"/g)].map((m) => m[1])
  const groups = new Map()
  let current = '/'
  for (const p of paths) {
    if (p.startsWith('/')) current = '/' + (p.split('/')[1] || '')
    const key = current === '/' ? '/ (root)' : current
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(p)
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

// --- Agents: dir + first "# " heading ---
async function agents() {
  const entries = await readdir(AGENTS_DIR, { withFileTypes: true })
  const rows = []
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('_')) continue
    let heading = ''
    try {
      const md = await readFile(join(AGENTS_DIR, e.name, 'AGENT.md'), 'utf8')
      const h = md.match(/^#\s+(.+)$/m)
      heading = h ? h[1].trim() : ''
    } catch {
      heading = '(no AGENT.md)'
    }
    rows.push({ name: e.name, heading })
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return rows
}

// --- MCP servers from .mcp.json ---
async function mcpServers() {
  const j = JSON.parse(await readFile(MCP_JSON, 'utf8'))
  return Object.keys(j.mcpServers || {}).sort()
}

// --- DB table count from Schema.md "## Tables Index" ---
async function tableCount() {
  try {
    const md = await readFile(SCHEMA_MD, 'utf8')
    const idx = md.indexOf('## Tables Index')
    if (idx === -1) return null
    const after = md.slice(idx, md.indexOf('\n## ', idx + 10))
    // count markdown table body rows (| ... |) excluding header/separator
    const rows = after.split('\n').filter((l) => /^\|/.test(l) && !/^\|\s*-+/.test(l))
    const body = Math.max(0, rows.length - 1) // minus header row
    return body || null
  } catch {
    return null
  }
}

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

function replaceBlock(text, name, body) {
  const start = `<!-- AUTO:${name} START -->`
  const end = `<!-- AUTO:${name} END -->`
  const re = new RegExp(`${start}[\\s\\S]*?${end}`)
  if (!re.test(text)) {
    throw new Error(`marker AUTO:${name} not found in page`)
  }
  return text.replace(re, `${start}\n${body}\n${end}`)
}

async function main() {
  let page = await readFile(PAGE, 'utf8')
  const appSrc = await readFile(APP_TSX, 'utf8')

  // pages
  const pages = await adminPages(appSrc)
  const pagesBody =
    '| Page | Source file |\n|---|---|\n' +
    pages.map((r) => `| \`${r.component}\` | \`${r.file}\` |`).join('\n')
  page = replaceBlock(page, 'pages', pagesBody)

  // routes
  const rt = routes(appSrc)
  const routesBody = rt
    .map(([area, ps]) => `- **${area}** — ${[...new Set(ps)].map((p) => `\`${p}\``).join(', ')}`)
    .join('\n')
  page = replaceBlock(page, 'routes', routesBody)

  // agents
  const ag = await agents()
  const agentsBody =
    '| Agent | Prompt dir | Identity |\n|---|---|---|\n' +
    ag.map((a) => `| \`/${a.name}\` | \`agents/${a.name}/\` | ${a.heading} |`).join('\n')
  page = replaceBlock(page, 'agents', agentsBody)

  // mcp
  const mcp = await mcpServers()
  const mcpBody = mcp.map((s) => `- \`${s}\` → \`services/${s.replace('shishka-', 'mcp-')}/\``).join('\n')
  page = replaceBlock(page, 'mcp', mcpBody)

  // table count
  const tc = await tableCount()
  const countBody = tc
    ? `[[Database/Schema]]'s Tables Index documents **${tc} core tables** — a curated subset, not the full live schema (the live DB carries more). Full schema, RLS and RPCs live in the [[Database/]] folder; this map does not duplicate them.`
    : `See [[Database/Schema]] for the table list, RLS and RPCs — this map does not duplicate them.`
  page = replaceBlock(page, 'tables', countBody)

  // stamp
  const stamp = `_Auto sections regenerated from the repo at commit \`${gitSha()}\`. Re-run: \`node scripts/gen-project-map.mjs\`._`
  page = replaceBlock(page, 'stamp', stamp)

  await writeFile(PAGE, page)
  console.log(`[project-map] regenerated AUTO sections: ${pages.length} pages, ${rt.length} route areas, ${ag.length} agents, ${mcp.length} MCP, ${tc ?? '?'} tables`)
}

main().catch((e) => {
  console.error('[project-map] FAILED:', e.message)
  process.exit(1)
})
