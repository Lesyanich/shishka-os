// GET /api/vault/page?path=Menu/README.md
//
// Returns the current content + sha of a vault file (live from GitHub),
// used by the editor to open with the freshest version + sha for the
// conflict guard on save.
//
// Auth: Bearer JWT from admin panel. owner role required.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Octokit } from '@octokit/rest'
import { getAuthedUser } from '../_lib/supabase.js'

export const config = { runtime: 'nodejs', maxDuration: 15 }

const REPO_OWNER = process.env.GITHUB_REPO_OWNER ?? 'Lesyanich'
const REPO_NAME = process.env.GITHUB_REPO_NAME ?? 'shishka-os'
const DEFAULT_BRANCH = process.env.GITHUB_DEFAULT_BRANCH ?? 'main'

function setCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
}

function isValidVaultPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false
  if (path.startsWith('/') || path.includes('..')) return false
  if (!path.endsWith('.md')) return false
  const top = path.split('/')[0]
  const allowed = [
    'Menu', 'Brand', 'Recipes', 'Equipment', 'Procurement',
    'Finance', 'Operations', 'Database', 'Tech',
    'Decisions', 'Milestones', 'People', 'Open Questions',
    'Architecture', 'Handover',
  ]
  return allowed.includes(top)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'method-not-allowed' })

  const authed = await getAuthedUser(req)
  if (!authed) return res.status(401).json({ error: 'unauthorized' })
  if (authed.user.role !== 'owner') return res.status(403).json({ error: 'forbidden' })

  const pathParam = Array.isArray(req.query.path) ? req.query.path[0] : req.query.path
  if (!pathParam || !isValidVaultPath(pathParam)) {
    return res.status(400).json({ error: 'bad-path' })
  }

  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(500).json({ error: 'misconfigured' })

  const octokit = new Octokit({ auth: token })
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: `vault/${pathParam}`,
      ref: DEFAULT_BRANCH,
    })
    if (Array.isArray(data) || data.type !== 'file') {
      return res.status(400).json({ error: 'not-a-file' })
    }
    // GitHub content API returns base64-encoded content
    const content = Buffer.from(data.content, 'base64').toString('utf8')
    return res.status(200).json({
      path: pathParam,
      content,
      sha: data.sha,
      size: data.size,
      htmlUrl: data.html_url,
    })
  } catch (err: unknown) {
    const status = (err as { status?: number }).status
    if (status === 404) return res.status(404).json({ error: 'not-found' })
    const message = err instanceof Error ? err.message : String(err)
    console.error('[vault/page] failed:', message)
    return res.status(500).json({ error: 'internal', message })
  }
}
