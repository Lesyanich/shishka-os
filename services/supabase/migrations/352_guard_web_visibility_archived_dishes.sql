-- 352_guard_web_visibility_archived_dishes.sql
-- Hotfix + permanent guard: archived / soft-deleted dishes must NEVER appear on shishka.health.
--
-- INCIDENT 2026-07-03: "[ARCHIVED] Manaish Chicken, Shrimp & Cheese (WW)"
--   (SALE-MANAISH-CHICKEN-SHRIMP) leaked onto the public Manakish section as an empty,
--   price-less card (is_available=false, price=null) — visible to customers.
--
-- ROOT CAUSE: archiving a dish is a MANUAL, multi-step admin action (rename ->
--   "[ARCHIVED] ...", toggle is_available off) that is DECOUPLED from website visibility.
--   The `menu_public` view (mig 263) gates the public site on `is_web_visible = true` ALONE
--   — it ignores the archived name marker, is_available and is_deleted. Whoever archived this
--   dish forgot to also flip the separate "Show on site" toggle (is_web_visible), so the row
--   stayed live. All 9 sibling archived Manakish had is_web_visible=false and were correctly
--   hidden — this was the one that slipped. The admin owner-table even shows a 'warn' badge for
--   this state (on-site + unavailable) but nothing hard-stopped it reaching the customer.
--
-- FIX (two layers, defence in depth):
--   L1  Harden `menu_public`: exclude archived-named and soft-deleted rows even if
--       is_web_visible is (mistakenly) left true. Cannot hide a legit dish — no live dish is
--       named "[ARCHIVED]..." or is_deleted. security_invoker=false is preserved (anon has NO
--       SELECT on nomenclature; a security-invoker view -> permission denied -> site falls back
--       to MOCK_DATA — see gotcha_db_and_migrations / reference_menu_site_data_contract).
--   L2  Write-time trigger `trg_guard_web_visible_when_archived`: on INSERT / UPDATE of
--       name|is_deleted|is_web_visible, force is_web_visible=false whenever the row is archived
--       (name ILIKE '[ARCHIVED]%') or soft-deleted. This is the ROOT-CAUSE fix — the flag can no
--       longer be left inconsistent, regardless of which UI / SQL / session performs the archive.
--       Fires BEFORE trg_set_web_published_at (alphabetical order) so the published-at logic sees
--       the corrected value.
--
-- NOTE: is_available is intentionally NOT part of the guard. A temporarily sold-out dish may be
--   legitimately shown on the site (admin surfaces it as a 'warn' badge, not forbidden). Only the
--   permanent archive/delete state hard-hides.
BEGIN;

-- 1. Backfill: hide any currently-leaking archived/deleted rows (idempotent) -----------------
UPDATE public.nomenclature
SET is_web_visible = false
WHERE is_web_visible = true
  AND (name ILIKE '[ARCHIVED]%' OR COALESCE(is_deleted, false) = true);

-- 2. Harden the public menu view (defence in depth) -----------------------------------------
CREATE OR REPLACE VIEW public.menu_public
WITH (security_invoker = false) AS
 SELECT n.id, n.product_code, n.name, n.customer_short_name, n.customer_photo_url,
    n.image_url, n.customer_description, n.price, n.is_available, n.is_featured,
    n.pos_status, n.calories, n.protein, n.carbs, n.fat, n.portion_size, n.portion_unit,
    n.category_id, n.display_order,
    c.code AS category_code, c.name AS category_name, c.sort_order AS category_sort_order,
    n.customer_ingredients, n.stock_state,
    s.id AS section_id, s.name AS section_name, s.sort_order AS section_sort_order,
    n.is_web_visible, n.web_published_at
   FROM nomenclature n
     LEFT JOIN product_categories c ON c.id = n.category_id
     LEFT JOIN product_categories s ON s.id =
        CASE WHEN c.is_menu_section THEN c.id ELSE c.parent_id END
  WHERE n.product_code LIKE 'SALE-%'
    AND n.is_web_visible = true
    AND COALESCE(n.is_deleted, false) = false
    AND (n.name IS NULL OR n.name NOT ILIKE '[ARCHIVED]%');

-- 3. Write-time root-cause guard: archived/deleted rows can never be web-visible -------------
CREATE OR REPLACE FUNCTION public.fn_guard_web_visible_when_archived()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_web_visible IS TRUE
     AND (NEW.name ILIKE '[ARCHIVED]%' OR COALESCE(NEW.is_deleted, false) = true)
  THEN
    NEW.is_web_visible := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_web_visible_when_archived ON public.nomenclature;
CREATE TRIGGER trg_guard_web_visible_when_archived
  BEFORE INSERT OR UPDATE OF name, is_deleted, is_web_visible ON public.nomenclature
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_web_visible_when_archived();

-- 4. Self-register in migration_log (RULE-MIGRATION-TRACKING) --------------------------------
INSERT INTO public.migration_log (filename, notes, checksum)
VALUES (
  '352_guard_web_visibility_archived_dishes.sql',
  'Archived/soft-deleted dishes can no longer leak onto shishka.health. L1: menu_public view excludes name ILIKE [ARCHIVED]% and is_deleted even if is_web_visible=true (security_invoker=false preserved). L2: BEFORE INSERT/UPDATE trigger trg_guard_web_visible_when_archived forces is_web_visible=false when archived/deleted. Backfilled leaking row SALE-MANAISH-CHICKEN-SHRIMP. Root cause: manual archive flow decoupled from is_web_visible toggle.',
  NULL
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
