-- ═══════════════════════════════════════════════════════════════
-- Migration 218: Drop dead Brain v1 / LightRAG / MemPalace tables
--
-- Brain v2 Phase 0 (MC b1c255bc / 6b9fc2d5). PR #266 removed all code
-- references to these tables. This migration drops the orphan tables.
--
-- DESTRUCTIVE. CEO approved on 2026-05-29. Reversal requires re-running
-- migrations 099, 103, 104, 105 (lightrag-server auto-creates its own
-- LIGHTRAG_* tables on first boot if the service is ever revived).
--
-- DROPPED:
--   * brain_query_log (created in 103, extended in 104)
--   * brain_quality_tests (created in 104, seeded in 105)
--   * brain_gaps (view created in 104)
--   * LIGHTRAG_DOC_FULL, LIGHTRAG_DOC_CHUNKS, LIGHTRAG_VDB_ENTITY,
--     LIGHTRAG_VDB_RELATION, LIGHTRAG_VDB_CHUNKS, LIGHTRAG_LLM_CACHE,
--     LIGHTRAG_DOC_STATUS (auto-created by lightrag-server; drop only
--     if they exist — guarded by IF EXISTS)
--
-- KEPT:
--   * EXTENSION vector (pgvector) — may be consumed by other features
--     (embeddings, semantic search elsewhere). Drop separately if/when
--     confirmed no other consumer.
--   * Migration history rows 099/103/104/105 — DO NOT delete from
--     migration_log; they are historical record per RULE-MIGRATION-TRACKING.
--
-- Self-register: RULE-MIGRATION-TRACKING (engineering-rules.md /
-- technical-rules.md). Idempotent: re-runnable.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ── View first (depends on brain_query_log) ─────────────────────
-- INTENTIONAL DROP: Brain v2 Phase 0, view created in 104
DROP VIEW IF EXISTS public.brain_gaps;

-- ── Brain v1 quality + cost telemetry tables ────────────────────
-- INTENTIONAL DROP: Brain v2 Phase 0, table created in 104, seeded in 105
DROP TABLE IF EXISTS public.brain_quality_tests;
-- INTENTIONAL DROP: Brain v2 Phase 0, table created in 103, extended in 104
DROP TABLE IF EXISTS public.brain_query_log;

-- ── LightRAG storage tables (case-sensitive — created with double-
--    quoted identifiers by lightrag-server postgres_impl.py) ─────
--
-- Use IF EXISTS so the migration succeeds even if lightrag-server
-- never booted (in which case these were never created).
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

-- Also try lowercase form — some versions of lightrag-server may have
-- folded identifiers depending on Postgres folding rules.
-- INTENTIONAL DROP: Brain v2 Phase 0, LightRAG lowercase variant
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
    'Brain v2 Phase 0: drop orphan tables brain_query_log + brain_quality_tests + brain_gaps view + LIGHTRAG_* tables. CEO-approved destructive cleanup; code-side already zero refs after PR #266. Keeps pgvector extension and migration history.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
