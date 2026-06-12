-- 269_drop_lightrag_vdb_embedding_tables.sql
-- Brain v2 Phase 1 follow-up (MC b979c787): drop the 3 LightRAG vector
-- tables that 217a missed. 217a dropped the plain lowercase names
-- (lightrag_vdb_entity, ...) but lightrag-server postgres_impl.py also
-- auto-created embedding-model-suffixed variants which survived:
--   * lightrag_vdb_chunks_text_embedding_3_small_1536d    (123 rows)
--   * lightrag_vdb_entity_text_embedding_3_small_1536d    (1326 rows)
--   * lightrag_vdb_relation_text_embedding_3_small_1536d  (1045 rows)
-- Last written 2026-04-11; zero live code references (verified by repo
-- grep 2026-06-11 — only docs/specs mention lightrag). Data = embeddings
-- of a stale repo snapshot, regenerable, no backup needed.
--
-- Self-register: RULE-MIGRATION-TRACKING. Idempotent: re-runnable.

BEGIN;

-- INTENTIONAL DROP: Brain v2 Phase 0 leftover, LightRAG decommissioned
DROP TABLE IF EXISTS public.lightrag_vdb_chunks_text_embedding_3_small_1536d;
-- INTENTIONAL DROP: Brain v2 Phase 0 leftover, LightRAG decommissioned
DROP TABLE IF EXISTS public.lightrag_vdb_entity_text_embedding_3_small_1536d;
-- INTENTIONAL DROP: Brain v2 Phase 0 leftover, LightRAG decommissioned
DROP TABLE IF EXISTS public.lightrag_vdb_relation_text_embedding_3_small_1536d;

-- ── Self-register per RULE-MIGRATION-TRACKING ───────────────────
INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
    '269_drop_lightrag_vdb_embedding_tables.sql',
    'claude-code',
    'Brain v2 Phase 1 (MC b979c787): drop 3 embedding-suffixed lightrag_vdb_* tables missed by 217a. Orphans since 2026-04-11, no code references.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
