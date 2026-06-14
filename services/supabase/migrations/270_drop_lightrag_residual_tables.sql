-- 270_drop_lightrag_residual_tables.sql
-- Brain v2 cleanup follow-up (MC b979c787): drop the remaining 10 LightRAG
-- base tables that 217a and 269 both missed. 217a assumed LightRAG objects
-- were "already absent" and used DROP IF EXISTS as a no-op — but a second
-- embedding-model generation (bge_m3) plus the doc/entity/relation chunk
-- tables survived. Discovered 2026-06-14 via `pg_class ilike 'lightrag%'`
-- (the earlier audits filtered on %embed%/%graph%/%brain% and missed names
-- like lightrag_entity_chunks).
--
-- All 10 verified dead 2026-06-14: zero live code references (repo grep),
-- no lightrag/mempalace service exists in the repo (decommissioned, D-001).
-- ~4500 rows / ~5.4 MB of stale embeddings — regenerable, no backup needed.
-- After this, `select count(*) from pg_class where relname ilike 'lightrag%'`
-- should be 0.
--
-- Self-register: RULE-MIGRATION-TRACKING. Idempotent: re-runnable.

BEGIN;

-- ── LightRAG doc/entity/relation chunk tables ───────────────────
-- INTENTIONAL DROP: LightRAG decommissioned, residue missed by 217a
DROP TABLE IF EXISTS public.lightrag_entity_chunks;
-- INTENTIONAL DROP: LightRAG decommissioned, residue missed by 217a
DROP TABLE IF EXISTS public.lightrag_relation_chunks;
-- INTENTIONAL DROP: LightRAG decommissioned, residue missed by 217a
DROP TABLE IF EXISTS public.lightrag_full_entities;
-- INTENTIONAL DROP: LightRAG decommissioned, residue missed by 217a
DROP TABLE IF EXISTS public.lightrag_full_relations;

-- ── bge_m3 (1024d) embedding generation — both pinned + latest ──
-- INTENTIONAL DROP: LightRAG decommissioned, alternate embedding model
DROP TABLE IF EXISTS public.lightrag_vdb_chunks_bge_m3_1024d;
-- INTENTIONAL DROP: LightRAG decommissioned, alternate embedding model
DROP TABLE IF EXISTS public.lightrag_vdb_chunks_bge_m3_latest_1024d;
-- INTENTIONAL DROP: LightRAG decommissioned, alternate embedding model
DROP TABLE IF EXISTS public.lightrag_vdb_entity_bge_m3_1024d;
-- INTENTIONAL DROP: LightRAG decommissioned, alternate embedding model
DROP TABLE IF EXISTS public.lightrag_vdb_entity_bge_m3_latest_1024d;
-- INTENTIONAL DROP: LightRAG decommissioned, alternate embedding model
DROP TABLE IF EXISTS public.lightrag_vdb_relation_bge_m3_1024d;
-- INTENTIONAL DROP: LightRAG decommissioned, alternate embedding model
DROP TABLE IF EXISTS public.lightrag_vdb_relation_bge_m3_latest_1024d;

-- ── Self-register per RULE-MIGRATION-TRACKING ───────────────────
INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
    '270_drop_lightrag_residual_tables.sql',
    'claude-code',
    'Brain v2 cleanup (MC b979c787): drop 10 residual LightRAG tables (bge_m3 embeddings + chunk/entity/relation base tables) missed by 217a/269. ~4500 rows, no code refs. CEO-approved 2026-06-14.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
