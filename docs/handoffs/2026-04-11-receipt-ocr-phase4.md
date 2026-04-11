# Handoff: Receipt OCR Phase 4 — 2026-04-11

## MC Task
`eca16a14` — Initiative: Receipt OCR Pipeline (in_progress)

## What was done this session

### 1. Confidence badges in InboxReviewPanel
- Added `confidence` field to `FoodItem` TypeScript interface
- Added `confidenceBadge()` helper — renders colored badge per item:
  - **exact** (green) — barcode/SKU match
  - **fuzzy** (amber) — fuzzy name match
  - **new** (red) — no match found
- Badge displayed next to nomenclature code in food items table

### 2. Per-row model selector + re-parse
- Each non-approved receipt row now has a model dropdown + play button
- Any receipt can be re-parsed with a different model (not just "pending")
- Re-parse flow: `resetToPending()` → `parse(id, selectedModel)`

### 3. New OCR models added
- **Claude Haiku** (`claude-haiku-4-5-20251001`) — $0.8/$4 per 1M tokens
- **Gemini Flash Lite** (`gemini-2.5-flash-lite`) — $0.10/$0.40 per 1M tokens
- **Gemini 3 Flash** (`gemini-3-flash-preview`) — $0.50/$3.0 per 1M tokens
- All added to MODEL_MAP, MODEL_PRICING, OcrModel type, InboxUploader, InboxList

### 4. Full English translation
- InboxReviewPanel: all labels, buttons, validation messages → English
- InboxList: status badges, column headers, action labels → English
- InboxUploader: form labels, model selector, submit button → English
- ReceiptInbox page: title + description → English

### 5. UI improvements
- Seconds added to upload date display (was HH:MM, now HH:MM:SS)
- InboxUploader model selector: replaced 3×3 button grid with compact dropdown
- Edge Function deployed with all new models

### 6. Comprehensive benchmark (7 models × 3 receipts)

**Invoice 062501126001 (36 items, ฿4,854):**

| Model | Items | Qty OK | Price OK | Price diff | Cost |
|---|---|---|---|---|---|
| Gemini 2.5 Flash | 36/36 | 36/36 | 36/36 | ฿0 | $0.008 |
| Gemini 3 Flash | 36/36 | 36/36 | 36/36 | ฿0 | $0.025 |
| Flash Lite | 36/36 | 28/36 | 28/36 | ฿1,511 | $0.007 |
| Haiku | 36/36 | 34/36 | 34/36 | ฿611 | $0.036 |
| GPT-4o | 23/36 | 21/23 | 20/23 | ฿449 | $0.048 |
| Sonnet | 25/36 | 25/25 | 25/25 | ฿0 | $0.097 |
| Gemini Pro | timeout | — | — | — | — |

**Invoices 570-831003 and 062501170004**: Gemini Flash 100% match.

**Verdict**: Gemini 2.5 Flash = best (100% accuracy, cheapest). Default confirmed.

## Files modified
- `apps/admin-panel/src/components/receipts/InboxReviewPanel.tsx` — confidence badges + EN
- `apps/admin-panel/src/components/receipts/InboxList.tsx` — per-row selector + EN
- `apps/admin-panel/src/components/receipts/InboxUploader.tsx` — compact dropdown + EN
- `apps/admin-panel/src/hooks/useReceiptInbox.ts` — OcrModel type expanded
- `apps/admin-panel/src/pages/ReceiptInbox.tsx` — EN title
- `services/supabase/functions/ocr-receipt/prompts.ts` — 3 new models

## Commit
`a7a0793` on branch `feature/shared/brain-feedback-phase2`

## What remains on eca16a14

### Phase 6: GDrive archive
- Spec: `docs/plans/spec-gdrive-receipt-archive.md`
- DB ready (`gdrive_paths` column), UI ready
- Need: Service Account + MCP tool implementation

### CEO feature requests
- `73bab832` — Voice/text expense entry with AI-guided data completion (logged as MC task)
- Multi-receipt detection (one photo → 2+ receipts)
- Duplicate detection (invoice_number + supplier + amount)
- Arithmetic validation flagging (qty × price ≠ total)

## Quick start for next session
```
get_task(id="eca16a14")

# Key files
Read: apps/admin-panel/src/components/receipts/InboxReviewPanel.tsx
Read: apps/admin-panel/src/components/receipts/InboxList.tsx
Read: services/supabase/functions/ocr-receipt/prompts.ts

# Deploy after changes
cd <repo> && npx supabase functions deploy ocr-receipt --no-verify-jwt
```
