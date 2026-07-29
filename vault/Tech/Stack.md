---
title: Tech Stack
type: page
tags: [tech, stack, infra]
date: 2026-04-29
status: active
related:
  - "[[Tech/]]"
  - "[[Tech/Architecture]]"
  - "[[Database/]]"
---

# Tech Stack

Source: `TECH_STACK.md`, `PROJECT_MAP.md`, Auto Memory `project_admin_panel_stack.md`. The current production stack as of April 2026.

## Frontend (admin panel)

| Tool | Version | Notes |
|---|---|---|
| **React** | 19.2 | SPA. Concurrent features (`useOptimistic`, `Suspense`) used throughout |
| **React Router DOM** | v7 | RR7 (not v6 — different API for some hooks) |
| **Vite** | 7 | Build tool + dev server. NOT Next.js (verify via `vite.config.ts`) |
| **Tailwind CSS** | v4 | Utility-first, with `@theme` block in `apps/admin-panel/src/index.css` |
| **Recharts** | latest | Data visualization (Brain Cost, Quality, Finance Analytics) |
| **Sentry** | 10 | Error monitoring |
| **lucide-react** | 0.577 | Icon set |
| **react-markdown + remark-gfm + gray-matter** | latest | Vault wiki rendering on `/brain/wiki` |
| **@octokit/rest** | 22 | GitHub commit API for inline vault editor |

## AI SDKs

| Tool | Use |
|---|---|
| `@ai-sdk/anthropic` | Claude (Chef chat in admin) |
| `@ai-sdk/google` | Gemini (Receipt OCR) |
| `@ai-sdk/openai` | OpenAI (alternative provider for select tools) |
| `@anthropic-ai/sdk` | Direct SDK for tool-use streaming |
| `ai` (Vercel AI SDK) | Streaming + tool-use orchestration |

## Backend

| Tool | Version | Notes |
|---|---|---|
| **Supabase** | PostgreSQL 17.6 | Auth, DB, Storage, Edge Functions |
| Region | `ap-south-1` | Project ID: `qcqgtcsjoacuktcewpvo` |
| **RLS** | enabled on all tables | Phase A (wide-open today), Phase D scoping planned. See [[Database/RLS Policies]] |
| Migrations | `services/supabase/migrations/` | Sequential SQL, ~164 files |

## Deployment

- **Vercel** — auto-deploys `main` branch
- **Project**: `shishka-os` (the older `admin-panel` Vercel project was deleted 2026-04-11)
- **URL**: [shishka-os.vercel.app](https://shishka-os.vercel.app)
- **Pattern**: never `npx vercel --prod` from terminal — only `gh pr merge --squash`, then Vercel auto-deploys (per Auto Memory `feedback_merge_via_gh_pr.md`)

## External systems

| System | Role |
|---|---|
| **SYRVE** | POS system of record (inventory, BOM, sales) — Phase 1 integration TBD |
| **Google Apps Script** | Receipt parsing bridge (Gemini Vision OCR) |
| **Google Drive** | Shared `01_Business/` folder — see [[Operations/Drive Map]] |
| **Makro Phuket** | Wholesale supplier — receipts parsed via `tools/makro-parser/` |
| **GitHub** | `Lesyanich/shishka-os` — source repo + commit-back from admin editor |

## MCP servers

See [[Tech/MCP Servers]] for the full catalog. Quick list:

```
.mcp.json
├── shishka-mission-control     services/mcp-mission-control/
├── shishka-chef                services/mcp-chef/
└── shishka-finance             services/mcp-finance/
    (shishka-graphify was retired 2026-07-18 — see docs/plans/spec-graphify-retirement.md)
```

## Monorepo layout

> No workspace manager (no Turborepo / Nx). Each `apps/` and `services/` has its own `package.json` and runs independently.

```
shishka-os/
├── docs/             Brains: rules, domain knowledge, plans
├── agents/           Brains: agent prompts, guidelines
├── apps/
│   ├── admin-panel/  React 19 + Vite + Tailwind v4 — owner UI
│   ├── kds/          Lightweight KDS (planned standalone or kept inside admin)
│   └── web/          Public site (planned)
├── services/
│   ├── mcp-mission-control/    Mission Control MCP server
│   ├── mcp-finance/            Finance domain logic
│   ├── mcp-chef/               Chef domain logic
│   ├── gas/                    Google Apps Script for receipt parsing bridge
│   ├── local-receipt-parser/   Local OCR pipeline (alternative to GAS)
│   └── supabase/               Migrations + shared types
├── tools/                      Standalone utilities (parsers, sync scripts)
├── vault/                      Knowledge vault (this folder)
├── knowledge/                  Long-form research (cooking lessons, AI learning)
└── .secrets/                   Credentials (gitignored)
```

## Pre-commit + CI gates

Husky `.husky/pre-commit` runs:

1. **TypeScript** — `tsc -b` (admin panel)
2. **ESLint** — `--max-warnings 0` (per Auto Memory `feedback_precommit_max_warnings.md`)
3. **AI-TDD gate (HC-3)** — every new `src/` file needs a sibling `.test.ts` (smoke is OK; see Auto Memory `feedback_admin_panel_hc3_no_runner.md`)
4. **Migration canary** — sequential numbering check on `services/supabase/migrations/`

`.husky/post-commit` runs `generate_status` to refresh `STATUS.md` (offline-safe; if Supabase is unreachable, generates a stub).

## See Also

- [[Tech/Architecture]] — high-level system view
- [[Tech/Agent System]] — multi-agent coordination
- [[Tech/MCP Servers]] — MCP catalog
- [[Database/]] — the database layer
- `TECH_STACK.md` — versioned reference
