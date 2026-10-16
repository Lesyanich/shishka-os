-- =============================================================================
-- 468_count_class_clear_stubs_and_deleted.sql
-- Follow-up to 463 (MC 1be5f592) — CEO decision 2026-10-16, option (c).
--
-- Context. nomenclature.count_class has two generations:
--   * mig 350 backfilled it heuristically (A = shelf life <= 5 d or cost >= 500)
--     and classed 485 rows, including rows that no stocktake can act on;
--   * mig 463 rewrites it from rolling 8-week purchase THB (spec section 3.3),
--     but only for the items v_analytics_abc_items has an opinion on, so it
--     cannot clear a stale class.
--
-- CEO's call: keep the union of both signals (a perishable worth counting even
-- without recent purchases stays classed), but strip the class from rows that
-- are indefensible under EITHER definition:
--   * RAW-AUTO-% import stubs — not canonical, nothing consumes them, they are
--     the thing MC 00a81c22 is backfilling away;
--   * soft-deleted items — not stocked, must never reach a count list.
--
-- Measured on prod before applying (2026-10-16):
--   485 rows classed; 29 to clear (28 stubs + 3 soft-deleted, 2 in both sets);
--   0 of them are class A, so the weekly A-list stays at 63 items;
--   0 rows carry count_class_source = 'manual', so no human classification is
--   being overridden anywhere by this migration.
--
-- count_class_source is deliberately left as it is: 904 rows already sit at
-- source='auto' with a NULL class, so that pairing is this table's existing
-- convention for "unclassified" and there is no reason to churn it.
--
-- Fires no triggers: every UPDATE trigger on nomenclature is scoped either to
-- other columns (cost_per_unit, price, is_web_visible, nutrition, card_version)
-- or to is_deleted going true. Verified against pg_trigger.
--
-- Idempotent and re-runnable.
-- =============================================================================

UPDATE nomenclature
SET count_class = NULL
WHERE count_class IS NOT NULL
  AND (
    product_code LIKE 'RAW-AUTO-%'
    OR COALESCE(is_deleted, false)
  );

-- -----------------------------------------------------------------------------
-- RULE-MIGRATION-TRACKING self-register (checksum NULL by rule)
-- -----------------------------------------------------------------------------
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '468_count_class_clear_stubs_and_deleted.sql',
  'claude-code',
  NULL,
  'Clear nomenclature.count_class on RAW-AUTO stubs and soft-deleted items; keeps the mig-350 + mig-463 union for real items (CEO option c, MC 1be5f592)'
)
ON CONFLICT DO NOTHING;
