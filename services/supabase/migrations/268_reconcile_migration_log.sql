-- 268_reconcile_migration_log.sql
-- Reconciles migration_log with the repo after the log<->repo audit
-- (MC task 835eb489, follow-up to renumbering 7e4f0f9c / PR #331).
-- Three groups of fixes:
--   1. Rename 4 log rows for files recovered from local branches/worktrees
--      and re-slotted with letter suffixes (262a, 264a-c).
--   2. Backfill log rows for 12 files that were applied historically but
--      never self-registered. applied_at = git first-commit date (best
--      available proxy); effects verified against prod where possible.
--   3. Tombstone notes on 3 rows whose SQL files were applied from sessions
--      that never committed them — not recoverable from git.
-- Intentionally NOT touched: 217a_drop_brain_lightrag_legacy.sql is a genuine
-- PENDING migration (LIGHTRAG_* tables are gone but brain_* tables still exist
-- in prod) — it stays unlogged until actually applied.

-- 1. Recovered + re-slotted files ------------------------------------------

UPDATE migration_log SET filename = '262a_packaging_display_fixes.sql',
  notes = COALESCE(notes, '') || ' [renamed from 263_packaging_display_fixes.sql; file recovered from local branch claude/elegant-poincare-9331ce, reconcile 2026-06-11]'
  WHERE filename = '263_packaging_display_fixes.sql';

UPDATE migration_log SET filename = '264a_staff_task_tracker.sql',
  notes = COALESCE(notes, '') || ' [renamed from 264_staff_task_tracker.sql; file recovered from uncommitted worktree, reconcile 2026-06-11]'
  WHERE filename = '264_staff_task_tracker.sql';

UPDATE migration_log SET filename = '264b_telegram_link_codes.sql',
  notes = COALESCE(notes, '') || ' [renamed from 265_telegram_link_codes.sql; file recovered from uncommitted worktree, reconcile 2026-06-11]'
  WHERE filename = '265_telegram_link_codes.sql';

UPDATE migration_log SET filename = '264c_staff_tasks_reminder_sent.sql',
  notes = COALESCE(notes, '') || ' [renamed from 266_staff_tasks_reminder_sent.sql; file recovered from uncommitted worktree, reconcile 2026-06-11]'
  WHERE filename = '266_staff_tasks_reminder_sent.sql';

-- 2. Backfill rows for applied-but-never-registered files -------------------
-- applied_at = git first-commit date (UTC). Verification evidence in notes.

INSERT INTO migration_log (filename, applied_at, applied_by, status, checksum, notes) VALUES
('099_lightrag_pgvector.sql',                  '2026-04-08 09:48+00', 'claude-code', 'success', NULL, 'Backfilled 2026-06-11 (MC 835eb489): never self-registered. Verified: pgvector extension exists.'),
('108_fix_self_register_checksums.sql',        '2026-04-11 15:08+00', 'claude-code', 'success', NULL, 'Backfilled 2026-06-11 (MC 835eb489): never self-registered. Checksum cleanup on migration_log itself.'),
('142a_fix_conversion_factor_cost.sql',        '2026-04-20 12:15+00', 'claude-code', 'success', NULL, 'Backfilled 2026-06-11 (MC 835eb489): never self-registered. Verified: conversion_factor_audit table exists.'),
('143_auto_conversion_factor.sql',             '2026-04-20 12:15+00', 'claude-code', 'success', NULL, 'Backfilled 2026-06-11 (MC 835eb489): never self-registered. Verified: fn_auto_conversion_factor exists.'),
('168a_data_health_product_code_hygiene.sql',  '2026-05-04 13:27+00', 'claude-code', 'success', NULL, 'Backfilled 2026-06-11 (MC 835eb489): never self-registered. Verified: data_health product-code rule seeded.'),
('174_financial_dashboard.sql',                '2026-05-14 10:50+00', 'claude-code', 'success', NULL, 'Backfilled 2026-06-11 (MC 835eb489): never self-registered. Verified: cash_snapshots + financial_obligations tables exist.'),
('178_cleanup_hash_coded_nomenclature.sql',    '2026-05-15 16:34+00', 'claude-code', 'success', NULL, 'Backfilled 2026-06-11 (MC 835eb489): never self-registered. Data fix; assumed applied (not retroactively verifiable).'),
('191_merge_duplicate_sangdamrong.sql',        '2026-05-17 12:47+00', 'claude-code', 'success', NULL, 'Backfilled 2026-06-11 (MC 835eb489): never self-registered. Verified: single Sangdamrong supplier remains.'),
('198a_fix_supplier_catalog_sugar_linkage.sql','2026-05-18 09:52+00', 'claude-code', 'success', NULL, 'Backfilled 2026-06-11 (MC 835eb489): never self-registered. Data fix; assumed applied (not retroactively verifiable).'),
('206_fix_4_manakish_ingredients.sql',         '2026-05-20 11:56+00', 'claude-code', 'success', NULL, 'Backfilled 2026-06-11 (MC 835eb489): never self-registered. Data fix; assumed applied (not retroactively verifiable).'),
('207_set_cost_14_bom_ingredients.sql',        '2026-05-20 11:56+00', 'claude-code', 'success', NULL, 'Backfilled 2026-06-11 (MC 835eb489): never self-registered. Data fix; assumed applied (later WAC updates may have changed values).'),
('250b_visitor_site_public_menu.sql',          '2026-06-07 15:13+00', 'claude-code', 'success', NULL, 'Backfilled 2026-06-11 (MC 835eb489): never self-registered. Verified: site_content table exists; menu_public view since redefined by later migrations.')
ON CONFLICT (filename) DO NOTHING;

-- 3. Tombstones: applied, but the SQL file was never committed anywhere -----

UPDATE migration_log SET
  notes = COALESCE(notes, '') || ' [TOMBSTONE 2026-06-11 (MC 835eb489): SQL file lost — applied from a session that never committed it; not recoverable from git. Effects remain live in prod; a fresh replay will skip this step.]'
  WHERE filename IN (
    '110_fix_business_tasks_rls_policy.sql',
    '144_bom_nutrition_rollup.sql',
    '228_salad_bar_portion_scoops.sql'
  );

-- Self-register (RULE-MIGRATION-TRACKING)
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '268_reconcile_migration_log.sql',
  'claude-code',
  NULL,
  'Reconcile migration_log with repo: 4 recovered-file renames, 12 backfills, 3 tombstones (MC 835eb489)'
)
ON CONFLICT (filename) DO NOTHING;
