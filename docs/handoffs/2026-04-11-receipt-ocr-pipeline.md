# Handoff: Receipt OCR Pipeline — 2026-04-11

## MC Task
`eca16a14` — Initiative: Receipt OCR Pipeline (in_progress)

## What was done
Two-stage receipt OCR pipeline deployed and tested on real Makro receipts.

### Architecture
```
Photo → GCV OCR ($0.0015/image) → raw text → LLM ($0.001-0.07) → JSON + EN translation
```

### Files created/modified
- `services/supabase/functions/ocr-receipt/index.ts` — Edge Function (GCV + multi-model LLM)
- `services/supabase/functions/ocr-receipt/prompts.ts` — System prompt + model config
- `services/supabase/migrations/106_receipt_ocr_pipeline.sql` — api_cost_log table + receipt_inbox columns
- `apps/admin-panel/src/hooks/useReceiptInbox.ts` — added Realtime, parseReceipt, resetToPending
- `apps/admin-panel/src/components/receipts/InboxUploader.tsx` — model selector (5 options)
- `apps/admin-panel/src/components/receipts/InboxList.tsx` — parse/bulk-parse buttons, model+cost columns, reset button
- `apps/admin-panel/src/pages/ReceiptInbox.tsx` — wired new props
- `apps/admin-panel/src/api/apiCost.ts` — unified cost API (api_cost_log + brain_query_log)
- `apps/admin-panel/src/pages/ApiCostPage.tsx` — /api-costs page
- `apps/admin-panel/src/App.tsx` — route for ApiCostPage
- `apps/admin-panel/src/layouts/AppShell.tsx` — sidebar link

### Supabase secrets set
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY` (Gemini), `GOOGLE_API_KEY_VISAI` (Cloud Vision)

### Edge Function deployed
- `ocr-receipt` — deployed to qcqgtcsjoacuktcewpvo, --no-verify-jwt
- Symlink: `supabase/functions → ../services/supabase/functions`

### Test results (receipt 166501146001, 16 items, 2251 THB)
| Model | Items | Cost | Time | EN translations |
|-------|-------|------|------|-----------------|
| Gemini Flash (default) | 16/16 | $0.004 | 72s | untested |
| Gemini Pro | 16/16 | $0.041 | 67s | untested |
| GPT-4o | 14/16 | $0.033 | 21s | untested |
| Sonnet | 16/16 | $0.068 | 43s | untested |

## What remains

### Phase 4: Nomenclature confidence badges (MC task eca16a14)
- InboxReviewPanel.tsx — show green/amber/red badges per item based on nomenclature match confidence
- supplier_catalog is mostly empty → badges will be red until data accumulates

### Phase 6: GDrive archive (MC task eca16a14)
- Spec exists: `docs/plans/spec-gdrive-receipt-archive.md`
- Need: Service Account for GDrive Shared Drive
- Edge Function `archive-gdrive` or MCP tool
- Post-approve trigger in useReceiptInbox.ts

### Quality verification needed
- Run Gemini Flash on all pending receipts, verify EN translations quality
- Compare translated_name output against Makro website product names
- Test on non-Makro receipts (market, delivery)

### CEO feature requests (logged in MC comment 9a87dad7)
1. Multi-receipt detection (one photo, 2+ receipts)
2. Handwritten receipt support
3. Duplicate detection (by invoice_number + supplier + amount)
4. Makro name verification via supplier_catalog
5. Model learning per supplier type
6. Arithmetic mismatch → flag for review (not silent)

## Quick start for next session
```
# Pick up the task
get_task(id="eca16a14")

# Key files to read
Read: services/supabase/functions/ocr-receipt/index.ts
Read: services/supabase/functions/ocr-receipt/prompts.ts
Read: apps/admin-panel/src/hooks/useReceiptInbox.ts

# Test a receipt
curl "https://qcqgtcsjoacuktcewpvo.supabase.co/functions/v1/ocr-receipt?inbox_id=<ID>&model=gemini-flash"

# Deploy after changes
cd <repo> && npx supabase functions deploy ocr-receipt --no-verify-jwt
```
