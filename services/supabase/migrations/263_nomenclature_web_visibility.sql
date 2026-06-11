-- Migration 263: independent website visibility for dishes
-- ============================================================================
-- The customer site (shishka-health) reads `menu_public` LIVE — a dish appears
-- the instant it passes the view filter. Until now that filter was COUPLED to
-- Loyverse/availability:
--   product_code LIKE 'SALE-%' AND is_available AND (pos_status='synced' OR
--   stock_state<>'in_stock')
-- so you could not put a dish on the website without it being synced to Loyverse
-- POS, and hiding from the web also hid it from POS availability.
--
-- This migration decouples the website from POS with a dedicated owner switch:
--   * is_web_visible (bool, default false) — the SOLE gate for the showcase site.
--   * web_published_at (timestamptz) — stamped on the false->true transition so
--     the admin can show "on site since …" (answers "when was it put on site").
-- is_available / pos_status / stock_state stay in the view OUTPUT (the site still
-- uses stock_state to grey out items and is_available for ordering state) but no
-- longer gate visibility.
--
-- Default false = explicit-publish model: a new dish is hidden from the web until
-- the owner flips "Show on site". The backfill below sets is_web_visible=true for
-- exactly the dishes that are live TODAY, so the public site is unchanged at the
-- cutover (72 SALE dishes as of 2026-06-09).
-- ============================================================================

-- 1. Columns
ALTER TABLE public.nomenclature
  ADD COLUMN IF NOT EXISTS is_web_visible boolean NOT NULL DEFAULT false;

ALTER TABLE public.nomenclature
  ADD COLUMN IF NOT EXISTS web_published_at timestamptz;

COMMENT ON COLUMN public.nomenclature.is_web_visible IS
  'Owner switch: dish is shown on the customer website (menu_public gate). Decoupled from Loyverse/is_available. Default false = explicit publish.';
COMMENT ON COLUMN public.nomenclature.web_published_at IS
  'Timestamp of the last time is_web_visible was turned on (false->true). NULL = never published to web. Maintained by trigger trg_set_web_published_at.';

-- 2. Trigger — stamp web_published_at when a dish is (re)published to the web.
--    Fires on INSERT (OLD is NULL) and on UPDATE of is_web_visible. Sticky: a
--    true->true no-op does not restamp, so the value records the last publish.
CREATE OR REPLACE FUNCTION public.fn_set_web_published_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_web_visible AND NOT COALESCE(OLD.is_web_visible, false) THEN
    NEW.web_published_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_web_published_at ON public.nomenclature;
CREATE TRIGGER trg_set_web_published_at
  BEFORE INSERT OR UPDATE OF is_web_visible ON public.nomenclature
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_web_published_at();

-- 3. Backfill — preserve the live site exactly. Mark currently-visible SALE
--    dishes as web-visible (trigger stamps web_published_at = NOW()).
UPDATE public.nomenclature
SET is_web_visible = true
WHERE product_code LIKE 'SALE-%'
  AND is_available = true
  AND (pos_status = 'synced'::pos_status_enum OR stock_state <> 'in_stock');

-- 4. Redefine menu_public — gate on is_web_visible, expose the two new columns.
--    Keeps SECURITY DEFINER (security_invoker = false, per mig 256) so the anon
--    key reads the curated projection. New columns are appended at the end
--    (CREATE OR REPLACE VIEW requirement). All previously-exposed columns are
--    retained — the site reads is_available / pos_status / stock_state.
CREATE OR REPLACE VIEW public.menu_public WITH (security_invoker = false) AS
SELECT
  n.id,
  n.product_code,
  n.name,
  n.customer_short_name,
  n.customer_photo_url,
  n.image_url,
  n.customer_description,
  n.price,
  n.is_available,
  n.is_featured,
  n.pos_status,
  n.calories,
  n.protein,
  n.carbs,
  n.fat,
  n.portion_size,
  n.portion_unit,
  n.category_id,
  n.display_order,
  c.code AS category_code,
  c.name AS category_name,
  c.sort_order AS category_sort_order,
  n.customer_ingredients,
  n.stock_state,
  s.id AS section_id,
  s.name AS section_name,
  s.sort_order AS section_sort_order,
  n.is_web_visible,
  n.web_published_at
FROM nomenclature n
LEFT JOIN product_categories c ON c.id = n.category_id
LEFT JOIN product_categories s
  ON s.id = CASE WHEN c.is_menu_section THEN c.id ELSE c.parent_id END
WHERE n.product_code ~~ 'SALE-%'::text
  AND n.is_web_visible = true;

INSERT INTO public.migration_log (filename, applied_at, applied_by, status, notes)
VALUES (
  '263_nomenclature_web_visibility.sql', NOW(), 'claude-code', 'success',
  'Add nomenclature.is_web_visible (default false) + web_published_at + trigger; backfill currently-live SALE dishes; menu_public now gates on is_web_visible (decoupled from Loyverse/is_available) and exposes both columns.'
);
