-- ============================================================
-- Migration 132: Data Health — Resolve duplicate active names
--
-- Block 2 of the follow-up cleanup for spec:
--   docs/superpowers/specs/2026-04-14-data-health-makro-design.md
--
-- Problem: 2 duplicate_names errors in v_data_health:
--   - "Coconut Yogurt" × 3 rows: MOD-COCONUT_YOGURT, RAW-COCONUT-YOGURT, RAW-YOGURT-COCONUT
--   - "Sour Cream"     × 2 rows: MOD-SOUR_CREAM, RAW-SOUR-CREAM
--
-- Investigation revealed that MOD-* rows are customer-facing add-on products whose
-- BOM consumes the RAW-* inventory row — a valid modeling pattern. The MOD and RAW
-- share a name by convention but represent different layers (product vs ingredient).
--   MOD-COCONUT_YOGURT.bom = (RAW-COCONUT-YOGURT, qty=1) — roll up cost
--   MOD-SOUR_CREAM.bom     = (RAW-SOUR-CREAM, qty=1)     — roll up cost
--   SALE-BORSCH_BIOACTIVE.bom includes (MOD-SOUR_CREAM, qty=0) — optional add-on
--
-- The real duplicate is RAW-YOGURT-COCONUT: 0 references anywhere, same name as
-- RAW-COCONUT-YOGURT, clearly a leftover from an earlier naming/merge pass.
--
-- Fix:
--   a) Rename MOD names by appending " (Add-on)" to disambiguate
--   b) Deactivate RAW-YOGURT-COCONUT (orphan duplicate)
--
-- Safety:
--   - Only name change on MOD — all FK references survive (FK uses id, not name)
--   - Deactivation via is_available=false is reversible, does not drop data
--   - No-op if already applied (WHERE clauses target the exact current state)
-- ============================================================

-- (a) Disambiguate MOD names — they are customer-visible modifiers, not raw items
UPDATE public.nomenclature
   SET name       = name || ' (Add-on)',
       updated_at = now()
 WHERE id IN (
   '6d72a9f0-e4ba-4f73-be95-3de5385820fb',  -- MOD-COCONUT_YOGURT
   'f2bee707-7562-4c8e-bd2f-f69368392b9b'   -- MOD-SOUR_CREAM
 )
   AND name NOT LIKE '% (Add-on)';  -- idempotency guard

-- (b) Deactivate orphan duplicate RAW (0 BOM/purchase/catalog refs — verified)
UPDATE public.nomenclature
   SET is_available = FALSE,
       updated_at   = now()
 WHERE id = '6b657746-89db-44ea-b6cd-73404591b0aa'  -- RAW-YOGURT-COCONUT
   AND is_available = TRUE;  -- idempotency guard

-- Self-register
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '132_data_health_resolve_duplicate_names.sql',
  'claude-code',
  NULL,
  'Rename MOD add-on products to disambiguate from RAW ingredients; deactivate orphan duplicate RAW-YOGURT-COCONUT.'
) ON CONFLICT (filename) DO NOTHING;
