// Client wrapper for /api/vault/* routes.
// Adds the current Supabase JWT as Bearer token automatically.

import { supabase } from '../lib/supabase'

export interface VaultPageFresh {
  path: string
  content: string
  sha: string
  size: number
  htmlUrl: string
}

export interface SaveResult {
  ok: true
  sha: string | null
  commitUrl: string | null
  committedAt: string
}

export class VaultApiError extends Error {
  status: number
  conflictSha?: string

  constructor(message: string, status: number, conflictSha?: string) {
    super(message)
    this.status = status
    this.conflictSha = conflictSha
  }
}

async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) {
    throw new VaultApiError('not authenticated', 401)
  }
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(url, { ...init, headers })
}

/**
 * Fetch the live (GitHub) version of a vault page with its current sha.
 * Use this when opening the editor — vault.json may be stale.
 */
export async function fetchVaultPageFresh(path: string): Promise<VaultPageFresh> {
  const r = await authedFetch(`/api/vault/page?path=${encodeURIComponent(path)}`)
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new VaultApiError(body.message ?? body.error ?? `HTTP ${r.status}`, r.status)
  }
  return r.json()
}

/**
 * Save a vault page. Throws VaultApiError on 409 (conflict) — caller should
 * fetch fresh and prompt the user.
 */
export async function saveVaultPage(args: {
  path: string
  content: string
  sha: string
  message?: string
}): Promise<SaveResult> {
  const r = await authedFetch('/api/vault/save', {
    method: 'POST',
    body: JSON.stringify(args),
  })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new VaultApiError(
      body.message ?? body.error ?? `HTTP ${r.status}`,
      r.status,
      body.currentSha
    )
  }
  return r.json()
}
