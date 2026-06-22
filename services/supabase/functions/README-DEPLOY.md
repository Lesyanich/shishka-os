# Supabase Edge Functions — Deployment Guide

## Prerequisites

- `OPENAI_API_KEY` must be set in Supabase Secrets:
  ```bash
  supabase secrets set OPENAI_API_KEY=sk-proj-YOUR_KEY_HERE
  ```

## Deploy: parse-receipts

### Option A: Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard/project/qcqgtcsjoacuktcewpvo/functions
2. Click **"Create a new function"**
3. Name: `parse-receipts`
4. Paste contents of `parse-receipts/index.ts`
5. Click **"Deploy"**
6. Verify JWT: **enabled** (default)

### Option B: Supabase CLI

```bash
# Install CLI if needed
npm install -g supabase

# Link to project
supabase link --project-ref qcqgtcsjoacuktcewpvo

# Deploy function
supabase functions deploy parse-receipts --project-ref qcqgtcsjoacuktcewpvo
```

## Test with curl

```bash
curl -X POST \
  'https://qcqgtcsjoacuktcewpvo.supabase.co/functions/v1/parse-receipts' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "image_urls": [
      "https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/receipts/supplier/test.jpg"
    ]
  }'
```

## Expected Response

```json
{
  "supplier_name": "Makro Food Service",
  "invoice_number": "INV-2026-0342",
  "total_amount": 4520.00,
  "currency": "THB",
  "transaction_date": "2026-03-10",
  "food_items": [...],
  "capex_items": [...],
  "opex_items": [...]
}
```

---

## Deploy: ocr-receipt + receipt-batch-process (JWT-protected)

These two functions are called **only** from the admin panel
(`apps/admin-panel/src/hooks/useReceiptInbox.ts`) via
`supabase.functions.invoke(...)`, which automatically attaches the logged-in
owner's JWT. They MUST be deployed with JWT verification **enabled** so the
Supabase gateway rejects unauthenticated requests.

> **Do NOT pass `--no-verify-jwt`.** Omitting the flag = gateway validates the
> JWT (the secure default). The flag was a leftover from April 2026 curl-testing
> and let any/garbage Bearer through (MC `1d067c3d`). There is no
> `config.toml`, so the deploy flag is the only control over `verify_jwt`.

```bash
supabase functions deploy ocr-receipt --project-ref qcqgtcsjoacuktcewpvo
supabase functions deploy receipt-batch-process --project-ref qcqgtcsjoacuktcewpvo
```

---

## Deploy Runbook — re-enable JWT on receipt functions (CEO-gated)

This is the exact, gated sequence for the operator. **The deploy is the
CEO-approved step — it is NOT performed by the PR.** Functions do not
auto-deploy on merge; they must be deployed manually with the CLI/MCP.

**Pre-checks**
- Confirm repo == prod before deploying (no drift): the live source for both
  functions matched the repo at PR time. If unsure, `supabase functions
  download ocr-receipt` / `receipt-batch-process` and diff against the repo.
- Confirm only the admin panel calls these functions (it sends the owner JWT).

**Step 1 — Deploy with JWT verification enabled (omit `--no-verify-jwt`)**
```bash
supabase functions deploy ocr-receipt --project-ref qcqgtcsjoacuktcewpvo
supabase functions deploy receipt-batch-process --project-ref qcqgtcsjoacuktcewpvo
```

**Step 2 — Positive smoke test (admin flow must still work)**
- Open the admin panel → **Receipt Inbox**.
- Upload a test receipt and click **"Upload & parse"** → it must still parse
  (the logged-in JWT is auto-attached). Also exercise the batch path
  ("Upload & parse" on multiple images) → groups must come back.

**Step 3 — Negative test (unauthenticated request must now be rejected)**
```bash
# Bogus Bearer → expect HTTP 401 (was 200 before this change)
curl -i -X POST \
  'https://qcqgtcsjoacuktcewpvo.supabase.co/functions/v1/ocr-receipt?inbox_id=test&model=gemini-flash' \
  -H 'Authorization: Bearer not-a-real-token'

curl -i -X POST \
  'https://qcqgtcsjoacuktcewpvo.supabase.co/functions/v1/receipt-batch-process' \
  -H 'Authorization: Bearer not-a-real-token' \
  -H 'Content-Type: application/json' -d '{}'
```
Expected: `HTTP/2 401` for both. (Before the fix these returned 200.)

**Step 4 — Instant rollback (if the admin flow breaks)**
```bash
supabase functions deploy ocr-receipt --no-verify-jwt --project-ref qcqgtcsjoacuktcewpvo
supabase functions deploy receipt-batch-process --no-verify-jwt --project-ref qcqgtcsjoacuktcewpvo
```
Then reopen MC `1d067c3d`. Rollback is immediate and fully reversible.

**Step 5 — After a successful deploy**
- Update the Deploy Log rows above (change "PENDING CEO" → the deploy date).
- Close MC `1d067c3d` per `RULE-TASK-CLOSURE`.

---

## Deploy Log

| Date | Function | Action | Notes |
|------|----------|--------|-------|
| 2026-04-12 | `receipt-batch-process` | Initial deploy | New function from commit 42e6187. `--no-verify-jwt` |
| 2026-04-12 | `ocr-receipt` | Redeploy | Refactored to use `_shared/` imports (commit 42e6187). `--no-verify-jwt` |
| 2026-06-22 | `ocr-receipt` | Redeploy (PENDING CEO) | Re-enable JWT — deploy WITHOUT `--no-verify-jwt`. Security fix for MC `1d067c3d`. Only caller is the admin panel via `functions.invoke` (auto-sends owner JWT). **Not yet deployed — gated CEO step (see Deploy Runbook below).** |
| 2026-06-22 | `receipt-batch-process` | Redeploy (PENDING CEO) | Re-enable JWT — deploy WITHOUT `--no-verify-jwt`. Security fix for MC `1d067c3d`. Same admin-only caller. **Not yet deployed — gated CEO step (see Deploy Runbook below).** |
