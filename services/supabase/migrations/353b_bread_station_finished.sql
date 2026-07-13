-- 353b_bread_station_finished.sql
-- Bread is a reheat/finished station too (CEO 2026-07-03): it holds finished PF
-- bases and reheats/grills them to order. Unlike manakish, the bread SALE dishes
-- were ALREADY modelled as `1x PF-base + packaging` (no BOM re-level needed) —
-- so only the count_mode flips.
--
-- In finished mode the bread checklist collapses to the 3 physical bases it holds:
--   PF-MINI_BUN · PF-MANAISH_DOUGH_POTATO (for pitas) · PF-SEED_CRACKERS  (+ packaging).
-- SALE pack variants (Mini Bun x1/x2, Pita single/set3) share ONE base PF and
-- de-duplicate to a single count line; their BOM quantity is the sale-deduction
-- multiplier, NOT a separate stock item.
UPDATE public.stations SET count_mode = 'finished' WHERE code = 'bread';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('353b_bread_station_finished.sql','claude-code',NULL,
  'Station stock v1: bread station = finished count_mode (counts the 3 held PF bases, not their raw ingredients). Bread SALE dishes already PF-base+packaging, so no BOM re-level — flag only.')
ON CONFLICT DO NOTHING;
