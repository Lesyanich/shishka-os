# LightRAG Service (Phase 2 — GCP VM)

Graph + vector hybrid RAG over Shishka knowledge (`docs/bible/`, `docs/domain/`) via [LightRAG](https://github.com/HKUDS/LightRAG).

> **Status:** Phase 2 — deployed to GCP VM (`shishka-production`), OpenAI providers.
> **MC task:** `350a6738-152a-4d20-9c76-eb3d5431de89`
> **Spec:** `docs/plans/spec-lightrag.md`

## Stack

| Layer | Choice | Why |
|---|---|---|
| Extraction LLM | `gpt-4o-mini` via OpenAI | Fast, cheap, native LightRAG support |
| Embedding | `text-embedding-3-small` via OpenAI (1536-dim) | High quality, single-provider simplicity |
| Vector + KV store | Supabase Postgres + pgvector | Existing infra, tables `public.LIGHTRAG_*` |
| Graph store | NetworkX file | Mounted Docker volume |
| Server | `lightrag-server` (FastAPI) on `:9621` | Docker on GCP VM |
| Cost tracking | `brain_query_log` table + `/admin/brain/cost` | Per-query cost + latency dashboard |

## Run (GCP VM)

```bash
# On the VM (secrets fetched from GCP Secret Manager automatically)
cd ~/lightrag && ./start.sh -d
```

Health check: `curl http://localhost:9621/health`

See `deploy.md` for full deployment runbook.

## Run (local dev)

```bash
export OPENAI_API_KEY=$(security find-generic-password -a "$USER" -s "shishka-openAI-api-key" -w)
export DATABASE_URL=$(security find-generic-password -a "$USER" -s "shishka-database-url" -w)
./run-server.sh
```

## Storage layout

LightRAG creates `public.LIGHTRAG_*` tables on first boot. All rows carry a `workspace` column — using `workspace='lightrag'` for the shared bible+domain index.

> **Schema note:** `lightrag-hku` v1.4.13 hardcodes `public` schema. Drop-safe boundary preserved via `LIGHTRAG_` table prefix + `workspace` column. See migration `099_lightrag_pgvector.sql`.

## Secrets

All secrets live in **GCP Secret Manager** (project `shishka-automation-hubs`). See `SECRETS.md` for details.

## Files

- `run-server.sh` — server launcher (reads secrets from env vars)
- `start.sh` — fetches secrets from GCP Secret Manager, starts docker-compose
- `Dockerfile` — Python 3.11-slim + lightrag-hku[api]==1.4.13
- `docker-compose.yml` — single service, volume mount, health check
- `deploy.md` — GCP deployment runbook
- `SECRETS.md` — secret inventory and rotation guide
- `supabase-ca.pem` — Supabase pooler SSL cert
- `rag_storage/` — runtime working dir (gitignored)
