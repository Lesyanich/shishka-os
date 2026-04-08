# LightRAG Secrets

`DATABASE_URL` lives in `./db-url.local` (gitignored). It is **not** committed, and **not** in `apps/admin-panel/.env` (which holds only public-by-design VITE_* keys).

## How to populate

Open Supabase Dashboard → Project Settings → Database → either:

- **Direct connection** (recommended for LightRAG): `db.<project>.supabase.co:5432` with user `postgres`. Cleanest fit for asyncpg.
- **Connection pooling → Session mode** (`:5432`, **not** `:6543`). Transaction pooler `:6543` breaks asyncpg prepared statements used by `lightrag-hku`.

Edit `services/lightrag/db-url.local` from a host terminal (not Claude Code):

```
DATABASE_URL=postgresql://postgres:<PASSWORD>@db.<project>.supabase.co:5432/postgres
```

`run-server.sh` reads this file at boot, parses the URL into `POSTGRES_*` env vars, and exports them to the `lightrag-server` subprocess. The secret never crosses the LLM context.

## Why per-service file (not a shared store)

Private single-user repo. One consumer (LightRAG). Per-service gitignored file is the simplest acceptable shape until either (a) a second consumer appears, or (b) the team grows beyond the CEO. At that point, switch to a host-keychain or secret-manager and update `docs/keys-config.md` §Secret Location Policy.

See: `docs/keys-config.md` §Secret Location Policy.
