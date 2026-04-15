// Server-side Supabase client factory for Vercel Functions.
// Files prefixed with `_` are not exposed as routes by Vercel.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL) throw new Error('SUPABASE_URL env var is required')
if (!SUPABASE_ANON_KEY) throw new Error('SUPABASE_ANON_KEY env var is required')

/**
 * Create a Supabase client authenticated as the user identified by their JWT.
 * RLS policies will apply as if the user themselves made the request.
 */
export function supabaseForUser(jwt: string): SupabaseClient {
  return createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Service-role client — bypasses RLS. Use only for internal operations
 * where we've already done auth + role checks. Never expose its results
 * directly to the user without filtering.
 */
export function supabaseService(): SupabaseClient {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY env var is required for service-role operations')
  }
  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export interface AuthedUser {
  id: string
  email: string | null
  role: string | null // app_role from staff table: owner | cook | null
}

/**
 * Read the user's JWT from the Authorization header, verify with Supabase,
 * and look up their app_role from the staff table.
 *
 * Returns null on auth failure — caller should respond 401.
 */
export async function getAuthedUser(req: { headers: Record<string, string | string[] | undefined> }): Promise<{ user: AuthedUser; jwt: string } | null> {
  const authHeader = req.headers.authorization ?? req.headers.Authorization
  const headerStr = Array.isArray(authHeader) ? authHeader[0] : authHeader
  if (!headerStr || !headerStr.startsWith('Bearer ')) return null

  const jwt = headerStr.slice('Bearer '.length).trim()
  if (!jwt) return null

  const supa = supabaseForUser(jwt)

  const { data: userData, error: userError } = await supa.auth.getUser(jwt)
  if (userError || !userData.user) return null

  // Look up app_role from staff table (best-effort; null if no row)
  const { data: staffRow } = await supa
    .from('staff')
    .select('app_role')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle()

  return {
    jwt,
    user: {
      id: userData.user.id,
      email: userData.user.email ?? null,
      role: (staffRow?.app_role as string | null) ?? null,
    },
  }
}
