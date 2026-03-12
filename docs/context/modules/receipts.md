# Receipt Parsing Module Context

## Architecture

```
Frontend (MagicDropzone)
  → Upload images to Supabase Storage (WebP compressed)
  → INSERT receipt_jobs (status: pending)
  → invoke('parse-receipts', {job_id}) [fire-and-forget]

Edge Function (parse-receipts)
  → Forward to GAS Web App URL

GAS (ReceiptParser.gs)
  → Gemini 2.5 Flash (vision + JSON structuring)
  → Phone Home: writes progress to receipt_jobs.error via callback
  → Final write: updates receipt_jobs.result + status via callback

Edge Function (update-receipt-job)
  → Callback endpoint for GAS
  → Service role key for RLS bypass

Frontend (FinanceManager)
  ← Supabase Realtime subscription (receipt_jobs, filter: id=eq.{job_id})
  → On completed: mapping pipeline → StagingArea
```

## Tables
- `receipt_jobs` (id UUID) — status, image_urls JSONB, result JSONB, error TEXT, ocr_text TEXT, duration_ms, model

## Edge Functions
- `parse-receipts` — Zero-body proxy. Reads job_id from URL query. Sends supabase_url to GAS.
- `update-receipt-job` — `--no-verify-jwt`. GET: job status. POST: update fields.

## GAS (ReceiptParser.gs)
- Model: `gemini-2.5-flash` (thinkingBudget: 0, maxOutputTokens: 65536)
- 6 isolated steps with Phone Home (each writes to DB independently)
- Deploy: `cd 03_Development/gas && npm run deploy`

## Frontend Pipeline
1. MagicDropzone: upload + WebP compress + create job + fire-and-forget
2. FinanceManager: Realtime subscription + 90s fallback poll
3. On result: resolve supplier → applyMappings (SKU→name) → reclassify line_items
4. StagingArea: editable preview with ReconciliationPanel, confidence colors, Create Item modal

## Anti-Hallucination Defenses (Phase 6.2)
- Prompt: item_count_observed anchor, confidence scoring, UNREADABLE rule
- GAS post-processing: item count validation, price math check, duplicate detection
- Frontend: confidence-colored borders (green/amber/red), warning tooltips

## Reconciliation (Phase 6.1, updated 6.6)
- Footer: {subtotal, discount_total, vat_amount, delivery_fee, grand_total}
- Formula: subtotal + discount_total + vat_amount + delivery_fee = grand_total
- ReconciliationPanel: editable (discount, VAT, delivery), green checkmark when balanced

## Data Sanitization (Phase 6.6)
- `sanitizeNumber_(val)` — Strips OCR dust (`/[^\d.]/g`), handles multiple dots, null → 0
- `sanitizeSigned_(val)` — Like sanitizeNumber_ but preserves negative sign (for discount_total)
- Applied to all numeric fields in validateAndPostProcess_ (line items + footer)
- Schema: brand, package_weight per line item; delivery_fee in footer

## Key Secrets
- `GAS_WEB_APP_URL` — In Supabase Secrets
- `GEMINI_API_KEY` — In GAS Script Properties

## Patterns & Gotchas
- Boris Rule #13: Long-running AI tasks MUST use async pattern (receipt_jobs + Realtime)
- WebP compression (quality 0.5) preserves resolution, reduces bytes ~95%
- fn_cleanup_stale_receipt_jobs() — lazy cleanup of zombie jobs (>5min)
- Module-scope cache in useSpokeData (not useRef) — survives component unmount

→ Schema: `02_Obsidian_Vault/Database Schema.md`
→ Receipt architecture: `02_Obsidian_Vault/Receipt Routing Architecture.md`
→ Phase history: `docs/context/phases/phase-5x-receipts.md`
