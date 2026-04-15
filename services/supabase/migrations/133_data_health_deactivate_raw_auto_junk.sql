-- ============================================================
-- Migration 133: Data Health — Deactivate remaining RAW-AUTO non-ingredient rows
--
-- Block 3 of the follow-up cleanup for spec:
--   docs/superpowers/specs/2026-04-14-data-health-makro-design.md
--
-- Problem: 31 RAW-AUTO-* items remain active after the auto-merge pass. Inspection
-- shows they all share three properties:
--   1. Non-food content: packaging (ARO boxes/bags/bowls/lids/parchment, PET lids,
--      Disney shopping bag, zipper bags), bottled water (19L, 20L, 2000L — labels
--      vary by OCR quirk), OCR junk ("Item N", "Miscellaneous Purchase Item",
--      "Product return", "Whittaker's"), and flavored gelatin (not used in kitchen)
--   2. Zero BOM references — nothing cooks these
--   3. They were each auto-created by the old receipt parser from a single
--      purchase_logs row; the expense trail is preserved
--
-- The nomenclature table's type constraint does not include a 'good' / 'packaging'
-- class, so reclassification would require a schema extension. The pragmatic fix
-- is to deactivate these rows (is_available=false) — this:
--   - Removes them from v_data_health checks (all metrics filter is_available=true)
--   - Hides them from BOM/menu pickers without dropping the FK chain
--   - Keeps purchase_logs and expense history intact for audit
--   - Prevents the new parser (v13) from matching against them in Level 2/3
--
-- Migration 130 (fn_approve_receipt v13, already live) no longer creates new
-- RAW-AUTO rows — future unmatched items land in unmatched_items queue instead.
--
-- Safety: reversible (is_available can be flipped back); FK chain untouched.
-- ============================================================

UPDATE public.nomenclature
   SET is_available = FALSE,
       updated_at   = now()
 WHERE product_code LIKE 'RAW-AUTO-%'
   AND is_available = TRUE;

-- Self-register
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '133_data_health_deactivate_raw_auto_junk.sql',
  'claude-code',
  NULL,
  'Deactivate 31 remaining RAW-AUTO-* non-ingredient rows (packaging/water/OCR junk, 0 BOM refs). Expense trail preserved.'
) ON CONFLICT (filename) DO NOTHING;
