-- Migration 257: Menu taxonomy — customer umbrellas + subcategories
-- ============================================================================
-- Goal: customer-facing menu sections become "umbrellas" with subcategories,
-- decoupled from Loyverse POS grouping.
--
--   * Display hierarchy (parent_id / level + new is_menu_section flag) drives
--     how the SITE and ADMIN group the menu.
--   * loyverse_category_id (per leaf) independently drives POS grouping —
--     several subcategories can share one POS category (merged) or each get
--     its own (split).
--
-- Branch A — Manakish:  L2 umbrella "Manakish" → L3 Classic / Signature /
--   Premium. All three point at the EXISTING "Manaish" Loyverse category
--   (POS stays merged). Subcats inherit staff_code_prefix 'M' so existing
--   M-1..M-13 codes are untouched (trigger only assigns when staff_code NULL).
--
-- Branch B — Drinks:  existing L2 umbrella "🧋 Drinks" gains the full set of
--   L3 subcategories: Coffee, Smoothies (existing) + Lemonades, Shots (new) +
--   Juices (KP-FIN-JCE reparented) + Soft Drinks (lifted from L1). Each keeps
--   its OWN loyverse_category_id (POS split, as the owner prefers).
--
-- is_menu_section = the level the customer menu treats as a top-level section.
--   Grouping walks a dish up to its nearest is_menu_section ancestor; the
--   dish's own category below that becomes the subcategory subheader.
--
-- No 4th category level is introduced — everything stays within L1/L2/L3.
-- ============================================================================

BEGIN;

-- ── 0. Section flag ─────────────────────────────────────────────────────────
ALTER TABLE public.product_categories
  ADD COLUMN IF NOT EXISTS is_menu_section boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.product_categories.is_menu_section IS
  'True = this category is a top-level customer menu section (umbrella). '
  'Menu grouping walks a dish up to its nearest is_menu_section ancestor; '
  'the dish''s own category below that renders as a subcategory subheader.';

-- ── 1. Branch A: Manakish umbrella ──────────────────────────────────────────
-- 1a. Promote "🫓 Manaish" L3 → L2 umbrella under Kitchen Production.
UPDATE public.product_categories
SET level = 2,
    parent_id = '3afdc0d7-227b-4477-b276-7225aa93adcb',  -- Kitchen Production (L1)
    name = '🫓 Manakish',
    is_menu_section = true
WHERE code = 'KP-FIN-MAN';

-- 1b. Create the three tier subcategories (L3) under Manakish.
--     loyverse_category_id = the existing "Manaish" POS category → merged POS.
--     staff_code_prefix 'M' keeps numbering continuous; existing codes frozen.
INSERT INTO public.product_categories
  (code, name, level, parent_id, sort_order, default_fin_sub_code,
   staff_code_prefix, loyverse_category_id, is_active, is_menu_section)
SELECT v.code, v.name, 3,
       (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-MAN'),
       v.so, 4150, 'M',
       '87220132-10d1-4992-b165-2ba353f1178f',  -- existing "Manaish" Loyverse cat
       true, false
FROM (VALUES
  ('KP-FIN-MAN-CLA', 'Classic',   0),
  ('KP-FIN-MAN-SIG', 'Signature', 1),
  ('KP-FIN-MAN-PRE', 'Premium',   2)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;

-- 1c. Distribute manakish dishes into tiers by price.
--     <=59 Classic · 60-78 Signature · >=79 Premium · NULL price stays on the
--     umbrella (drafts/archived — admin-only, never customer-facing).
UPDATE public.nomenclature
SET category_id = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-MAN-CLA')
WHERE category_id = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-MAN')
  AND price IS NOT NULL AND price <= 59;

UPDATE public.nomenclature
SET category_id = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-MAN-PRE')
WHERE category_id = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-MAN')
  AND price IS NOT NULL AND price >= 79;

UPDATE public.nomenclature
SET category_id = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-MAN-SIG')
WHERE category_id = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-MAN')
  AND price IS NOT NULL AND price >= 60 AND price < 79;

-- ── 2. Branch B: Drinks umbrella ────────────────────────────────────────────
-- 2a. Mark the existing "🧋 Drinks" L2 as a menu section.
UPDATE public.product_categories
SET is_menu_section = true
WHERE code = 'KP-DRK';

-- 2b. New L3 subcategories: Lemonades + Shots (own POS categories created later
--     by the Loyverse category-sync; loyverse_category_id NULL for now).
INSERT INTO public.product_categories
  (code, name, level, parent_id, sort_order, default_fin_sub_code,
   staff_code_prefix, is_active, is_menu_section)
SELECT v.code, v.name, 3,
       (SELECT id FROM public.product_categories WHERE code = 'KP-DRK'),
       v.so, 4150, NULL, true, false
FROM (VALUES
  ('KP-DRK-LEM', '🍋 Lemonades', 3),
  ('KP-DRK-SHT', '⚡ Shots',     5)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;

-- 2c. Reparent "🧃 Juices" (KP-FIN-JCE) from Finished Dishes → Drinks.
UPDATE public.product_categories
SET parent_id = (SELECT id FROM public.product_categories WHERE code = 'KP-DRK'),
    level = 3,
    sort_order = 4,
    is_menu_section = false
WHERE code = 'KP-FIN-JCE';

-- 2d. Lift "🥤 Soft Drinks" (KP-DRK-SOF) from L1 → L3 under Drinks.
--     L3 requires default_fin_sub_code (chk_l3_fin_sub_code) → set 4150.
UPDATE public.product_categories
SET parent_id = (SELECT id FROM public.product_categories WHERE code = 'KP-DRK'),
    level = 3,
    sort_order = 6,
    default_fin_sub_code = COALESCE(default_fin_sub_code, 4150),
    is_menu_section = false
WHERE code = 'KP-DRK-SOF';

-- 2e. Order + flags for the existing Coffee / Smoothies leaves.
UPDATE public.product_categories SET sort_order = 1, is_menu_section = false WHERE code = 'KP-DRK-COF';
UPDATE public.product_categories SET sort_order = 2, is_menu_section = false WHERE code = 'KP-DRK-SMT';

-- 2f. Move dishes: Lemonades + Shots out of KP-FIN-JCE; Juices remain there.
UPDATE public.nomenclature
SET category_id = (SELECT id FROM public.product_categories WHERE code = 'KP-DRK-LEM')
WHERE product_code LIKE 'SALE-LEMONADE_%';

UPDATE public.nomenclature
SET category_id = (SELECT id FROM public.product_categories WHERE code = 'KP-DRK-SHT')
WHERE product_code LIKE 'SALE-SHOT_%';

-- 2g. Retire the empty duplicate drink leaves (0 dishes).
UPDATE public.product_categories
SET is_active = false
WHERE code IN ('KP-DRK-JCE', 'KP-DRK-HOT');

-- ── 3. Flag the remaining flat customer sections (unchanged, still L3) ───────
UPDATE public.product_categories
SET is_menu_section = true
WHERE code IN (
  'KP-FIN-BND',  -- 🎁 Bundles
  'KP-FIN-SLD',  -- 🥗 Salads
  'KP-FIN-APT',  -- 🥟 Appetizers & Sides
  'KP-FIN-DIP',  -- 🥣 Dips
  'KP-FIN-GRL',  -- 🍗 Proteins & Grills
  'KP-FIN-SCS',  -- 🌶️ Sauces (Retail)
  'KP-FIN-BRC',  -- 🥖 Bread & Crackers
  'KP-FIN-SDR',  -- 🥫 Sauces & Dressings
  'KP-FIN-CHO'   -- 🍫 Chocolate
);

-- ── 4. Validation ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_cla INT; v_sig INT; v_pre INT; v_lem INT; v_sht INT;
  v_man_l2 INT; v_drk_subcats INT;
BEGIN
  SELECT COUNT(*) INTO v_cla FROM nomenclature WHERE category_id = (SELECT id FROM product_categories WHERE code='KP-FIN-MAN-CLA');
  SELECT COUNT(*) INTO v_sig FROM nomenclature WHERE category_id = (SELECT id FROM product_categories WHERE code='KP-FIN-MAN-SIG');
  SELECT COUNT(*) INTO v_pre FROM nomenclature WHERE category_id = (SELECT id FROM product_categories WHERE code='KP-FIN-MAN-PRE');
  SELECT COUNT(*) INTO v_lem FROM nomenclature WHERE category_id = (SELECT id FROM product_categories WHERE code='KP-DRK-LEM');
  SELECT COUNT(*) INTO v_sht FROM nomenclature WHERE category_id = (SELECT id FROM product_categories WHERE code='KP-DRK-SHT');
  SELECT level INTO v_man_l2 FROM product_categories WHERE code='KP-FIN-MAN';
  SELECT COUNT(*) INTO v_drk_subcats FROM product_categories WHERE parent_id=(SELECT id FROM product_categories WHERE code='KP-DRK') AND is_active;

  -- Tolerant checks: per-tier counts drift as prices change (concurrent edits),
  -- so assert structure + the price-driven split landed something in each tier,
  -- not exact counts. Lemonades/Shots are product_code-keyed → stable.
  IF v_man_l2 <> 2 THEN RAISE EXCEPTION 'Manakish must be L2, got %', v_man_l2; END IF;
  IF (v_cla + v_sig + v_pre) < 10 THEN RAISE EXCEPTION 'Manakish tiers got only % priced dishes', (v_cla+v_sig+v_pre); END IF;
  IF v_cla < 1 OR v_sig < 1 OR v_pre < 1 THEN RAISE EXCEPTION 'A manakish tier is empty: cla % sig % pre %', v_cla, v_sig, v_pre; END IF;
  IF v_lem <> 4 THEN RAISE EXCEPTION 'Lemonades expected 4, got %', v_lem; END IF;
  IF v_sht <> 3 THEN RAISE EXCEPTION 'Shots expected 3, got %', v_sht; END IF;
  IF v_drk_subcats < 6 THEN RAISE EXCEPTION 'Drinks expected >=6 active subcats, got %', v_drk_subcats; END IF;

  RAISE NOTICE 'Taxonomy OK — Manakish[Cla %, Sig %, Pre %]  Drinks subcats %  Lemonades %  Shots %',
    v_cla, v_sig, v_pre, v_drk_subcats, v_lem, v_sht;
END $$;

INSERT INTO public.migration_log (filename, applied_at, applied_by, status, notes)
VALUES (
  '257_menu_taxonomy_umbrellas.sql',
  NOW(),
  'claude-code',
  'success',
  'Menu umbrellas + subcategories: Manakish L2 umbrella (Classic/Signature/Premium, POS merged); Drinks L2 umbrella (Coffee/Smoothies/Lemonades/Juices/Shots/Soft Drinks, POS split); is_menu_section flag; flat sections flagged.'
);

COMMIT;
