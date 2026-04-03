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
| `VITE_SUPABASE_URL` | Frontend (.env) | Public URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend (.env) | Public anon key |
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
