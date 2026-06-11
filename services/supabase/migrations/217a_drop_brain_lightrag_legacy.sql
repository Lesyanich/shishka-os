-- ═══════════════════════════════════════════════════════════════
-- Migration 217a: Drop dead Brain v1 / LightRAG / MemPalace objects
--
-- Brain v2 Phase 0 (MC b1c255bc / 6b9fc2d5). Originally written 2026-05-29
-- but never applied (caught by reconciliation MC 835eb489). Re-scoped and
-- applied 2026-06-11 after CEO rule: "drop what Claude does not use, keep
-- what is used."
--
-- DESTRUCTIVE. CEO approved 2026-05-29, re-confirmed (conditional) 2026-06-11.
--
-- DROPPED (zero live code references on main, verified 2026-06-11):
--   * brain_gaps (view, created in 104)
--   * brain_quality_tests (created in 104, seeded in 105/107; 18 stale rows)
--   * LIGHTRAG_* tables both casings (auto-created by lightrag-server;
--     verified already absent in prod — IF EXISTS keeps this idempotent)
--
-- KEPT (live usage verified 2026-06-11):
--   * brain_query_log — apps/admin-panel/src/api/apiCost.ts still reads it
--     for the legacy-costs section of /api-cost. Drop only after that code
--     path is removed (backlogged).
--   * brain_inbox — Brain v2 inbox, active.
--   * EXTENSION vector (pgvector) — may be consumed by other features.
--   * Migration history rows 099/103/104/107 in migration_log — historical
--     record per RULE-MIGRATION-TRACKING.
--
-- Self-register: RULE-MIGRATION-TRACKING. Idempotent: re-runnable.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ── View first (depends on brain_query_log) ─────────────────────
-- INTENTIONAL DROP: Brain v2 Phase 0, view created in 104
DROP VIEW IF EXISTS public.brain_gaps;

-- ── Brain v1 quality telemetry table (no live code references) ──
-- INTENTIONAL DROP: Brain v2 Phase 0, table created in 104, seeded in 105/107
DROP TABLE IF EXISTS public.brain_quality_tests;

-- ── LightRAG storage tables (case-sensitive — created with double-
--    quoted identifiers by lightrag-server postgres_impl.py) ─────
-- INTENTIONAL DROP: Brain v2 Phase 0, LightRAG decommissioned (auto-created via 099)
DROP TABLE IF EXISTS public."LIGHTRAG_DOC_FULL";
-- INTENTIONAL DROP: Brain v2 Phase 0, LightRAG decommissioned
DROP TABLE IF EXISTS public."LIGHTRAG_DOC_CHUNKS";
-- INTENTIONAL DROP: Brain v2 Phase 0, LightRAG decommissioned
DROP TABLE IF EXISTS public."LIGHTRAG_VDB_ENTITY";
-- INTENTIONAL DROP: Brain v2 Phase 0, LightRAG decommissioned
DROP TABLE IF EXISTS public."LIGHTRAG_VDB_RELATION";
-- INTENTIONAL DROP: Brain v2 Phase 0, LightRAG decommissioned
DROP TABLE IF EXISTS public."LIGHTRAG_VDB_CHUNKS";
-- INTENTIONAL DROP: Brain v2 Phase 0, LightRAG decommissioned
DROP TABLE IF EXISTS public."LIGHTRAG_LLM_CACHE";
-- INTENTIONAL DROP: Brain v2 Phase 0, LightRAG decommissioned
DROP TABLE IF EXISTS public."LIGHTRAG_DOC_STATUS";
-- INTENTIONAL DROP: Brain v2 Phase 0, LightRAG lowercase variants
DROP TABLE IF EXISTS public.lightrag_doc_full;
-- INTENTIONAL DROP: Brain v2 Phase 0, LightRAG lowercase variant
DROP TABLE IF EXISTS public.lightrag_doc_chunks;
-- INTENTIONAL DROP: Brain v2 Phase 0, LightRAG lowercase variant
DROP TABLE IF EXISTS public.lightrag_vdb_entity;
-- INTENTIONAL DROP: Brain v2 Phase 0, LightRAG lowercase variant
DROP TABLE IF EXISTS public.lightrag_vdb_relation;
-- INTENTIONAL DROP: Brain v2 Phase 0, LightRAG lowercase variant
DROP TABLE IF EXISTS public.lightrag_vdb_chunks;
-- INTENTIONAL DROP: Brain v2 Phase 0, LightRAG lowercase variant
DROP TABLE IF EXISTS public.lightrag_llm_cache;
-- INTENTIONAL DROP: Brain v2 Phase 0, LightRAG lowercase variant
DROP TABLE IF EXISTS public.lightrag_doc_status;

-- ── Self-register per RULE-MIGRATION-TRACKING ───────────────────
INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
    '217a_drop_brain_lightrag_legacy.sql',
    'claude-code',
    'Brain v2 Phase 0 (re-scoped 2026-06-11, MC 835eb489): drop brain_quality_tests + brain_gaps view + LIGHTRAG_* tables. KEEPS brain_query_log (still read by admin /api-cost legacy section) and brain_inbox. CEO-approved conditional cleanup.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
