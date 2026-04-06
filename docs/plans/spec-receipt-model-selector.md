# Spec: Receipt Pipeline — Local Model Integration (v3)

> **MC Task:** a494bea8 + linked to fc20568f (no-agent pipeline)
> **Priority:** high | **Domain:** tech
> **Created:** 2026-04-06 | **Author:** COO
> **v3:** Rewritten after full audit of MC tasks, session logs, agent files

## Context

Finance Agent currently runs as Claude Sonnet via Claude Code CLI (`run.sh`).
Claude Sonnet IS the OCR engine — it sees receipt images via `download_receipt` (base64) and parses them with native vision.

### The Problem (discovered in sessions "Optimize financial agent token costs" + "Migrate receipt agent to local Ollama"):
- Claude Code loads ALL project config (60+ skills, all MCPs, CLAUDE.md) — 9-11 min per receipt
- AGENT-FAST.md optimization didn't help — Claude Code adds to config, doesn't replace
- Task fc20568f (in_progress): "Design dedicated receipt parsing pipeline (no-agent architecture)"
- Task 5b523abb (cancelled): "Migrate Finance Agent from Cowork to Claude Code" — cancelled because agent loop is the wrong architecture

### GAS + Gemini — LEGACY, not in use:
- services/gas/ReceiptParser.gs exists in code but is NOT the active pipeline
- Gemini Flash had quality issues on Thai receipts (feedback memory)
- GAS pipeline was Path A, now replaced by Finance Agent (Path C)

### Local fallback — EXISTS but CLI-only:
- services/local-receipt-parser/index.js — uses Ollama (gemma4:e4b)
- Works standalone, not integrated into Admin Panel

## Current Architecture (VERIFIED from session logs 2026-04-05)

```
CEO uploads receipt photo → Admin Panel (MagicDropzone)
  → Supabase Storage (WebP) + receipt_inbox row
  → CEO runs: ./agents/finance/run.sh "обработай первый чек"
  → Claude Code CLI → Claude Sonnet (vision)
      → check_inbox(status: pending)
      → update_inbox(status: processing)
      → download_receipt(storage_path) → base64 image
      → [Claude reads image with native vision]
      → read_guideline(makro/classification/arithmetic-check)
      → search_nomenclature, check_duplicate
      → update_inbox(status: parsed, parsed_payload: JSON)
      → emit_business_task("Parsed receipt: ...")
  → CEO reviews in InboxReviewPanel → approve_receipt
```

**Pain point:** 9-11 min per receipt, Claude Code overhead, $0.30-3.00 per receipt via subscription tokens.

## Target: Two Replacement Options

### Option A: Local Ollama Pipeline (Gemma 4) — $0/receipt
```
MagicDropzone → receipt_inbox
  → local-receipt-parser HTTP service (localhost:3100)
  → Ollama API → gemma4 (vision)
  → Parse JSON → validate → update receipt_inbox
  → InboxReviewPanel → approve_receipt
```

### Option B: Direct Anthropic API Pipeline — $0.02-0.05/receipt
```
MagicDropzone → receipt_inbox
  → Edge Function OR local service
  → Anthropic Messages API (claude-sonnet, vision)
  → Parse JSON → validate → update receipt_inbox
  → InboxReviewPanel → approve_receipt
```

### Option C (current interim): Keep Finance Agent, optimize later

## What ALREADY EXISTS:
- ✅ services/local-receipt-parser/index.js — Ollama adapter (CLI mode)
- ✅ receipt_inbox table with status workflow
- ✅ InboxReviewPanel — model-agnostic review UI
- ✅ approve_receipt RPC — model-agnostic
- ✅ Gemma 4 installed locally via Ollama
- ✅ Guidelines in agents/finance/guidelines/ (reusable as prompts)

## Implementation: Option A (Gemma 4 Local)

### Step 1: Benchmark Gemma 4 on Thai receipts
- Take 5 real Makro receipts from Supabase Storage
- Run through local-receipt-parser
- Compare output quality with Finance Agent results (already in MC: Makro 692.25 THB, Makro 160 THB)

### Step 2: HTTP wrapper for local-receipt-parser
- `services/local-receipt-parser/server.js` (Express)
- POST /parse → {job_id} or {image_path}
- CORS for localhost:5173

### Step 3: MagicDropzone routing
- Model selector dropdown: "Claude Agent (slow)", "Gemma 4 Local (fast)"
- For "gemma4-local" → POST to localhost:3100/parse
- For "claude-agent" → existing run.sh flow

### Step 4: Validate output format
- Ensure local-receipt-parser JSON matches what InboxReviewPanel expects
- Key: parsed_payload format must match update_inbox schema

## Success Criteria
- [ ] Gemma 4 can parse a Makro receipt with ≥80% accuracy vs Claude
- [ ] local-receipt-parser runs as HTTP service
- [ ] MagicDropzone can route to local parser
- [ ] End-to-end: upload → parse → review → approve works with Gemma 4
- [ ] Processing time < 60 seconds (vs 9-11 min current)

## Risk
- Gemma 4 may not handle Thai text as well as Claude Sonnet
- Output format may need adaptation for InboxReviewPanel
- localhost:3100 requires Ollama running on CEO's machine

## Related Tasks
- fc20568f: Design dedicated receipt parsing pipeline (no-agent architecture) — THIS IS THAT TASK
- 0bc0c807: Benchmark Gemma 4 31B for Thai receipt OCR
- 5b523abb: (cancelled) Migrate Finance Agent to Claude Code
