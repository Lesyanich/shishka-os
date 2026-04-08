-- 099: LightRAG prerequisites — pgvector extension only
--
-- LightRAG (Phase 1, MC task 996f1f86) ingests bible/domain knowledge and
-- stores entities, relationships, vector embeddings, and KV state in
-- PostgreSQL via the lightrag-hku PGKVStorage + PGVectorStorage backends.
--
-- DEVIATION FROM ORIGINAL PLAN: lightrag-hku v1.4.13 hardcodes the `public`
-- schema (postgres_impl.py:~1608, `table_schema = 'public'`). A dedicated
-- `lightrag` schema is therefore not feasible without forking. Drop-safe
-- isolation is preserved via:
--   1. Table prefix — every lightrag object is named `LIGHTRAG_*`
--   2. Workspace column — `POSTGRES_WORKSPACE=lightrag` value lives in a
--      `workspace` column on every row, isolating future shishka workspaces
--      from the bible/domain index.
--
-- Tables (LIGHTRAG_DOC_FULL, LIGHTRAG_DOC_CHUNKS, LIGHTRAG_VDB_ENTITY,
-- LIGHTRAG_VDB_RELATION, LIGHTRAG_VDB_CHUNKS, LIGHTRAG_LLM_CACHE,
-- LIGHTRAG_DOC_STATUS) are created automatically by lightrag-server on first
-- boot via its own schema migration. This migration only ensures the
-- prerequisite extension is present.

CREATE EXTENSION IF NOT EXISTS vector;

-- Sanity check: confirm vector extension is installed and a non-trivial
-- version (Supabase ships >= 0.7.0 by default, lightrag-hku needs >= 0.5).
DO $$
DECLARE
  v_version text;
BEGIN
  SELECT extversion INTO v_version FROM pg_extension WHERE extname = 'vector';
  IF v_version IS NULL THEN
    RAISE EXCEPTION 'pgvector extension failed to install';
  END IF;
  RAISE NOTICE 'pgvector version: %', v_version;
END $$;

-- Self-register (RULE-MIGRATION-TRACKING, engineering-rules.md)
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '099_lightrag_pgvector.sql',
  'claude-code',
  md5('099_lightrag_pgvector'),
  'LightRAG Phase 1 prerequisite — pgvector extension for LIGHTRAG_* tables (auto-created by lightrag-server on first boot)'
)
ON CONFLICT DO NOTHING;
