# Spec: Receipt Pipeline Optimization
> Author: COO | Date: 2026-04-05
> MC Tasks: `5b523abb` (short-term), `fc20568f` (long-term)
> Status: Draft v3 — architecture decisions finalized

## Problem Statement

Finance Agent обрабатывает чеки через Cowork (Claude Opus + полный system prompt + все MCP tools).
Стоимость обработки одного чека: **~$1.5-3.0** (200-400K input tokens за 8-10 tool calls с нарастающим контекстом).

При 6 чеках в день = $9-18/день = **$270-540/мес** только на парсинг чеков.
Это также расходует квоту подписки Anthropic.

## Constraint: Only Anthropic Models for Vision/OCR

> **HARD CONSTRAINT.** Gemini Flash тестировался ранее (GAS pipeline, Path A) и показал неприемлемое количество ошибок на тайских чеках — разнотипные, труднопредсказуемые. Именно поэтому мы перешли на Anthropic.
>
> GAS pipeline (receipts.md Path A) — **legacy, не использовать как основу.**
> Вся Vision/OCR работа — только через модели Claude.

## Current Architecture (единственный активный path)

```
receipt_inbox (Admin UI: /receipts)
  → Finance Agent (Cowork / Claude Opus)
    → download_receipt (base64 из Supabase Storage)
    → read_guideline(s) — image-reading-protocol + supplier-specific
    → Vision: чтение чека (Claude Opus vision)
    → search_nomenclature (per item) — enrichment
    → check_duplicate — dedup
    → update_inbox(parsed_payload)
  → Admin UI review → approve_receipt (human-triggered)
  Cost: ~$1.5-3.0 per receipt (Claude Opus in Cowork)
```

### Почему так дорого?

Каждый tool call в Cowork пересылает на API:
- Системный промпт Cowork (~5-8K tokens)
- Все MCP tool definitions (finance 18 + mission-control 4 + registry + scheduled-tasks + session-info = ~50+ tools)
- Все skill definitions (~15 skills)
- Memory system + project instructions
- Нарастающую историю диалога (включая base64 изображения чеков)

К 8-му вызову контекст одного чека = **200-400K input tokens**.

### Что делает агент по шагам (WF-1)

| Шаг | Нужен LLM? | Нужен Vision? | Можно автоматизировать? |
|-----|-----------|---------------|------------------------|
| 1. check_inbox | Нет | Нет | Да — простой SQL запрос |
| 2. update_inbox(processing) | Нет | Нет | Да — статус-машина |
| 3. download_receipt | Нет | Нет | Да — HTTP GET |
| 4. read_guideline(s) | Нет | Нет | Да — файл с диска |
| 5. **Vision: чтение чека** | **Да** | **Да** | **Нет — core LLM task** |
| 6. **Arithmetic check** | Частично | Нет | Частично — формулы детерминированные, но edge cases нужен LLM |
| 7. **Classification** | Да | Нет | Частично — правила + LLM для edge cases |
| 8. search_nomenclature | Нет | Нет | Да — SQL LIKE/fuzzy |
| 9. check_duplicate | Нет | Нет | Да — SQL запрос |
| 10. update_inbox(parsed) | Нет | Нет | Да — INSERT |
| 11. emit_business_task | Нет | Нет | Да — template INSERT |

**Вывод:** из 11 шагов только 3 реально требуют LLM (шаги 5, 6, 7). Остальные 8 — детерминированная логика.

---

## Plan: 3 Phases

### Phase 1: Quick Win — Agent на Claude Code + Sonnet (1 день)
> MC Task: `5b523abb`

**Цель:** Снизить стоимость в 3-5x без изменения архитектуры.

**Что делаем:**
1. Создать `.claude/` конфиг в репо для finance agent с минимальным контекстом
2. Запускать через `claude --model sonnet --max-turns 20`
3. Подключить только 2 MCP: `shishka-finance` + `shishka-mission-control`
4. Без skills, без memory system, без Cowork overhead
5. AGENT.md как system prompt — уже содержит все guidelines и workflows

**Ожидаемый результат:**
- $0.30-0.80 за чек (Sonnet 5x дешевле Opus, меньше context overhead)
- $54-144/мес при 6 чеках/день
- Качество парсинга: сохраняется (Sonnet справляется со structured extraction)

**Как тестируем:**
- Прогнать 3 чека через Claude Code + Sonnet
- Сравнить parsed_payload с результатами Cowork-агента
- Замерить время и примерный расход токенов

---

### Phase 2: Deterministic Pipeline + Claude Vision API (3-5 дней dev)
> MC Task: `fc20568f`

**Цель:** Вынести детерминированные шаги из агентского loop. LLM вызывается 1 раз (single API call), а не 8-10 раз.

#### Архитектурные решения (зафиксированы 2026-04-05)

**Триггер:** Supabase Database Webhook на INSERT в `receipt_inbox` → Edge Function `process-receipt`. Процесс загрузки через Admin UI (`/receipts` → InboxUploader) не меняется.

**Guidelines:** Только релевантный guideline запекается в промпт. `supplier_hint` из формы InboxUploader → выбор конкретного guideline (makro / market-small / delivery). Нет hint → generic (image-reading-protocol + classification).

**Fallback:** Если confidence низкий или арифметика не сходится → `status: "needs_review"` → человек смотрит и правит в Admin UI. Без agent-fallback — не усложняем ради 5% кейсов.

#### Pipeline

```
Admin UI: /receipts → InboxUploader
  │  Images: WebP compressed (0.65 quality) → Supabase Storage receipts/inbox/
  │  PDF: uploaded as-is
  │  Metadata: uploaded_by, supplier_hint, amount_hint, receipt_date
  │
  ▼
INSERT receipt_inbox (status: "pending")
  │
  ▼
Step 0: TRIGGER — Supabase Database Webhook on INSERT
  │
  ▼
Step 1: PREPARE (Edge Function, deterministic, $0)
  │  - update_inbox(status: "processing")
  │  - Fetch receipt image/PDF from Storage (by photo_urls)
  │  - supplier_hint → select guideline text (makro/market-small/delivery/generic)
  │  - Build ONE structured prompt: guideline + output JSON schema + image
  │
  ▼
Step 2: VISION + PARSE (Claude API — single call, $0.05-0.15)
  │  - Model: claude-sonnet-4-6 (or haiku for structured receipts like Makro)
  │  - Input: image/PDF + baked prompt (guideline + schema)
  │  - Output: complete structured JSON (items, header, footer, classification)
  │  - ONE call, not 8-10 calls with growing context
  │  - PDF supported natively by Claude Vision
  │
  ▼
Step 3: VALIDATE + ENRICH (Edge Function, deterministic, $0)
  │  - Arithmetic: sum(items) + discount + delivery_fee = total
  │  - Nomenclature matching: barcode → search, SKU → search, name → fuzzy
  │  - Duplicate check: date + supplier + amount
  │  - Confidence scoring based on arithmetic + item match rate
  │
  ▼
Step 4: SAVE (Edge Function, deterministic, $0)
  │  - If confidence OK → update_inbox(status: "parsed", parsed_payload)
  │  - If confidence low / arithmetic fails → update_inbox(status: "needs_review", parsed_payload + warnings)
  │  - Insert business_tasks record (template, no agent needed)
  │
  ▼
Admin UI: Review → approve_receipt (human-triggered, unchanged)
```

#### Cost per API call

- Sonnet: ~1K input (prompt+guideline) + ~5K image tokens + ~2K output = ~8K tokens ≈ $0.05-0.10
- Haiku: ≈ $0.01-0.03
- **vs текущие 200-400K tokens через агента = 25-50x экономия**

#### Routing по типу чека

| Тип чека | Модель | Ожидаемая стоимость |
|----------|--------|---------------------|
| Makro (структурированный, barcode) | Haiku | $0.01-0.03 |
| Market (термопринтер, рукописный) | Sonnet | $0.05-0.10 |
| Delivery (электронный) | Haiku | $0.01-0.03 |
| Нечитаемый / low confidence | needs_review → человек в Admin UI | $0 |

#### Ожидаемый результат

- $0.01-0.10 за чек
- **$3-20/мес** при 6 чеках/день (vs $270-540 сейчас)
- Latency: 5-15 секунд (один API call) vs 3-5 минут (агент)

#### Dev tasks

1. Edge Function `process-receipt` — orchestrator (Steps 0-4)
2. Structured prompt template с baked-in guidelines (per supplier type)
3. Guideline selector: supplier_hint → guideline text
4. Nomenclature matching function (SQL: barcode, SKU, fuzzy name)
5. Arithmetic verification function (pure math, deterministic)
6. Confidence scoring logic (arithmetic pass + item match rate)
7. PDF support in InboxUploader (upload as-is, no compression)
8. `needs_review` status support in Admin UI (InboxReviewPanel)

---

### Phase 3: Full Automation + Agent as Analyst (future)

**Цель:** Pipeline обрабатывает 90%+ чеков автономно. Agent переключается на аналитику.

```
Admin UI (/receipts) → Supabase Storage → receipt_inbox
  │
  ▼
process-receipt Edge Function (Phase 2 pipeline)
  ├─ High confidence → "parsed" → Admin UI review → approve
  └─ Low confidence → "needs_review" → человек правит в Admin UI → approve
```

**Finance Agent новая роль (освобождён от парсинга):**
- WF-5: Финансовая отчётность и P&L анализ
- WF-6: Anomaly detection (cost spikes, duplicate patterns)
- WF-7 (new): Supplier price tracking и рекомендации по закупкам

**Когда переходить:** Когда Phase 2 pipeline обрабатывает 90%+ чеков без fallback.

---

## Cost Comparison Summary

| Подход | Cost/receipt | Cost/month (6/day) | Latency | Dev effort |
|--------|-------------|---------------------|---------|------------|
| **Current** (Cowork + Opus) | $1.5-3.0 | $270-540 | 3-5 min | 0 |
| **Phase 1** (Claude Code + Sonnet) | $0.30-0.80 | $54-144 | 2-3 min | 1 day |
| **Phase 2** (Pipeline + Claude API) | $0.01-0.10 | $3-20 | 5-15s | 3-5 days |
| **Phase 3** (Auto + Agent analyst) | $0.01-0.10 | $3-20 | 5-15s | +2-3 days |

## Key Principle

> **Агент — для reasoning. Pipeline — для execution.**
>
> Чтение чека = structured extraction (pipeline).
> "Почему food cost вырос на 15%?" = reasoning (agent).
>
> Не кормить агента задачами, которые решаются одним API call.

## Risks

- **Sonnet quality на термопринтерных чеках:** Нужен A/B тест Sonnet vs Opus на сложных чеках. Если Sonnet не справляется с market-small — оставить Opus для этого типа.
- **Structured prompt engineering:** Весь контекст (guideline + schema) надо уместить в один промпт. Нужно тщательно протестировать.
- **Nomenclature fuzzy matching без LLM:** "ไก่สดทั้งตัว" → "RAW-CHICKEN-WHOLE" — может потребоваться маленький LLM call для fuzzy matching тайских названий. Решаемо через lookup table + Haiku fallback.

## Next Steps

1. [ ] Phase 1: Настроить Claude Code runner для finance agent
2. [ ] Phase 1: A/B тест — 3 чека через Sonnet vs текущий Cowork результат
3. [ ] Phase 2: Спроектировать structured prompt template (baked-in guidelines)
4. [ ] Phase 2: Прототип Edge Function `process-receipt`
5. [ ] Phase 2: Тест single-call Claude API vs multi-turn agent на 5 чеках
