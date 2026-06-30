# Service-Role Edge-Function Isolation Audit — 2026-06-29

**Epic:** `2a8b06a4` (Code Cleanup & Security) · **Branch:** `feature/security/service-role-fn-guards`
**Related:** [`rls-audit-report.md`](./rls-audit-report.md), gotcha `gotcha_rls_authenticated_not_role_gated`

> **STATUS — 2026-06-30: SHIPPED & VERIFIED.** All three functions deployed to prod with guards.
> `FUNCTION_INTERNAL_SECRET` set in Supabase secrets **and** GAS Script Properties; GAS `ReceiptParser`
> redeployed to send `x-internal-secret`. Live verification (curl): outsider/anon/no-secret → 401,
> legitimate caller → passes. PR #450 merged.
>
> **Follow-up finding (2026-06-30):** the live `/receipts` feature runs on the **Finance Agent →
> `receipt_inbox`** pipeline, NOT on `parse-receipts`→GAS→`update-receipt-job`→`receipt_jobs`
> (last `receipt_jobs` row: 2026-03-31; that pipeline is effectively retired). Guarding it was still
> correct (it was an open service-role door), but the cleanest end-state is to **undeploy
> `parse-receipts` + `update-receipt-job`** and retire the GAS `ReceiptParser`. `loyverse-sync`
> stays — actively used by the admin panel. Confirm with the finance owner before removing.

## Scope

Supabase Edge Functions deployed with `verify_jwt: false` **and** holding the
`SUPABASE_SERVICE_ROLE_KEY` (full RLS bypass). With `verify_jwt:false` the
gateway performs **no** auth, so the only thing standing between the public
internet and a service-role client is whatever the handler checks itself.
Anyone who reads the public anon `apikey` out of the browser bundle can invoke
such a function directly and act with service-role privilege.

---

## Finding F1 — three service-role functions with no inbound auth guard

| Function | `verify_jwt` | Privilege | Inbound guard (before) | Real callers |
|----------|:---:|---|---|---|
| `loyverse-sync` | false | service-role | **none** (OPTIONS/POST/`action` only) | 5 admin-panel browser hooks |
| `parse-receipts` | false | service-role | **none** | 1 admin-panel browser caller (`MagicDropzone`) |
| `update-receipt-job` | false | service-role | **none** | GAS `ReceiptParser` (server-to-server) |

**Impact:**
- `loyverse-sync` — anyone could push/delete POS items, rewrite prices, and mutate `nomenclature` / modifier state via Loyverse.
- `parse-receipts` — anyone could trigger the receipt → GAS → Gemini pipeline (cost-abuse / quota-drain). *(Note: the deployed function is the GAS **proxy**; it does not call the LLM directly — it fires GAS, which calls Gemini. The cost vector is real nonetheless.)*
- `update-receipt-job` — anyone could overwrite arbitrary `receipt_jobs` rows (status/result/error) via the service-role client. GAS was calling it with **no auth header at all**.

### Correction to the original remediation proposal

The original ticket proposed a **uniform shared-secret header** (`x-internal-secret`
vs `FUNCTION_INTERNAL_SECRET`) on all three, plus updating "admin panel + cron"
callers. Two problems surfaced during the audit:

1. **No cron caller exists** for any of these three (verified across migrations / `pg_net` / `pg_cron`). The only callers are the admin-panel browser and GAS.
2. **A shared secret is insecure for the two browser-called functions.** `loyverse-sync` and `parse-receipts` are invoked *from the browser*. Any secret the browser must send ships in the JS bundle — exactly as exposed as the anon `apikey` it is meant to defend against. It would rename the leak, not close it.
   - The ticket's fallback — flipping `verify_jwt:true` — is **also insufficient**: the anon key is itself a validly-signed JWT, so it passes the gateway's `verify_jwt` check. Distinguishing "real user" from "anon key" must happen *in the handler*.

### Fix applied (per-caller, not uniform)

Both browser functions already receive the **logged-in user's JWT**
(`loyverse-sync` hooks send `Authorization: Bearer <access_token>`;
`MagicDropzone` uses `supabase.functions.invoke`, which auto-attaches it). So:

- **`loyverse-sync`, `parse-receipts`** → in-handler **JWT guard**:
  ```ts
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/, "")
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return 401
  ```
  The bare anon key is a valid JWT but maps to **no user**, so `getUser()`
  rejects it. No secret in the bundle, ties access to a real auth session,
  and **requires zero caller changes** (callers already send the JWT).

- **`update-receipt-job`** → **shared-secret guard** (genuinely server-to-server,
  GAS only), mirroring `telegram-ai`'s `x-telegram-bot-api-secret-token` pattern:
  ```ts
  if (req.headers.get("x-internal-secret") !== Deno.env.get("FUNCTION_INTERNAL_SECRET")) return 401
  ```
  GAS `ReceiptParser.gs` (`updateJob_`, `phoneHome_`) updated to send the header
  from a Script Property.

Stale `// DEPRECATED — DO NOT DEPLOY` banners were also removed from
`parse-receipts` / `update-receipt-job`: both are live (v53 / v14) and actively
used, so the banners were misleading and blocked legitimate redeploys.

---

## Caller inventory (verified)

**loyverse-sync** — browser only, all send the user JWT:
- `apps/admin-panel/src/hooks/useLoyversePushDish.ts`
- `apps/admin-panel/src/hooks/useLoyverseIntegration.ts`
- `apps/admin-panel/src/hooks/useModifierSync.ts`
- `apps/admin-panel/src/hooks/useModifierListOps.ts`
- `apps/admin-panel/src/hooks/useLoyverseModifierPull.ts`

**parse-receipts** — browser only:
- `apps/admin-panel/src/components/finance/MagicDropzone.tsx` (`supabase.functions.invoke`)

**update-receipt-job** — server-to-server only:
- `services/gas/ReceiptParser.gs` (`updateJob_`, `phoneHome_`)

No `pg_cron` / `pg_net` / edge-function callers for any of the three.

---

## Drift check (live vs repo)

Pulled live source via `supabase functions download` and diffed:
- `loyverse-sync` v33 — **byte-identical** to repo (earlier "live ahead" drift since reconciled by merges).
- `parse-receipts` v53 / `update-receipt-job` v14 — identical to repo **except** the stale DEPRECATED banner (repo-only). Removed.

→ Editing the repo copies is safe; repo now equals `live + guard`.

---

## Deploy & secret runbook (CEO-gated — not auto-applied)

> Deploying edge functions and setting secrets is owner-only. The code is on the
> branch; these are the steps to ship it.

1. **Set the shared secret** (Supabase project secrets):
   ```bash
   # generate once, keep it out of git
   supabase secrets set FUNCTION_INTERNAL_SECRET="$(openssl rand -hex 32)" \
     --project-ref qcqgtcsjoacuktcewpvo
   ```
2. **Set the same value in GAS** → Apps Script project → Project Settings →
   Script Properties → add `FUNCTION_INTERNAL_SECRET` = *(same value)*.
3. **Deploy the three functions** (repo == live + guard, so the repo copy is
   safe to deploy now):
   ```bash
   supabase functions deploy loyverse-sync      --no-verify-jwt --project-ref qcqgtcsjoacuktcewpvo
   supabase functions deploy parse-receipts     --no-verify-jwt --project-ref qcqgtcsjoacuktcewpvo
   supabase functions deploy update-receipt-job --no-verify-jwt --project-ref qcqgtcsjoacuktcewpvo
   ```
   Keep `--no-verify-jwt`: the guard lives in the handler (browser functions
   need to inspect the JWT for a real user; `verify_jwt:true` would *also* let
   the anon key through).

   **Ordering:** set the secret (steps 1–2) **before** deploying
   `update-receipt-job`, or the GAS receipt callback will 401 until both sides
   have the value.

## Verification

After deploy:
```bash
URL=https://qcqgtcsjoacuktcewpvo.supabase.co/functions/v1

# 1. anon key alone → 401 (the hole is closed)
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL/loyverse-sync?action=status" \
  -H "Authorization: Bearer $ANON_KEY"            # expect 401

# 2. update-receipt-job without the secret → 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL/update-receipt-job?job_id=test"   # expect 401

# 3. with the secret → not 401 (200 / 400 'job not found' etc.)
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL/update-receipt-job?job_id=test" \
  -H "x-internal-secret: $FUNCTION_INTERNAL_SECRET"
```
In-app: open `/menu` and push a dish to Loyverse, and upload a receipt — both
should work unchanged (logged-in user → valid JWT).

## Residual risk / follow-ups
- **RBAC not enforced** — the JWT guard is "any authenticated user", not
  "owner/staff". Tightening to a role claim is a follow-up (see
  `gotcha_rls_authenticated_not_role_gated`).
- **Receipt pipeline lifecycle** — `parse-receipts` / `update-receipt-job`
  carried a (stale) "replaced by Finance Agent" note. If the GAS receipt
  pipeline is truly retired, the strongest fix is to **undeploy** both and drop
  the attack surface entirely. Confirm with the finance agent owner before
  removing.
