# Service-Role Isolation Audit — Edge Functions + `/api` (Phase 3.3)

> Epic: Code Cleanup & Security Hardening (`2a8b06a4`) · Phase 3.3 (`c081de36`)
> Scope: every place that holds the **`SUPABASE_SERVICE_ROLE_KEY`** (bypasses RLS) and whether each
> is reachable without authentication. `/api` was covered in Phase 3.2 — summarized here for completeness.

## Method

19 active edge functions enumerated via `list_edge_functions`. The platform `verify_jwt` flag tells
us which are **publicly callable** (`false` = no platform JWT gate → reachable by anyone with the
public anon `apikey`). For each `verify_jwt:false` function that uses service-role, we checked for a
**self-managed guard** (shared secret / HMAC) at the handler entry.

## Edge functions — `verify_jwt:false` (publicly callable)

| Function | service-role | Self-guard | Verdict |
|---|---|---|---|
| `telegram-webhook` | no | ✅ `x-telegram-bot-api-secret-token === TELEGRAM_WEBHOOK_SECRET` (else ignore) | OK |
| `telegram-ai` | **yes** | ✅ same secret-token check → 401 | OK |
| `loyverse-receipt` | no | ✅ HMAC-SHA256 `loyverse-signature` (`LOYVERSE_WEBHOOK_SECRET`) | OK |
| **`loyverse-sync`** | **yes** | ❌ only `OPTIONS`/`POST` checks — **no inbound auth** | **GAP (F1)** |
| **`parse-receipts`** | **yes** | ❌ only method/CORS — **no inbound auth** | **GAP (F1)** |
| **`update-receipt-job`** | **yes** | ❌ only method/CORS — **no inbound auth** | **GAP (F1)** |
| `import-menu-photos` | ? | source **not in repo** | **F2 (drift)** |
| `menu-photo-sync` | ? | source **not in repo** | **F2 (drift)** |
| `landing-photo-sync` | ? | source **not in repo** | **F2 (drift)** |
| `bundle-pos-setup` | ? | source **not in repo** | **F2 (drift)** |

`verify_jwt:true` functions (platform enforces a valid JWT before the function runs): `ocr-receipt`,
`receipt-batch-process`, `pack-info-resolve`, `create-order`, `import-product-photos`,
`apply-menu-photo`, `telegram-push`, `loyverse-pull`. These are gated by the platform — OK.

> The service-role client is `_shared/supabase.ts → db = createClient(url, SERVICE_ROLE_KEY)`.
> Any function importing `db` bypasses RLS, so the function's **own entry guard is the only gate**.

## Findings

### F1 (MEDIUM–HIGH) — 3 public service-role functions with no inbound auth

`loyverse-sync`, `parse-receipts`, `update-receipt-job` are `verify_jwt:false`, use the service-role
`db`, and apply **no** secret/JWT check — only `req.method` validation. Anyone with the **public anon
apikey** (it ships in the browser bundle) can invoke them:

- **`parse-receipts`** — highest concern: triggers LLM calls (Anthropic/OpenAI/Google) → **cost-abuse /
  quota-drain** vector, and can create receipt-job rows.
- **`loyverse-sync`** — can trigger menu push/pull to Loyverse (data overwrite + Loyverse rate-limit burn).
- **`update-receipt-job`** — can mutate receipt-job state via service-role (RLS bypass).

**Fix (Phase 2 / 4):** add the same shared-secret guard the webhooks already use — a
`x-internal-secret` header checked against a `FUNCTION_INTERNAL_SECRET` env, **or** flip
`verify_jwt:true` and have callers (admin panel / cron) pass a JWT. Prefer the secret header for
cron/system callers. Low effort, high value; mirrors `telegram-ai`.

### F2 (PROCESS) — 4 edge functions have no source in the repo

`import-menu-photos`, `menu-photo-sync`, `landing-photo-sync`, `bundle-pos-setup` are deployed
(`status: ACTIVE`) but have **no `index.ts` in `services/supabase/functions/`**. This is the known
**edge-function drift** problem (live ahead of repo). Three are `verify_jwt:false`, so their guard
**cannot be audited locally**. **Action:** pull each via `get_edge_function`, commit the source, then
re-audit the guard. Until then, treat their auth posture as **unknown**.

## `/api` (from Phase 3.2) — recap

`/api` service-role (`supabaseService()`) is called **only** in `_lib/apiCostLog.ts`, server-internal,
never on an unauthenticated route. All 4 routes JWT-gated; vault routes owner-gated. ✅ Contained.

## Hand-off

- **Phase 2 / 4**: F1 — add `x-internal-secret` guard (or `verify_jwt:true`) to `loyverse-sync`,
  `parse-receipts`, `update-receipt-job`. Coordinate with the `loyverse-sync` drift (live fn ahead of repo).
- **Phase 6 / ops**: F2 — commit the 4 missing edge-function sources; add a CI check that every
  deployed function has committed source (anti-drift).
