# Shishka OS — Tech Stack

> Single source of truth for the stack. Last verified 2026-07-08 against `apps/admin-panel/package.json`.
> Was `TECH_STACK.md` at repo root; consolidated here (MC task 07044b76).

## Frontend (`apps/admin-panel/`)

| Tool | Version | Notes |
|------|---------|-------|
| React | ^19.2 | SPA |
| React Router DOM | ^7.13 | Routing |
| Vite | ^7.3 | Build tool, dev server (port 5173) |
| Tailwind CSS | ^4.2 | Via `@tailwindcss/vite`; tokens need `--color-*` namespace |
| TypeScript | ~5.9 | strict |
| lucide-react | ^0.577 | Icons |
| Recharts | ^3.8 | Charts |
| Sentry | ^10 | Error monitoring |
| Vercel AI SDK | `ai` ^6, `@ai-sdk/*` | In-app AI features |
| Deployment | Vercel | Project root: `apps/admin-panel/`; per-PR previews |

Other apps: `apps/kds/` (kitchen display), `apps/web/` (public site lives in the separate **shishka-health** repo — live at shishka.health; the brand design system lives there too: `design-system/index.html` + `MASTER.md`).

## Backend

| Tool | Notes |
|------|-------|
| Supabase | PostgreSQL 17.6, Auth, Storage, Edge Functions, Realtime |
| Region / project | ap-south-1, `qcqgtcsjoacuktcewpvo` |
| RLS | Enabled on all tables (mostly `authenticated`-level, not role-gated — see `docs/security/`) |
| Migrations | `services/supabase/migrations/` — sequential SQL; ledger = `migration_log` table |
| Edge functions | `services/supabase/functions/`; live `loyverse-sync` may be AHEAD of repo — patch from `get_edge_function` |

## AI / Agents

| Tool | Notes |
|------|-------|
| Claude Code | Primary development + operations AI |
| MCP servers | `services/mcp-chef`, `mcp-finance`, `mcp-mission-control` |
| Agent prompts | `agents/{chef,finance,coo,lawyer,procurement,strategy,tech-lead,designer}/` |
| Skills / hooks | `.claude/skills/`, `.claude/hooks/` (claim-gate, skill-advisor, status generation) |

## External Systems

| System | Role |
|--------|------|
| Loyverse | POS (sales, receipts, items). DB is source of truth; push via `loyverse-sync` edge fn + `loyverse_push_queue` |
| Google Apps Script | Legacy receipt-parsing bridge (Gemini Vision OCR); current flow = finance agent via Supabase Storage inbox |
| Google Drive | Shared Drive (legal docs, menu photo sources) |
| Telegram | Staff task notifications (bot) |
| Makro / suppliers | Catalog parsers in `tools/` and MCP search tools |

## Monorepo Layout

No workspace manager (no Turborepo/Nx). Each `apps/` and `services/` directory has its own `package.json` and runs independently. Root `package.json` only carries husky + convenience scripts (`build:admin`, `lint:admin`, `typecheck:admin`).
