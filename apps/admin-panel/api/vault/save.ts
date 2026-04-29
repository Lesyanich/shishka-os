// POST /api/vault/save — write a vault markdown file via GitHub commit.
//
// Auth flow:
//   1. Bearer JWT from admin panel — verified by getAuthedUser
//   2. Reject anyone without app_role === 'owner'
//
// Commit flow:
//   1. octokit.repos.getContent(path) → fetch current sha
//   2. If client-supplied sha mismatches current → 409 Conflict
//      (someone else edited the file in the meantime)
//   3. octokit.repos.createOrUpdateFileContents(...) → commit to default branch
//   4. Return new sha + commit URL
//
// Env vars (set in Vercel project):
//   GITHUB_TOKEN          — Personal Access Token (Contents: write) OR
//                           GitHub App installation token
//   GITHUB_REPO_OWNER     — defaults to 'Lesyanich'
//   GITHUB_REPO_NAME      — defaults to 'shishka-os'
//   GITHUB_DEFAULT_BRANCH — defaults to 'main'

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Octokit } from '@octokit/rest'
import { getAuthedUser } from '../_lib/supabase.js'

export const config = { runtime: 'nodejs', maxDuration: 30 }

interface SaveBody {
  path: string         // e.g. "Menu/README.md" — relative to vault/
  content: string      // full new file content (markdown + frontmatter)
  message?: string     // commit message; default constructed from path + user
  sha: string          // current sha as known to the editor; conflict guard
}

const REPO_OWNER = process.env.GITHUB_REPO_OWNER ?? 'Lesyanich'
const REPO_NAME = process.env.GITHUB_REPO_NAME ?? 'shishka-os'
const DEFAULT_BRANCH = process.env.GITHUB_DEFAULT_BRANCH ?? 'main'

function setCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
}

function isValidVaultPath(path: string): boolean {
  // Must be relative, end with .md, no .. traversal, no leading slash.
  if (!path || typeof path !== 'string') return false
  if (path.startsWith('/') || path.includes('..')) return false
  if (!path.endsWith('.md')) return false
  // Top-level must be a known vault folder
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'method-not-allowed' })

  // 1. Auth
  const authed = await getAuthedUser(req)
  if (!authed) return res.status(401).json({ error: 'unauthorized' })
  if (authed.user.role !== 'owner') {
    return res.status(403).json({ error: 'forbidden', message: 'owner role required' })
  }

  // 2. Body validation
  const body = req.body as SaveBody | undefined
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'bad-request', message: 'body required' })
  }
  if (!isValidVaultPath(body.path)) {
    return res.status(400).json({ error: 'bad-path', message: 'path must be a relative .md file under a known vault folder' })
  }
  if (typeof body.content !== 'string') {
    return res.status(400).json({ error: 'bad-content' })
  }
  if (typeof body.sha !== 'string' || !body.sha) {
    return res.status(400).json({ error: 'bad-sha', message: 'current sha required for conflict guard' })
  }

  // 3. GitHub auth
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    return res.status(500).json({ error: 'misconfigured', message: 'GITHUB_TOKEN not set' })
  }
  const octokit = new Octokit({ auth: token })

  const filePath = `vault/${body.path}`
  const message =
    body.message?.trim() ||
    `docs(vault): edit ${body.path} via admin Pages`

  try {
    // 4. Conflict guard: fetch current sha and compare
    let currentSha: string | null = null
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: filePath,
        ref: DEFAULT_BRANCH,
      })
      if (Array.isArray(data) || data.type !== 'file') {
        return res.status(400).json({ error: 'not-a-file' })
      }
      currentSha = data.sha
    } catch (err: unknown) {
      const status = (err as { status?: number }).status
      if (status !== 404) throw err
      // 404 = file doesn't exist yet (creating new). Allow only when client sent empty sha placeholder.
      if (body.sha !== 'NEW') {
        return res.status(404).json({ error: 'not-found' })
      }
    }

    if (currentSha && currentSha !== body.sha) {
      return res.status(409).json({
        error: 'conflict',
        message: 'file changed since editor opened — refresh and reapply',
        currentSha,
      })
    }

    // 5. Commit
    const result = await octokit.rest.repos.createOrUpdateFileContents({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: filePath,
      branch: DEFAULT_BRANCH,
      message: `${message}\n\n— ${authed.user.email ?? authed.user.id} via admin /brain/wiki`,
      content: Buffer.from(body.content, 'utf8').toString('base64'),
      sha: currentSha ?? undefined,
    })

    const newSha = result.data.content?.sha ?? null
    const commitUrl = result.data.commit.html_url ?? null

    return res.status(200).json({
      ok: true,
      sha: newSha,
      commitUrl,
      committedAt: new Date().toISOString(),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[vault/save] failed:', message)
    return res.status(500).json({ error: 'internal', message })
  }
}
