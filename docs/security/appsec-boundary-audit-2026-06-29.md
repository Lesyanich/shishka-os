# AppSec Review — Admin-Panel Auth + `/api` Boundary (Phase 3.2)

> Epic: Code Cleanup & Security Hardening (`2a8b06a4`) · Phase 3.2 (`abe792de`)
> Scope: the admin-panel auth model and the Vercel serverless `/api` boundary (the only
> server-side code in this app that can hold the **service-role** key).

## Verdict: the `/api` boundary is **well-secured**. One role-gating gap (→ Phase 3.4).

## Auth model (admin-panel)

- Client built with the **anon key** as the API key + Supabase Auth `persistSession: true`
  (`src/lib/supabase.ts`). Login = `signInWithPassword` (`src/lib/staffAuth.ts`,
  `contexts/AuthContext.tsx`). **After login, every PostgREST request carries the user JWT → runs as
  `authenticated`**, so `fn_is_authenticated()` passes. The anon key alone (logged-out) only gets
  anon-role access — which is what the RLS work (Phase 3.1/4) governs.

## `/api` serverless boundary — 4 exposed routes

`_`-prefixed files are not routes (Vercel convention). Service-role/user-client split lives in
`api/_lib/supabase.ts`:
- `supabaseForUser(jwt)` — anon key + `Authorization: Bearer <jwt>` → **RLS applies as that user**.
- `supabaseService()` — **service-role, bypasses RLS**. Doc'd "use only after auth + role checks."
- `getAuthedUser(req)` — verifies Bearer JWT via `supa.auth.getUser`, looks up `staff.app_role`.

| Route | Auth | Client | Notes |
|---|---|---|---|
| `chef/chat.ts` | **401** if no/invalid Bearer JWT (`verifyJwt`) | `supabaseForUser(jwt)` for read+write tools | Tools run under the **user's RLS**, not service-role. Confirm-before-write pattern. |
| `chef/health.ts` | none | — | Returns booleans for env-var *presence* only. Minor info exposure (which keys are configured). |
| `vault/page.ts` | **401** + **403 unless `role==='owner'`** | GitHub read | owner-gated |
| `vault/save.ts` | **401** + **403 unless `app_role==='owner'`** | GitHub write (Octokit) | owner-gated |

### Service-role usage — contained

`supabaseService()` is **called in exactly one place**: `_lib/apiCostLog.ts` (writes `api_cost_log`),
invoked server-side from `chat.ts` `onFinish`. It is **never reachable on an unauthenticated route**
and never returns raw service-role results to the client. ✅ No RLS-bypass surface is exposed.

## Findings

### F1 (LOW) — `chef/health.ts` is unauthenticated and reveals configured env keys
Returns `{ SUPABASE_SERVICE_ROLE_KEY: true, ... }` booleans. Doesn't leak values, but confirms which
secrets exist to any caller. **Fix:** require a JWT (or drop the env-presence fields). Cheap, do in Phase 2.

### F2 (MEDIUM) — chef write tools require only `authenticated`, not `owner`
`create_dish`, `update_dish_price`, `add/update/remove_bom_*` (`chef/_writeTools.ts`) run under
`supabaseForUser(jwt)`, so they're bound by **table RLS** — which today is `fn_is_authenticated()`
(any logged-in user), **not** owner. So a **cook could change dish prices / BOM** via the chef agent.
This is the **same gap** as direct `.update()` on `nomenclature.price`. **→ Phase 3.4**: price /
amount / quantity edits belong behind an **owner-gated RPC + audit log** (`fn_is_owner()` exists).
The vault routes already model the right pattern (`role !== 'owner' → 403`).

### F3 (INFO) — permissive CORS on `chef/chat.ts` (`Access-Control-Allow-Origin: *`)
Acceptable because the route is JWT-gated (origin is not the trust boundary), but worth tightening to
the known admin origin if convenient.

## Cross-validation for migration 326 (Phase 3.1)

The deferred read-gating in mig 326 targets `modifier_option_cost`, `modifier_option_overrides`,
`modifier_sync_state`. Grep of `apps/admin-panel/src` + `apps/kds/src` shows these are read **only by
authenticated admin-panel hooks** (`useModifierOptions`, `useModifierOptionEditing`, `useModifierSync`,
`useDishModifierGroups`) — **no anon / public / TWA reader in this repo**. The public site
(separate `shishka-health` repo) reads the menu via the `menu_public` SECURITY DEFINER view, which
bypasses RLS. **Conclusion: gating these cost tables behind `fn_is_authenticated()` is SAFE** and can
be added to the Phase 4 apply. (Re-confirm no anon read in the visitor-site repo before applying.)

## Hand-off

- **Phase 3.4 (`b91be681`)**: F2 — owner-gated RPC for price/amount/quantity (+ chef write tools call it).
- **Phase 2 (code fix)**: F1 — gate `chef/health.ts`; F3 — tighten CORS (both small).
- **Phase 4.2**: cost-table read-gating confirmed safe → fold into the apply.
