# LightRAG Service (Phase 1)

Local Python venv runner for [LightRAG](https://github.com/HKUDS/LightRAG) — graph + vector hybrid RAG over Shishka knowledge (`docs/bible/`, `docs/domain/`).

> **Status:** Phase 1 — local install, indexing bible/domain (~80KB).
> **MC task:** `996f1f86-58d8-4be5-a2e7-a59b9fa049d6`
> **Spec:** `docs/plans/spec-lightrag.md`

## Stack

| Layer | Choice | Why |
|---|---|---|
| Extraction LLM | `gemma4:e2b` via Ollama | Local, free, already pulled (9.6 GB) |
| Embedding | `bge-m3` via Ollama | Multilingual (RU/EN/AR), 1024-dim, free |
| Vector + KV store | Supabase Postgres + pgvector | Existing infra, schema `public.LIGHTRAG_*` |
| Graph store | NetworkX file | Phase 1 simplicity; Postgres graph in Phase 2+ |
| Server | `lightrag-server` (FastAPI) on `:9621` | Native REST API |

## Run

```bash
services/lightrag/run-server.sh
```

The wrapper sources `DATABASE_URL` from `apps/admin-panel/.env` (existing secret store, never duplicated), parses it into the `POSTGRES_*` env vars that `lightrag-hku` expects, then launches `lightrag-server` with Ollama bindings.

Health check: `curl http://127.0.0.1:9621/health`

## Storage layout

LightRAG creates `public.LIGHTRAG_*` tables on first boot (DOC_FULL, DOC_CHUNKS, VDB_ENTITY, VDB_RELATION, VDB_CHUNKS, LLM_CACHE, DOC_STATUS). All rows carry a `workspace` column — Phase 1 uses `workspace='lightrag'` for the shared bible+domain index.

> **Schema deviation:** the original Phase 1 plan called for a dedicated `lightrag` Postgres schema. `lightrag-hku` v1.4.13 hardcodes `public` (`postgres_impl.py:~1608`), so a separate schema is not feasible without forking. The drop-safe boundary is preserved via the `LIGHTRAG_` table prefix and the `workspace` column. See migration `099_lightrag_pgvector.sql`.

## Files

- `run-server.sh` — launcher (no secrets, sources existing .env at runtime)
- `rag_storage/` — runtime working dir (gitignored): graph file, logs
- `README.md` — this file
