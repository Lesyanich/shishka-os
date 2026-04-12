# Spec: Batch Receipt Processing — Auto-Triage + Auto-Parse

> **MC Task:** ced65f07-fe0b-444e-801e-8b65e2e079ab
> **Priority:** high | **Domain:** tech
> **Created:** 2026-04-12 | **Author:** Tech-Lead
> **Parent initiative:** eca16a14 (Receipt OCR Pipeline)

## Problem

CEO uploads an unsorted pile of receipt photos (10-30 files). Current system treats ALL files as one receipt (one `receipt_inbox` row with all URLs in `photo_urls[]`). This breaks for:

1. **Multi-page receipt** — one receipt split across 2-3 JPEGs (e.g., Makro invoice 062501126001 = 3 pages)
2. **Mixed suppliers** — batch contains receipts from Makro, market vendors, delivery apps
3. **Handwritten Thai receipts** — market vendors, no barcodes, freeform layout
4. **Multi-receipt scan** — one photo contains 2+ receipts side by side

CEO wants **zero-config**: drop files, system figures out grouping automatically.

## Current Architecture (verified 2026-04-12)

```
InboxUploader → N files compressed → Storage → 1 receipt_inbox row (photo_urls: [all N])
  → User clicks "Upload & parse" → ocr-receipt Edge Function (1 inbox_id)
  → GCV OCR per image → concatenate with PAGE BREAK → LLM structuring → 1 parsed_payload
```

**Default model:** Gemini Flash (frontend localStorage default). Edge Function fallback is `gemini-pro` (BUG — should be `gemini-flash`).

**Key files:**
- `services/supabase/functions/ocr-receipt/index.ts` — two-stage pipeline (GCV + LLM)
- `services/supabase/functions/ocr-receipt/prompts.ts` — system prompt, MODEL_MAP, pricing
- `apps/admin-panel/src/components/receipts/InboxUploader.tsx` — upload UI
- `apps/admin-panel/src/hooks/useReceiptInbox.ts` — CRUD hook with realtime
- `apps/admin-panel/src/components/receipts/InboxList.tsx` — list + bulk actions

## Target Architecture

```
CEO drops 20 files into BatchUploader
  ↓
[Frontend] Upload all to Storage (parallel), collect URLs
  ↓
[Frontend] Call new Edge Function: receipt-batch-process
  ↓
[Edge Function — Phase 1: GCV OCR]
  For each image (parallel): GCV → raw OCR text
  ↓
[Edge Function — Phase 2: Triage]
  Single LLM call (Gemini Flash) on ALL OCR texts:
    → Extract per-image: receipt_number, date, supplier, doc_type, page_hint, multi_receipt flag
    → Group images into receipt clusters
    → Output: Array<{ group_id, image_indices[], receipt_meta }>
  ↓
[Edge Function — Phase 3: Create rows + Parse]
  For each group:
    → INSERT receipt_inbox row (photo_urls = group's URLs, status = 'processing')
    → Full LLM parse (existing ocr-receipt logic) on group's concatenated OCR text
    → UPDATE receipt_inbox (status = 'parsed', parsed_payload = result)
  ↓
[Frontend] Realtime subscription shows rows appearing in InboxList
  CEO reviews M parsed receipts as usual
```

### Combined triage+parse flow (CEO choice)

Triage and full parse happen in one Edge Function call. No intermediate confirmation step.

## Triage Algorithm

### Phase 2a: Per-image header extraction

Input to LLM: all OCR texts with image indices.

Triage prompt (Gemini Flash, text-only — cheap):
```
You are a receipt sorting assistant. I have OCR text from {N} images uploaded together.
For each image, extract ONLY the header metadata.

Return JSON array:
[
  {
    "image_index": 0,
    "receipt_number": "062501126001" or null,
    "date": "2026-04-10" or null,
    "supplier_name": "SIAM MAKRO" or null,
    "document_type": "tax_invoice|receipt|handwritten|bank_slip|delivery|unknown",
    "page_hint": "1/3" or null,
    "is_multi_receipt": false,
    "receipts_on_image": 1,
    "notes": "optional clarification"
  }
]

Rules:
- Thai Buddhist Era: subtract 543 (2569 → 2026)
- If text looks like page 2/3 of same receipt (same supplier, same number, continuing items) → set page_hint
- If image contains TWO separate receipts → is_multi_receipt: true, receipts_on_image: 2
- If handwritten → document_type: "handwritten"
- If image is unreadable or not a receipt → document_type: "unknown"
```

### Phase 2b: Grouping algorithm (server-side, deterministic)

```
1. Group by receipt_number (exact match, non-null)
2. Sort within group by page_hint (1/3 < 2/3 < 3/3)
3. For ungrouped: cluster by (supplier_name + date) within ±1 day
4. For is_multi_receipt images: image belongs to ALL detected receipt groups
   (same photo_url in multiple receipt_inbox rows)
5. Remaining ungrouped: each image = 1 separate receipt
6. document_type "unknown": create row with status 'error', note 'unrecognized document'
```

### Phase 3: Per-group full parse

Reuse existing `ocr-receipt` logic:
- Concatenate group's OCR texts with `--- PAGE BREAK ---`
- Call LLM with existing SYSTEM_PROMPT + OUTPUT_SCHEMA
- Nomenclature matching, classification, cost calculation
- Save to receipt_inbox

## DB Changes

**None required.** `receipt_inbox.photo_urls` already supports arrays, and the same URL can appear in multiple rows.

New column consideration (optional, not blocking):
- `batch_id UUID` — to link rows that were uploaded together. Useful for UI grouping. Can add later.

## Edge Function Design

**New function:** `services/supabase/functions/receipt-batch-process/index.ts`

Reuses from `ocr-receipt`:
- `downloadImageAsBase64`, `extractTextViaGCV` — Stage 1
- `callGemini` (or other providers) — Stage 2 LLM calls
- `resolveSupplier`, `matchNomenclature`, `classifyItems` — Stage 3 enrichment
- `MODEL_MAP`, `MODEL_PRICING`, `SYSTEM_PROMPT`, `OUTPUT_SCHEMA` — shared config

**Extract shared code** into `services/supabase/functions/_shared/` (Deno convention for shared modules across Edge Functions):
- `_shared/llm-providers.ts` — callAnthropic, callOpenAI, callGemini
- `_shared/gcv.ts` — extractTextViaGCV, downloadImageAsBase64
- `_shared/nomenclature.ts` — resolveSupplier, matchNomenclature, classifyItems
- `_shared/prompts.ts` — SYSTEM_PROMPT, OUTPUT_SCHEMA, MODEL_MAP, MODEL_PRICING
- `_shared/db.ts` — Supabase client init

**Input:** POST body (not query params, since payload is larger):
```json
{
  "photo_urls": ["url1", "url2", ...],
  "uploaded_by": "Lesia",
  "model": "gemini-flash"
}
```

**Output:** Streamed progress via receipt_inbox realtime (rows appear as created). Final response:
```json
{
  "ok": true,
  "groups": [
    { "inbox_id": "uuid", "supplier": "SIAM MAKRO", "images": 3, "items": 36 },
    { "inbox_id": "uuid", "supplier": "Market vendor", "images": 1, "items": 5 }
  ],
  "total_receipts": 2,
  "total_images": 4,
  "total_cost_usd": 0.025,
  "duration_ms": 12000
}
```

**Timeout consideration:** Supabase Edge Functions have 150s idle timeout. For 20 images:
- GCV: ~1s/image parallel = ~2s total
- Triage LLM: ~3s (one call, text-only)
- Full parse: ~5s/group parallel = ~10s for 5 groups
- Total: ~15s. Well within limits.

For 50+ images: may need to batch GCV calls (10 parallel at a time).

## Frontend Changes

### New component: `BatchUploader.tsx`

Replaces current InboxUploader for the batch use case. Minimal UI:

1. **Drop zone** — drag N files (no limit, or generous limit like 50)
2. **Uploaded by** selector (Bas/Lesia/Admin) — only required field
3. **Model selector** — same dropdown, default Gemini Flash
4. **"Upload & Process" button** — uploads all → calls batch endpoint
5. **Progress bar** — "Uploading 20 files... Analyzing... Found 5 receipts... Parsing..."
6. **Result toast** — "Created 5 receipts from 20 images. Review in inbox."

No date, supplier, amount, notes fields — triage extracts these automatically.

### InboxUploader modification

Keep existing InboxUploader for single-receipt manual upload (with hints). Add a toggle or tab: "Single receipt" | "Batch upload".

Or: replace entirely with BatchUploader that also handles single files (if 1 file → skip triage, go straight to parse). Design decision for /code.

### InboxList changes

- Show `batch_id` grouping (if column added) or just sort by upload_date
- Existing bulk parse/approve/delete already works
- No changes needed if batch creates standard receipt_inbox rows

## Cost Estimate (20 images, 5 receipts)

| Stage | Calls | Cost |
|-------|-------|------|
| GCV OCR | 20 images | $0.030 |
| Triage (Gemini Flash, text-only) | 1 call, ~10K tokens | $0.005 |
| Full parse (Gemini Flash) | 5 calls | $0.040 |
| **Total** | | **~$0.075** |

vs. current: 20 images in 1 row → 1 parse call → $0.008 but wrong result (treats all as one receipt).

## Implementation Phases

### Phase 1: Shared module extraction (kind:refactor)
Extract shared code from `ocr-receipt` into `_shared/`. Non-breaking — `ocr-receipt` imports from `_shared/` instead of inline.

### Phase 2: Batch Edge Function (kind:feature)  
New `receipt-batch-process` function with triage + grouping + per-group parse.

### Phase 3: Frontend BatchUploader (kind:feature)
New component or InboxUploader upgrade. Calls batch endpoint, shows progress.

### Phase 4: Bug fixes (kind:bug-fix)
- Edge Function default `gemini-pro` → `gemini-flash`
- InboxList bulk parse fallback `claude-sonnet` → `gemini-flash`

Phase 4 is independent — can ship anytime.

## Risks

1. **Triage accuracy** — LLM may misgroup images. Mitigation: InboxReviewPanel already lets CEO re-assign photos manually (edit photo_urls). Could add "split receipt" / "merge receipts" actions later.
2. **Handwritten OCR** — GCV may struggle with handwritten Thai. Mitigation: existing fallback to "unknown" + error status. CEO manually processes.
3. **Edge Function timeout** — 50+ images may approach 150s limit. Mitigation: batch GCV calls, parallelize parse calls.
4. **Shared module refactor** — Deno import paths must use relative URLs. Test `ocr-receipt` still works after extraction.

## Success Criteria

- [ ] Drop 20 unsorted images → system creates correct number of receipt_inbox rows
- [ ] Multi-page receipt (same receipt_number) grouped into one row
- [ ] Different suppliers → separate rows
- [ ] Multi-receipt scan → separate rows, same photo_url in both
- [ ] Handwritten Thai receipt → parsed (or graceful error)
- [ ] Total processing time < 30s for 20 images
- [ ] Existing single-receipt upload still works (no regression)
- [ ] Cost per batch ≤ $0.10 for 20 images
