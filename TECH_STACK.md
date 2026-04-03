# Shishka OS — Tech Stack

## Frontend

| Tool | Version | Notes |
|------|---------|-------|
| React | 19 | SPA with React Router v7 |
| Vite | 7 | Build tool, dev server |
| TailwindCSS | v4 | Utility-first CSS |
| Recharts | — | Data visualization |
| Sentry | — | Error monitoring |
| Deployment | Vercel | Root: `apps/admin-panel/` |

## Backend

| Tool | Version | Notes |
|------|---------|-------|
| Supabase | — | PostgreSQL 17.6, Auth, Storage, Edge Functions |
| Region | ap-south-1 | Project: qcqgtcsjoacuktcewpvo |
| RLS | Enabled | Row-Level Security on all tables |
| Migrations | `services/supabase/migrations/` | Sequential SQL files |

## AI / Agents

| Tool | Notes |
|------|-------|
| MCP (Model Context Protocol) | Agent-to-system communication |
| Claude Code | Primary development AI |
| Gemini Vision | Receipt OCR (via GAS) |
| Knowledge Base | 221 culinary reference files |

## External Systems

| System | Role |
|--------|------|
| SYRVE | POS System of Record (inventory, BOM, sales) |
| Google Apps Script | Receipt parsing bridge |
| Google Drive | Shared Drive (project lives here) |
| Makro | Wholesale supplier (catalog parser) |

## Monorepo Layout

No workspace manager (no Turborepo/Nx). Each `apps/` and `services/` directory has its own `package.json` and runs independently.
