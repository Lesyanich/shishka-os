# Supabase Edge Functions — Deployment Guide

## Prerequisites

- `OPENAI_API_KEY` must be set in Supabase Secrets:
  ```bash
  supabase secrets set OPENAI_API_KEY=sk-proj-YOUR_KEY_HERE
  ```

- `FUNCTION_INTERNAL_SECRET` must be set for the server-to-server functions
  (`update-receipt-job`). Set the **same** value in the GAS ReceiptParser
  Script Properties. See
  [`docs/security/service-role-isolation-audit-2026-06-29.md`](../../../docs/security/service-role-isolation-audit-2026-06-29.md) (F1).
  ```bash
  supabase secrets set FUNCTION_INTERNAL_SECRET="$(openssl rand -hex 32)"
  ```

## Inbound auth on service-role functions

`loyverse-sync`, `parse-receipts`, `update-receipt-job` run with the service-role
key and are deployed `--no-verify-jwt`. They enforce auth **in the handler**:
- `loyverse-sync`, `parse-receipts` — require an authenticated Supabase user
  (`auth.getUser()` on the caller's JWT). Do **not** flip `verify_jwt:true` — the
  anon key is a valid JWT and would pass the gateway.
- `update-receipt-job` — requires the `x-internal-secret` header (server-to-server).

## Deploy: parse-receipts

### Option A: Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard/project/qcqgtcsjoacuktcewpvo/functions
2. Click **"Create a new function"**
3. Name: `parse-receipts`
4. Paste contents of `parse-receipts/index.ts`
5. Click **"Deploy"**
6. Verify JWT: **disabled** (`--no-verify-jwt`) — auth is enforced in-handler (requires an authenticated user's JWT)

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

> `parse-receipts` now requires an **authenticated user's** JWT — the anon key
> alone returns `401`. Use a real session `access_token` (grab one from the
> admin panel devtools), and pass `job_id` in the URL (zero-body-read design).

```bash
# anon key alone → 401 (hole closed)
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  'https://qcqgtcsjoacuktcewpvo.supabase.co/functions/v1/parse-receipts?job_id=test' \
  -H 'Authorization: Bearer YOUR_ANON_KEY'

# real user session token → routed (200 / 404 'job not found')
curl -X POST \
  'https://qcqgtcsjoacuktcewpvo.supabase.co/functions/v1/parse-receipts?job_id=YOUR_JOB_ID' \
  -H 'Authorization: Bearer YOUR_USER_ACCESS_TOKEN'
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

## Deploy Log

| Date | Function | Action | Notes |
|------|----------|--------|-------|
| 2026-04-12 | `receipt-batch-process` | Initial deploy | New function from commit 42e6187. `--no-verify-jwt` |
| 2026-04-12 | `ocr-receipt` | Redeploy | Refactored to use `_shared/` imports (commit 42e6187). `--no-verify-jwt` |
| 2026-06-30 | `loyverse-sync`, `parse-receipts` | Deployed ✓ | In-handler JWT auth guard (F1). `--no-verify-jwt`. Verified: anon→401, logged-in user→pass. |
| 2026-06-30 | `update-receipt-job` | Deployed ✓ | `x-internal-secret` guard (F1). `FUNCTION_INTERNAL_SECRET` set in Supabase + GAS Script Properties. Verified: no/wrong secret→401, correct→pass. |
