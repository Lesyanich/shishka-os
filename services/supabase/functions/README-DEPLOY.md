# Supabase Edge Functions — Deployment Guide

## Where the functions live

Sources are here, in `services/supabase/functions/`. The Supabase CLI insists on
finding them at `./supabase/functions/<name>` relative to the working directory,
so `supabase/functions` is a **relative symlink** pointing back here. Deploy from
the repo root and the documented commands below just work.

Until 2026-07-28 that symlink pointed at a Google Drive path that no longer
exists, so `supabase functions deploy` failed with
`no such file or directory: supabase/functions/<name>/index.ts` for every
function in this directory. If you see that error again, check the symlink first.

## Prerequisites

- `OPENAI_API_KEY` must be set in Supabase Secrets:
  ```bash
  supabase secrets set OPENAI_API_KEY=sk-proj-YOUR_KEY_HERE
  ```

## Inbound auth on service-role functions

`loyverse-sync` runs with the service-role key and is deployed `--no-verify-jwt`.
It enforces auth **in the handler** — it requires an authenticated Supabase user
(`auth.getUser()` on the caller's JWT). Do **not** flip `verify_jwt:true` on a
browser-called function: the anon key is itself a valid JWT and would sail past
the gateway, and `verify_jwt:true` also rejects the CORS preflight, so the
browser gets a 401 with no logs.

`ocr-receipt` and `receipt-batch-process` are deployed with `verify_jwt:true` —
they are called with a real user session from the admin panel.

## Deploy

Run from `services/` — the CLI resolves `supabase/functions/` relative to the
working directory, and the repo nests that under `services/`:

```bash
cd services
supabase functions deploy ocr-receipt --project-ref qcqgtcsjoacuktcewpvo
```

⚠ **Check for drift before deploying.** A live function can be ahead of this
repo (this has bitten us on `loyverse-sync`). Pull the deployed source with the
Supabase MCP `get_edge_function` and diff it against the repo copy first —
never blind-deploy a repo copy over a live function you have not compared.

## Receipt images: how functions read them

`_shared/gcv.ts` → `downloadImageAsBase64(ref)` takes a stored receipt
reference in **any** shape — full public URL, signed URL, or bare in-bucket
path — and downloads the bytes with the **service-role** client, which bypasses
RLS and does not care whether the `receipts` bucket is public.

It used to be a bare `fetch(url)` with no credentials, which worked only
because the bucket was public. Do not regress it back: the bucket is on its way
to `public=false` (T3, MC `69395970`), and a plain `fetch()` cannot resolve a
bare path at all.

The vision/LLM APIs are always handed **inline base64**, never a URL — so no
external service ever needs to reach our storage. Keep it that way; a URL
passed to an outside fetcher is what blocked this migration for months (see the
retired GAS parser below).

## Test with curl

`ocr-receipt` takes `inbox_id` as a **query parameter** (zero-body-read design):

```bash
curl -X POST \
  'https://qcqgtcsjoacuktcewpvo.supabase.co/functions/v1/ocr-receipt?inbox_id=YOUR_INBOX_ID' \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```

Expected: `{"ok":true,"pipeline":"gcv+llm","items_parsed":N,"ocr_chars":N,...}`.

---

## Deploy Log

| Date | Function | Action | Notes |
|------|----------|--------|-------|
| 2026-04-12 | `receipt-batch-process` | Initial deploy | New function from commit 42e6187. `--no-verify-jwt` |
| 2026-04-12 | `ocr-receipt` | Redeploy | Refactored to use `_shared/` imports (commit 42e6187). `--no-verify-jwt` |
| 2026-06-30 | `loyverse-sync`, `parse-receipts` | Deployed ✓ | In-handler JWT auth guard (F1). `--no-verify-jwt`. Verified: anon→401, logged-in user→pass. |
| 2026-06-30 | `update-receipt-job` | Deployed ✓ | `x-internal-secret` guard (F1). `FUNCTION_INTERNAL_SECRET` set in Supabase + GAS Script Properties. Verified: no/wrong secret→401, correct→pass. |
| 2026-07-15 | `parse-receipts`, `update-receipt-job` | **DELETED** ✓ | Dead since 2026-04-06 (own DEPRECATED.md: "Replaced by Finance Agent"); `receipt_jobs` had 0 rows since 2026-03-31; only caller `MagicDropzone` hung off the unrouted `FinanceManager`. Undeployed + source removed (T3 step 2, MC 69395970, PR #513). They were also the last consumer handing raw receipt URLs to an external anonymous fetcher (GAS) — the blocker to making the bucket private. |
| 2026-07-15 | `ocr-receipt` (v54), `receipt-batch-process` (v18) | Redeploy ✓ | `_shared/gcv.ts`: `downloadImageAsBase64` now resolves a stored ref to an in-bucket path and downloads via service-role, instead of an uncredentialed `fetch(url)`. Backward compatible — the 318 existing full URLs resolve as before. Verified end-to-end on prod against a temp inbox row: `ok:true`, gcv+llm, 2571 ocr_chars, 9 items; temp row deleted after. Drift-checked against repo before deploying: byte-identical, no drift. (T3 step 3, MC 69395970) |
| 2026-07-18 | `receipt-batch-process` (v18→v19) | Deployed ✓ | `groupImages()` Step 1.5: fold continuation-only groups into the same-supplier/same-day head-sheet group, so OCR-mangled receipt numbers stop splitting one multi-sheet Makro chit into phantom-duplicate inbox rows. Continuation detected from OCR marker `ต่อจากแผ่นที่`, not fuzzy number match (Makro numbers a same-day run sequentially). `verify_jwt:true` preserved (CLI default, no config.toml). Drift-checked before deploy: all 7 `_shared` files byte-identical live-v18↔repo, only `index.ts` changed (+80). Verified after: live is v19, ACTIVE, `verify_jwt:true`, deployed `index.ts` byte-identical to repo. Deployed from branch `fix/receipts/multisheet-chit-phantom-duplicate` **ahead of the PR #522 merge** — merge that PR so `main` matches prod. (MC ea2a7a5d) |

### `FUNCTION_INTERNAL_SECRET` — now unused

Its only consumer was `update-receipt-job`, deleted 2026-07-15. The secret can
be dropped from Supabase Secrets whenever convenient; left in place for now
because removing it is not free of risk if some forgotten caller exists.
