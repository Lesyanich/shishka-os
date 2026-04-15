# `/api/` — Shishka OS Backend

Vercel Functions for `shishka-os` — currently hosting only the AI Chef API.

Spec: [`docs/projects/admin/plans/spec-ai-executive-chef.md`](../../../docs/projects/admin/plans/spec-ai-executive-chef.md)

## Endpoints

| Path | Method | Auth | Status |
|---|---|---|---|
| `/api/chef/health` | GET | none | scaffolded (P1.3) |
| `/api/chef/chat` | POST | Bearer JWT | scaffolded (P1.3) — no tools yet |
| `/api/chef/action` | POST | Bearer JWT (owner) | TODO (P1.4) |
| `/api/chef/feedback` | POST | Bearer JWT (cook+) | TODO (P1.5) |
| `/api/chef/queue` | GET | Bearer JWT (owner) | TODO (P1.5) |
| `/api/chef/approve` | POST | Bearer JWT (owner) | TODO (P1.6) |

## Required env vars

Set these in **Vercel project settings** (`shishka-os` project), Production + Preview:

| Variable | Where used | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API client | **NEW** — get from console.anthropic.com |
| `SUPABASE_URL` | server-side Supabase | Same value as `VITE_SUPABASE_URL` (already set) |
| `SUPABASE_ANON_KEY` | server-side Supabase (user-context) | Same value as `VITE_SUPABASE_ANON_KEY` (already set) |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role operations | Required for ops that bypass RLS |

Verify with `GET /api/chef/health` — returns `{status: 'ok'}` if all set, `503` otherwise.

## Local dev

The Vite dev server (`npm run dev`) does **not** run Functions. Use the Vercel CLI:

```bash
cd apps/admin-panel
vercel dev          # serves SPA + Functions on http://localhost:3000
```

`vercel dev` reads env vars from a local `.env` file or pulls from your Vercel project (`vercel env pull`).

## Architectural constraints (P1.2 decisions)

- **Vercel Hobby tier** → 300s max per Function. The chat endpoint is configured at 300s; everything else at 60s. Chunk anything that risks > 250s.
- **Single project** — `/api/chef/*` lives next to the SPA in this same Vercel project.
- **Hybrid execution** — synchronous response, push side effects (audit logs, token tracking, materialized view refreshes) to fire-and-forget after `res.end()`. Switch to a Supabase queue + Vercel Cron only if we hit a real 300s timeout.

## Conventions

- Files prefixed with `_` are private (Vercel ignores them as routes). Use `api/_lib/` for shared code.
- One file = one route. No express-style routers.
- Always use `getAuthedUser()` for endpoints that need auth — never trust client-provided user IDs.
- For per-user DB access, use `supabaseForUser(jwt)` so RLS enforces the user's role. Reach for `supabaseService()` only when you've already done the auth + role check yourself.
