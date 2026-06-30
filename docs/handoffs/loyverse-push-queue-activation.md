# Activation runbook — Loyverse push queue (browser-free agent push)

**Branch:** `feature/menu/loyverse-push-queue`
**What it does:** lets Claude (or the admin panel) push menu changes to Loyverse POS by
enqueuing a row in `loyverse_push_queue`; a pg_cron job drains the queue and calls the
`loyverse-sync` edge function server-side, reading a shared secret from `supabase_vault`.
**The raw `LOYVERSE_API_TOKEN` is never given back to the agent** — it stays in the edge
function's secrets. See `docs/handoffs/` plan `security-check-groovy-wave`.

This is a **one-time, CEO-assisted setup**. After it, dish/price/name pushes are fully
autonomous (the agent just runs an INSERT). Modifiers stay gated behind a separate reconcile.

## Order matters — deploy & secrets BEFORE the migration
If the cron job is scheduled before the function is deployed and the secret is set, the
drain will fire and every row will land in `error` (401). Do steps 1–3 first, then 4.

### 1. Set the edge-function secret (manual — dashboard or CLI)
Pick a strong random value once; reuse it in step 3.
```bash
# from repo root, with the project linked
supabase secrets set LOYVERSE_INTERNAL_SECRET='<RANDOM_32+_CHARS>'
```
(Or Supabase dashboard → Edge Functions → loyverse-sync → Secrets.)

### 2. Deploy the edge function (CEO-only)
The repo copy was confirmed byte-identical to live v33, so this only adds the new
`internal_push` path + `isInternalCall` guard; the browser JWT path is unchanged.
```bash
supabase functions deploy loyverse-sync
```

### 3. Create the Vault secrets (SQL — MCP execute_sql or psql)
```sql
SELECT vault.create_secret(
  'https://qcqgtcsjoacuktcewpvo.supabase.co/functions/v1/loyverse-sync',
  'loyverse_push_url');
SELECT vault.create_secret('<SAME_VALUE_AS_STEP_1>', 'loyverse_internal_secret');
```

### 4. Apply the migration
```
migration 334_loyverse_push_queue.sql   (MCP apply_migration or supabase db push)
```
Creates `loyverse_push_queue`, the `loyverse-push-drain` cron (every minute) and the
`loyverse-push-watchdog` cron (every 5 min).

## Smoke test (no secrets exposed)
There are currently **0 `approved` dishes** (791 draft / 84 synced) and `push_dish` only
pushes `pos_status IN ('approved','synced')`. Use an already-`synced` SALE dish (safe
round-trip) for the first test.
```sql
-- pick a synced dish
SELECT id, name, loyverse_item_id FROM nomenclature
WHERE product_code LIKE 'SALE-%' AND pos_status='synced' AND loyverse_item_id IS NOT NULL LIMIT 1;
-- enqueue
INSERT INTO loyverse_push_queue (action, target_id) VALUES ('dish', '<that-id>');
-- watch (expect pending → processing within ~60s → done, with result populated)
SELECT id, action, status, attempts, error_message, result, processed_at
FROM loyverse_push_queue ORDER BY requested_at DESC LIMIT 5;
-- cross-checks
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='loyverse-push-drain')
ORDER BY start_time DESC LIMIT 3;
SELECT * FROM loyverse_sync_log ORDER BY started_at DESC LIMIT 3;
```
Negative test: `POST .../loyverse-sync?action=internal_push` with no/ wrong `x-internal-secret`
and no JWT → `401`.

## How the agent uses it afterwards
```sql
-- push one dish
INSERT INTO loyverse_push_queue (action, target_id) VALUES ('dish', '<dish-uuid>');
-- reconcile all SALE prices DB→POS
INSERT INTO loyverse_push_queue (action) VALUES ('prices');
-- resync all names + staff-code prefixes
INSERT INTO loyverse_push_queue (action) VALUES ('names');
```
Then read the row back to confirm `status='done'`.

## Rollback
```sql
SELECT cron.unschedule('loyverse-push-drain');
SELECT cron.unschedule('loyverse-push-watchdog');
-- (table/type drop only if fully reverting — see the migration's -- DOWN block)
```
Unsetting `LOYVERSE_INTERNAL_SECRET` on the function instantly closes the server-to-server
path (`isInternalCall` fails closed when the secret is empty).

## Not yet enabled
- **Modifiers** (`action='modifiers'`) — the `internal_push` dispatch returns
  `unsupported queue action` for it. Enable only after the one-time modifier-mirror
  reconcile (the mirror has been stale since 2026-06-15; a blind global push/pull can
  corrupt POS attachments). See the plan's Phase 3.
- **Admin queue-status panel** (Phase 2) — optional follow-up so the owner can see what the
  agent enqueued and whether it succeeded.
