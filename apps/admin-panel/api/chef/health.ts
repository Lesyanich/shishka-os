// GET /api/chef/health — smoke test endpoint.
// Confirms the function runtime is up and required env vars are present.
// No auth required — safe to call from anywhere.

import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { runtime: 'nodejs' }

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const env = {
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL),
    SUPABASE_ANON_KEY: Boolean(process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  }

  const allOk = env.ANTHROPIC_API_KEY && env.SUPABASE_URL && env.SUPABASE_ANON_KEY

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'misconfigured',
    timestamp: new Date().toISOString(),
    env,
    runtime: 'nodejs',
  })
}
