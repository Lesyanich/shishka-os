# Phase 5.0f: The Gemini Pivot — GAS + Gemini 2.5 Flash

**Date:** 2026-03-12
**Status:** COMPLETED

## Why

Replaced entire OpenAI + Google Cloud Vision pipeline with Google Apps Script (GAS) + Gemini 2.5 Flash:
1. OpenAI API costs and edge function timeout issues
2. GCV + gpt-4o-mini two-stage pipeline was fragile
3. Gemini 2.5 Flash does vision + structuring in a single API call
4. GAS provides free compute with 6-minute timeout (vs Supabase 150s limit)

## Architecture (Final)

```
Frontend → Supabase Edge Function (parse-receipts, proxy)
         → Google Apps Script (GAS) → Gemini 2.5 Flash (vision + JSON)
         → Edge Function callback (update-receipt-job) → DB
         → Supabase Realtime → Frontend
```

**Key innovation**: GAS writes ALL results to DB via `update-receipt-job` Edge Function callback (not raw PostgREST). Solves RLS bypass issue with `sb_publishable_` key format.

## Edge Functions

### `parse-receipts` (proxy)
- Zero-body architecture: reads `job_id` from URL query param
- Sends `supabase_url` to GAS (NOT supabase_key)
- GAS constructs callback URL from it

### `update-receipt-job` (callback)
- Deployed with `--no-verify-jwt` (GAS has no JWT)
- Uses service role key for RLS bypass
- GET: returns job status for debugging
- POST: updates job fields

## GAS: ReceiptParser.gs

- **Model**: `gemini-2.5-flash`
- **Thinking disabled**: `thinkingConfig: { thinkingBudget: 0 }`
- **Token limit**: `maxOutputTokens: 65536`
- **Phone Home architecture**: Every step writes progress to `receipt_jobs.error` via callback
- **6 isolated steps**: STEP_0 (parse payload) → STEP_1 (auth test) → STEP_2 (fetch images) → STEP_3 (save to Drive) → STEP_4 (Gemini call) → STEP_5 (postprocess) → STEP_6 (final write)

## Performance

| Metric | Before (GCV + gpt-4o-mini) | After (GAS + Gemini 2.5 Flash) |
|---|---|---|
| Total time | ~10-20s | ~30s |
| Cost/receipt | ~$0.0035 | Free (Gemini free tier) |
| Timeout risk | Medium | None (GAS 6-min limit) |
| Items parsed | 27 (Makro) | 27 (identical accuracy) |

## Deploy
- Edge Functions: Supabase CLI deploy
- GAS: `cd 03_Development/gas && npm run deploy`

## Files
| File | Action |
|---|---|
| `supabase/functions/parse-receipts/index.ts` | EDIT |
| `supabase/functions/update-receipt-job/index.ts` | NEW |
| `gas/ReceiptParser.gs` | REWRITE |
| `gas/.clasp.json` | NEW |
| `gas/appsscript.json` | NEW |
| `gas/package.json` | NEW |
