# Keys & Configuration

## Supabase Project

- **Project ID:** `qcqgtcsjoacuktcewpvo`
- **URL:** `https://qcqgtcsjoacuktcewpvo.supabase.co`
- **Region:** ap-south-1 (Mumbai)
- **PostgreSQL:** 17.6

## Auth Model

- **Method:** `app.tg_user_id` (TEXT) + `app.is_admin` (TEXT 'true'/'false') via `set_request_context()`
- **Frontend:** Uses `anon` key (no Supabase Auth yet — admin panel is internal-only)
- **Edge Functions:** Some deployed with `--no-verify-jwt` (admin-panel has no auth session)

## Secrets Registry (names only — values in Supabase Dashboard)

| Secret | Used By | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Frontend (.env.local) | Public URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend (.env.local) | Public anon key |
| `SUPABASE_URL` | Edge Functions | Same as VITE_ |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions | For RLS bypass in update-receipt-job |
| `GAS_WEB_APP_URL` | Edge Function (parse-receipts) | Pinned GAS deployment URL |
| `GEMINI_API_KEY` | GAS Script Properties | For Gemini 2.5 Flash |

## Dev Server

- **Path:** `apps/admin-panel/`
- **Command:** `npm run dev`
- **Port:** 5173
- **Config:** `.claude/launch.json` → `shishka-os-dev`

## GAS Deployment

- **Script ID:** `14BpgyjV6qH1a2mL3u6zC7p6GJAmGDkfXR7Qi1b9ufU2ItxrvOW_pvI8P`
- **Deploy:** `cd services/gas && npm run deploy`

## Secret Location Policy (SSoT)

Every secret has exactly **one** file that holds the real value. Other services read that file at runtime — they do NOT copy it into their own `.env`.

| Secret | SSoT File | Consumers | Loading Pattern |
|---|---|---|---|
| `DATABASE_URL` (Supabase Postgres) | `services/lightrag/db-url.local` (gitignored) | LightRAG (`run-server.sh`) | shell-source + URL parser |
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | `apps/admin-panel/.env.local` (gitignored) | admin-panel (Vite) | Vite auto-load. Public-by-design (anon key ships in browser bundle); RLS is the protection layer. Copy from `.env.example`. |
| `SUPABASE_SERVICE_ROLE_KEY` | macOS Keychain (item: `SUPABASE_SERVICE_ROLE_KEY`) / CI secrets (never committed) | MCP services, Edge Functions | `scripts/launch-*-mcp.sh` wrappers read from keychain via `security find-generic-password -s "SUPABASE_SERVICE_ROLE_KEY" -w`, GitHub Secrets in CI |

**Rules:**
1. If a new service needs an existing secret → source it from the SSoT file. Do not create a second `.env` with the same value.
2. If a new secret is introduced → pick its SSoT file explicitly, add a row here.
3. Never paste secret values into Claude chat, MC comments, commit messages, or task notes.
4. Private single-user repo: per-service gitignored `*.local` files are acceptable. Switch to host-keychain or secret-manager when team grows beyond CEO or a second consumer of the same secret appears.
5. `lightrag/db-url.local` must use Supabase **direct connection** (`db.<project>.supabase.co:5432`) or **session pooler** (`:5432`) — **never transaction pooler `:6543`**, which breaks `asyncpg` prepared statements used by `lightrag-hku`.
