# Spec: Brain Quality Feedback Loop

> MC Task: `f91580be-1064-4358-94f8-95fe173036a9`
> Priority: medium
> Status: research
> Parent: `docs/plans/spec-shishka-brain.md`
> Branch: `feature/shared/brain-feedback-loop`
> Related:
>   - `docs/plans/spec-lightrag.md` (L2 quality gate Q1-Q3)
>   - `docs/plans/spec-mempalace-phase2.md` (L1 quality gate, Section 6)
>   - `services/supabase/migrations/103_brain_query_log.sql` (existing telemetry)
>   - Blocks: `29db0adc` (Brain gateway Phase 4 — gateway routing should be quality-aware)

---

## 1. Problem Statement

Shishka Brain has two live memory layers — L1 MemPalace (conversation memory) and L2 LightRAG (project knowledge). Agents (Chef, Finance, Tech Lead) query these layers dozens of times per session, but we have **zero ongoing signal** on whether answers are accurate, complete, or useful.

Current quality mechanisms are one-shot:
- **L2 Quality Gate:** 3 CEO questions (Q1 forbidden ingredients, Q2 fats synthesis, Q3-A operations.md) — run once during Phase 1 acceptance, never again.
- **L1 Quality Gate:** 3 CEO questions (Q1 storage strategy, Q2 1Password decision, Q3 Phase 2 pivot reason) — run once during Phase 2 acceptance, never again.

**What's missing:**
1. When an agent queries Brain and gets a poor or empty answer, nobody knows.
2. CEO has no way to signal "this answer was wrong" or "this answer was great."
3. Knowledge gaps accumulate silently — no automated detection, no remediation trigger.
4. Cross-agent learning is absent: Chef discovers something useful for Finance, but there's no feedback channel.

**Goal:** Design a feedback mechanism that turns Brain from "fire-and-forget retrieval" into a self-improving knowledge system with measurable quality.

---

## 2. Current State — What Exists Today

### 2.1 Query Telemetry (L2 only)

Migration `103_brain_query_log.sql` logs every LightRAG query to Supabase:

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `ts` | TIMESTAMPTZ | Query timestamp |
| `agent_id` | TEXT | 'chef-agent', 'techlead', 'brain-view-ui', etc. |
| `query_mode` | TEXT | 'naive', 'local', 'global', 'hybrid', 'mix', 'bypass' |
| `query_preview` | TEXT | First 200 chars of query |
| `chunks_returned` | INT | Number of chunks retrieved |
| `llm_tokens_in/out` | INT | Token counts |
| `embed_tokens` | INT | Embedding tokens |
| `cost_usd` | NUMERIC(10,6) | Per-query cost |
| `latency_ms` | INT | Response time |
| `error` | TEXT | Error message (null on success) |

**Gap:** No `response_preview`, no quality score, no gap flag, L1 queries not logged.

### 2.2 Quality Gates (one-shot, not continuous)

**L2 (LightRAG):** Q1-Q3 defined in `spec-lightrag.md`. Validated during Phase 1.5 enrichment (April 10, 2026) with expanded corpus (511 entities, 252 edges). Manual validation only.

**L1 (MemPalace):** Q1-Q3 defined in `spec-mempalace-phase2.md` Section 6. Validated during Phase 2 delivery (April 10, 2026). Manual validation only.

### 2.3 Existing Feedback Patterns

- **`cook_feedback` table** (migration 096): staff feedback on production tasks — `type`, `raw_text`, `is_processed`. A proven pattern for operational feedback in Supabase.
- **FeedbackFAB component** (`apps/admin-panel/src/components/kitchen/FeedbackFAB.tsx`): floating action button for kitchen staff — proven UI pattern.
- **Agent session-end diaries** (MemPalace): agents write "noticed / unsaid / watch next session" at session close. Contains implicit quality signal but unstructured.
- **MC task emission** (`RULE-BACKLOG-FIRST`): agents already create MC tasks for discoveries outside their scope.

### 2.4 Implicit Quality Signals Available Today

| Signal | Layer | Source | Quality Meaning |
|--------|-------|--------|-----------------|
| `chunks_returned = 0` | L2 | brain_query_log | Definite knowledge gap |
| `error IS NOT NULL` | L2 | brain_query_log | System failure |
| `latency_ms > 10000` | L2 | brain_query_log | Possible retrieval struggle |
| `similarity < 0.3` | L1 | MemPalace search response | Low-relevance result |
| Repeated identical query | Both | Agent behavior | Unresolved need |
| Agent re-query within session | Both | Session pattern | First answer was insufficient |

---

## 3. Scoring Model (Research Question 1)

**Recommendation: 3-tier hybrid approach — start cheap, add sophistication only when data justifies it.**

### Tier 0 — Heuristic Scoring (free, immediate)

Compute a composite quality score from signals already in `brain_query_log`:

```
score = 5 (start at max)

IF chunks_returned = 0          → score = 1 (definite gap)
IF error IS NOT NULL             → score = 1 (system failure)
IF chunks_returned < 3           → score -= 1 (sparse retrieval)
IF latency_ms > 10000            → score -= 1 (retrieval struggle)
IF response contains "I don't have information" or "no relevant" → score = 2 (soft gap)

CLAMP score to [1, 5]
```

**Requires:** Adding `response_preview` column to `brain_query_log` (currently only `query_preview` is stored). Minimal change to the LightRAG middleware.

**For L1 (MemPalace):** similarity score from ChromaDB is the heuristic. Results with `similarity < 0.3` are scored 1-2; results with `similarity > 0.7` are scored 4-5.

### Tier 1 — Nightly LLM Judge (batch, ~$0.004/day)

Run a batch evaluation on the day's queries using a cheap LLM (gpt-4o-mini at $0.15/1M input tokens):

**Prompt template:**
```
You are evaluating a knowledge retrieval system. Given the query and the system's response,
rate the response quality on a 1-5 scale:
5 = Complete, accurate, well-sourced answer
4 = Mostly complete, minor gaps
3 = Partially relevant, missing key details
2 = Tangentially related, mostly unhelpful
1 = No useful information or completely wrong

Query: {query_preview}
Response: {response_preview}
Score:
Reasoning (one sentence):
```

**Cost estimate:** ~50 queries/day * ~500 tokens/evaluation = 25K tokens/day = **$0.004/day** ($0.12/month). Negligible.

**Implementation:** Python script or scheduled task. Reads from `brain_query_log WHERE quality_source IS NULL AND ts > now() - interval '1 day'`, writes `quality_score` and `quality_source = 'llm-judge'` back.

### Tier 2 — CEO Thumbs-Up/Down (optional, opportunistic)

The existing `QueryPlayground` component (`apps/admin-panel/src/pages/brain/components/QueryPlayground.tsx`) already shows query results. Add two buttons (thumbs-up, thumbs-down) that write `quality_score = 5 or 1` with `quality_source = 'ceo'`.

**This is NOT a mandatory feedback loop.** CEO should not be asked to rate every query. This captures signal when CEO is already testing Brain in the admin UI.

### Why NOT automated RAGAS metrics

Industry frameworks (RAGAS, DeepEval, TruLens) provide metrics like faithfulness, context precision, and answer relevance. These are valuable for large-scale RAG deployments but **overkill for Shishka's scale** (1 operator, ~50 queries/day, 2 layers):

- **Faithfulness** requires the retrieved context alongside the answer — LightRAG's `/query` endpoint returns only the synthesized response, not the source chunks. Adding context passthrough would require modifying the LightRAG server.
- **Context precision/recall** requires ground-truth relevance judgments — we have no labeled dataset.
- **Cost:** RAGAS evaluation of a single query costs ~$0.01-0.10. At 50 queries/day, that's $0.50-5.00/day — 100x more than the LLM judge approach.

**Recommendation:** Start with Tier 0 + Tier 1. If data shows systematic quality issues, adopt individual RAGAS metrics (answer relevance first) as a targeted diagnostic, not a continuous monitor.

---

## 4. Gap Detection (Research Question 2)

**Recommendation: Passive detection from query logs + repeated-query signal.**

### 4.1 Passive Gap Detection

A query is a **gap candidate** when any of:
- `chunks_returned = 0` (nothing retrieved)
- `quality_score <= 2` (heuristic or LLM-judge scored it as poor)
- `response_preview` contains gap phrases: "I don't have information", "no relevant data", "I cannot find", "not in my knowledge"

**Implementation:** A Supabase view that aggregates gap candidates:

```sql
CREATE VIEW public.brain_gaps AS
SELECT
  layer,
  query_preview,
  count(*) AS hit_count,
  min(ts) AS first_seen,
  max(ts) AS last_seen,
  round(avg(quality_score), 1) AS avg_score,
  array_agg(DISTINCT agent_id) AS agents_affected
FROM public.brain_query_log
WHERE quality_score <= 2
  OR chunks_returned = 0
  OR response_preview ILIKE '%I don''t have information%'
  OR response_preview ILIKE '%no relevant%'
GROUP BY layer, query_preview
ORDER BY hit_count DESC;
```

### 4.2 Repeated-Query Signal

If the same `query_preview` (fuzzy match — first 100 chars) appears 2+ times within 7 days from different sessions or agents, it signals an unresolved need. This is a stronger gap signal than a single failed query — it means the system consistently cannot answer a recurring question.

**Implementation:** Part of the `brain_gaps` view (`hit_count >= 2`).

### 4.3 Quality Gate Regression Suite (Phase 2 — later)

Expand the manual Q1-Q3 quality gates from `spec-lightrag.md` and `spec-mempalace-phase2.md` into an automated nightly test:

1. Store known-answer pairs in a `brain_quality_tests` table (layer, query, expected keywords).
2. Run nightly: execute each query, check if expected keywords appear in the response.
3. If a previously-passing test now fails → flag as regression, create MC task.

This catches model changes, data drift, or accidental document deletion. **Defer to a follow-up task** — the current 6 manual questions (3 per layer) are a small set to automate, but the infrastructure (scheduler, LLM judge for comparison) overlaps with Tier 1 scoring and should be built together.

---

## 5. Storage Architecture (Research Question 3)

**Recommendation: Extend `brain_query_log` in Supabase. NOT MemPalace, NOT a separate system.**

### Rationale

- `brain_query_log` already exists (migration 103), is in Supabase with RLS, and is consumed by the admin panel via `brainCost.ts`. Extending it is the minimal-correct path.
- **MemPalace is wrong for this:** MemPalace stores conversation memory (L1), not operational telemetry. Putting scores there violates the layer separation principle from `spec-shishka-brain.md` ("each layer has non-overlapping responsibility").
- **Separate system is overkill:** At ~50 queries/day, a new table would add maintenance overhead without benefit. The query log is the natural home.

### What changes

| Change | Scope |
|--------|-------|
| Add `layer TEXT DEFAULT 'L2'` to brain_query_log | Distinguish L1 vs L2 queries |
| Add `response_preview TEXT` | Store first 500 chars of response for gap detection |
| Add `quality_score SMALLINT` | 1-5 scale, nullable (filled by heuristic, LLM judge, or CEO) |
| Add `quality_source TEXT` | 'heuristic', 'llm-judge', 'ceo' |
| Add `is_gap BOOLEAN DEFAULT false` | Flagged as knowledge gap |
| New table `brain_quality_tests` | Regression test suite (Phase 2) |
| New view `brain_gaps` | Gap aggregation for admin UI |

---

## 6. Enrichment Trigger (Research Question 4)

**Recommendation: Gap detection → MC task → human-in-the-loop remediation.**

### 6.1 Automated Gap-to-Task Pipeline

When a gap is detected (via `brain_gaps` view with `hit_count >= 3`), the system should create an MC task:

```
emit_business_task(
  title: "Brain gap: {query_preview} ({layer}, {hit_count}x)",
  domain: "tech",
  priority: hit_count >= 5 ? "high" : "medium",
  created_by: "brain-quality-monitor",
  tags: ["brain-gap", layer],
  related_ids: {
    layer: layer,
    query_count: hit_count,
    first_seen: first_seen,
    agents_affected: agents_affected
  }
)
```

**Trigger:** Scheduled task (daily) or agent session-start check.

**Deduplication:** Before creating a new MC task, check if one already exists with tag `brain-gap` and similar title. Prevent duplicate tasks for the same gap.

### 6.2 Remediation Actions by Layer

| Layer | Gap Type | Remediation |
|-------|----------|-------------|
| L2 (LightRAG) | Missing knowledge | Add document via `POST /documents/text` or update existing doc in `docs/bible/` → re-index |
| L2 (LightRAG) | Wrong extraction | Re-ingest specific document (delete + re-add) or fix via `ainsert_custom_kg` |
| L1 (MemPalace) | Missing conversation context | Agent adds drawer via `mempalace_add_drawer` with the missing knowledge |
| L1 (MemPalace) | Wrong association | Delete incorrect drawer, add corrected version |

### 6.3 Cross-Agent Learning (MemPalace Tunnel)

When Chef discovers knowledge relevant to Finance (or vice versa), the current pattern is:
1. Chef writes to `wing_kitchen` in MemPalace.
2. Finance never sees it (queries `wing_finance` only).

**Proposed mechanism:** Agents tag cross-domain insights with a shared room `cross-agent` in their wing. A nightly scan or session-start query checks `cross-agent` rooms in all wings for new drawers since last check. This is the "MemPalace tunnel" referenced in the original task description.

**Effort:** Low — it's a convention change in agent protocols, not a code change. Agents already have wing/room routing in their `AGENT.md` files.

---

## 7. Minimum Viable Schema

```sql
-- Migration: extend brain_query_log for quality tracking
-- Guard pattern per migration 103

ALTER TABLE public.brain_query_log
  ADD COLUMN IF NOT EXISTS layer TEXT DEFAULT 'L2',
  ADD COLUMN IF NOT EXISTS response_preview TEXT,
  ADD COLUMN IF NOT EXISTS quality_score SMALLINT
    CHECK (quality_score BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS quality_source TEXT
    CHECK (quality_source IN ('heuristic', 'llm-judge', 'ceo')),
  ADD COLUMN IF NOT EXISTS is_gap BOOLEAN DEFAULT false;

-- Index for quality queries
CREATE INDEX IF NOT EXISTS idx_brain_query_log_quality
  ON public.brain_query_log (quality_score, is_gap)
  WHERE quality_score IS NOT NULL;

-- Gap aggregation view
CREATE OR REPLACE VIEW public.brain_gaps AS
SELECT
  layer,
  LEFT(query_preview, 100) AS query_pattern,
  count(*) AS hit_count,
  min(ts) AS first_seen,
  max(ts) AS last_seen,
  round(avg(quality_score), 1) AS avg_score,
  array_agg(DISTINCT agent_id) FILTER (WHERE agent_id IS NOT NULL) AS agents
FROM public.brain_query_log
WHERE is_gap = true
GROUP BY layer, LEFT(query_preview, 100)
ORDER BY hit_count DESC;

-- Quality regression test suite (Phase 2)
CREATE TABLE IF NOT EXISTS public.brain_quality_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer TEXT NOT NULL CHECK (layer IN ('L1', 'L2')),
  query TEXT NOT NULL,
  expected_keywords TEXT[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_run_at TIMESTAMPTZ,
  last_score SMALLINT CHECK (last_score BETWEEN 1 AND 5),
  last_response_preview TEXT
);

-- RLS: same policy as brain_query_log
ALTER TABLE public.brain_quality_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY brain_quality_tests_read ON public.brain_quality_tests
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY brain_quality_tests_write ON public.brain_quality_tests
  FOR ALL TO service_role WITH CHECK (true);
```

---

## 8. Admin UI Integration

### 8.1 New "Quality" Tab in Brain Page

`apps/admin-panel/src/pages/brain/BrainPage.tsx` currently has 4 tabs: L2 Knowledge, L1 Memory, L3 Code, Cost.

Add a 5th tab: **Quality** (icon: `Activity` or `HeartPulse` from lucide-react).

```
{ to: '/brain/quality', label: 'Quality', icon: Activity }
```

### 8.2 Quality Tab Content

Three sections:

1. **Score Distribution:** Bar chart showing quality_score distribution (1-5) over the last 30 days. Reuse the chart pattern from `BrainCostPage`.

2. **Active Gaps:** Table from `brain_gaps` view — query pattern, hit count, layer, first/last seen, avg score. Each row has a "Create MC Task" button (reuse `emit_business_task` pattern).

3. **Recent Low-Score Queries:** Table of queries with `quality_score <= 2`, showing query_preview, response_preview, layer, agent_id, timestamp. Allows CEO to spot-check and thumbs-up/down.

### 8.3 QueryPlayground Enhancement

Add thumbs-up / thumbs-down buttons below query results in the existing `QueryPlayground` component. On click: `UPDATE brain_query_log SET quality_score = {5 or 1}, quality_source = 'ceo' WHERE id = {query_id}`.

---

## 9. Agent Protocol Changes

### 9.1 L1 Query Logging

Currently only L2 (LightRAG) queries are logged. L1 (MemPalace) queries are untracked.

**Change:** After each `mempalace_search` call, the calling agent (or the MemPalace HTTP wrapper `serve.py`) writes a row to `brain_query_log` with:
- `layer = 'L1'`
- `query_mode = 'semantic'`
- `query_preview = query text`
- `chunks_returned = result count`
- `response_preview = first result content (truncated)`
- Heuristic `quality_score` based on top similarity score

**Implementation options:**
- **(a) Middleware in `serve.py`:** Mirror what LightRAG does — intercept responses and log to Supabase. Cleanest approach.
- **(b) Agent-side logging:** Each agent logs after querying MemPalace. More work, inconsistent.

**Recommendation:** Option (a) — middleware in `serve.py`.

### 9.2 Session-Start Gap Check

At session start, agents should:
1. After `list_tasks(status="in_progress")`, also check `brain_gaps` for any high-hit-count gaps relevant to their domain.
2. If a gap in their domain exists with `hit_count >= 3`, mention it to CEO: "Brain has a recurring gap about {topic}. Want me to add this knowledge?"

**Implementation:** Add to agent `AGENT.md` session-start protocol. No code change — convention only.

### 9.3 Cross-Agent Room Convention

Add to each agent's `AGENT.md` Memory section:
- When discovering knowledge useful to another domain, write a MemPalace drawer to room `cross-agent` in the agent's own wing.
- At session start, check `cross-agent` room in sibling wings for new drawers.

---

## 10. Effort Estimates

| Component | Size | Notes |
|-----------|------|-------|
| **This spec** | S | 2-3 hours writing, no code |
| Migration: extend brain_query_log + brain_quality_tests | S | Single SQL file, ~50 lines |
| Heuristic scoring in LightRAG middleware | S | ~20 lines in existing middleware |
| L1 query logging middleware in serve.py | M | New middleware, Supabase client in Python |
| Nightly LLM judge batch script | M | Python script + scheduled task |
| Admin UI: Quality tab | M | New page component, charts, gap table |
| CEO thumbs-up/down in QueryPlayground | S | 2 buttons + Supabase update |
| Automated gap-to-MC-task pipeline | M | Script + deduplication logic |
| Quality gate regression suite | L | Scheduler + LLM judge + alerting |
| Agent protocol changes (AGENT.md) | S | Documentation only |

**Total for full implementation: L** (spread across 2-3 sprints).

**MVP (recommended first sprint):**
- Migration + heuristic scoring + L1 logging + Quality tab = **M** (1 sprint)
- This gives us data. Tier 1 judge and gap-to-task pipeline follow once we see patterns.

---

## 11. Risks and Non-Goals

### Risks

| Risk | Mitigation |
|------|------------|
| LLM judge hallucinating scores | Use rubric prompt; spot-check 10% of scores weekly via CEO review |
| L1 logging adds latency to MemPalace | Async logging (fire-and-forget Supabase insert) |
| Gap detection creates noise (too many MC tasks) | Threshold: only create tasks for `hit_count >= 3` |
| quality_score drift over time (model changes) | Regression test suite (Phase 2) anchors expectations |

### Explicit Non-Goals

- **Real-time quality scoring:** All scoring is post-hoc (batch or on-read). No inline latency penalty on queries.
- **User-facing quality indicators:** Agents should NOT tell the CEO "confidence: 3/5" — that erodes trust. Quality data is for system improvement, not UX.
- **L3 Graphify quality:** L3 is deferred. This spec covers L1 and L2 only.
- **Automated remediation:** Gaps are surfaced and tasked, not auto-fixed. Human-in-the-loop for knowledge changes.
- **RAGAS/DeepEval integration:** Overkill at current scale. Revisit if query volume exceeds 500/day or quality issues persist despite Tier 0+1 scoring.

---

## 12. References

### Internal

- `docs/plans/spec-shishka-brain.md` — 3-layer architecture, Phase 4 gateway (quality-aware routing depends on this spec)
- `docs/plans/spec-lightrag.md` — L2 quality gate Q1-Q3, Phase 1.5 trigger
- `docs/plans/spec-mempalace-phase2.md` — L1 quality gate, Section 6
- `services/supabase/migrations/103_brain_query_log.sql` — existing telemetry schema
- `apps/admin-panel/src/api/brainCost.ts` — pattern for reading brain_query_log from admin panel

### External — RAG Evaluation Research

- **RAGAS framework** ([docs.ragas.io](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/)) — industry-standard metrics: faithfulness, answer relevance, context precision/recall. Threshold recommendation: 0.75+ for production quality.
- **LLM-as-a-Judge pattern** ([evidentlyai.com](https://www.evidentlyai.com/llm-guide/llm-as-a-judge)) — scalable alternative to human labeling. Cost: $0.01-0.10/evaluation. Known biases: verbosity bias, position bias. Mitigate with structured rubric prompts.
- **Confident AI: RAG Evaluation Metrics** ([confident-ai.com](https://www.confident-ai.com/blog/rag-evaluation-metrics-answer-relevancy-faithfulness-and-more)) — answer relevancy vs faithfulness distinction. DeepEval recommended for CI/CD integration.
- **Self-Correcting RAG Systems** ([apxml.com](https://apxml.com/courses/large-scale-distributed-rag/chapter-6-advanced-rag-architectures-techniques/self-correcting-improving-rag)) — implicit feedback signals from user behavior and downstream task success. Multiple implicit signals combined for stronger quality indicator.
- **Feedback Adaptation for RAG** ([arxiv 2604.06647](https://arxiv.org/html/2604.06647)) — LLM uncertainty gap between RAG and no-RAG answers as unsupervised quality signal.
- **Langfuse LLM-as-a-Judge** ([langfuse.com](https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge)) — practical implementation patterns for batch evaluation with cost management through sampling.

---

## Provenance

- Created: 2026-04-11
- Author: Claude Code (research spike for MC task `f91580be`)
- Source: Tech-lead handoff comment on task `f91580be` + codebase analysis + web research
