-- 392 — fn_dish_allergen_status: a bought-in good with no BOM is UNKNOWN, not confident (MC 572c53b1)
-- CONTRACT-REVIEWED: CREATE OR REPLACE of one function that nothing outside this repo calls
-- yet, plus read-only SELECTs against menu_public for the asserts. No view, column, row or
-- tag is touched. contract-check.mjs green before and after apply across both endpoints.
--
-- Bug in 391, caught by verification before anything shipped.
--
-- fn_dish_allergen_status excluded the dish itself from the ingredient set (`td.nomenclature_id
-- <> p_dish_id`) on the assumption that a dish is always assembled from ingredients. Four
-- sellable items are not: they are bought-in goods sold as-is, with no BOM at all.
--
--   SALE-CHOC_DARK_70            -> {"allergens": [], "ingredients": 0, "confident": true}
--   SALE-CHOC_DARK_70_ALMOND     -> same  (contains almond)
--   SALE-CHOC_HIGH_COCOA_MILK    -> same  (contains MILK)
--   SALE-NO_SHELL_COCONUT        -> same
--
-- An empty ingredient set trivially satisfies "no unreviewed ingredients", so the function
-- reported full confidence in an empty allergen list for a milk chocolate. That is precisely
-- the failure the review ledger exists to prevent, and it would have published
-- "contains no allergens" for a dairy product.
--
-- FIX: drop the root exclusion. A node counts when it is a LEAF of the BOM tree and is not
-- packaging. For an assembled dish the root has children, so it is not a leaf and is excluded
-- exactly as before — behaviour for the other 56 dishes is unchanged. For a bought-in good the
-- root IS the leaf, so the good's own allergen_reviewed_at decides, which is correct: someone
-- has to read the wrapper.
--
-- All four are already on the unresolved list from 391 (they need their labels read), so they
-- correctly flip to confident=false and stay behind the publish gate.

CREATE OR REPLACE FUNCTION public.fn_dish_allergen_status(p_dish_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
  WITH RECURSIVE tree AS (
    SELECT p_dish_id AS nomenclature_id, 0 AS depth
    UNION ALL
    SELECT bs.ingredient_id, t.depth + 1
    FROM tree t
    JOIN public.bom_structures bs ON bs.parent_id = t.nomenclature_id
    WHERE t.depth < 10
  ),
  tree_distinct AS (SELECT DISTINCT nomenclature_id FROM tree),
  -- Every LEAF of the tree that is food. The root is included only when it has no BOM
  -- of its own — i.e. a bought-in good, where the good itself is the thing to review.
  food AS (
    SELECT td.nomenclature_id, n.product_code, n.name, n.allergen_reviewed_at
    FROM tree_distinct td
    JOIN public.nomenclature n ON n.id = td.nomenclature_id
    LEFT JOIN public.product_categories pc ON pc.id = n.category_id
    WHERE COALESCE(pc.code, '') NOT LIKE 'NF-%'
      AND NOT EXISTS (SELECT 1 FROM public.bom_structures b WHERE b.parent_id = td.nomenclature_id)
  ),
  allergens AS (
    SELECT DISTINCT tg.slug
    FROM tree_distinct td
    JOIN public.nomenclature_tags nt ON nt.nomenclature_id = td.nomenclature_id
    JOIN public.tags tg ON tg.id = nt.tag_id
    WHERE tg.tag_group = 'allergen'
  )
  SELECT jsonb_build_object(
    'allergens',   COALESCE((SELECT jsonb_agg(slug ORDER BY slug) FROM allergens), '[]'::jsonb),
    'ingredients', (SELECT count(*) FROM food),
    'unreviewed',  (SELECT count(*) FROM food WHERE allergen_reviewed_at IS NULL),
    'confident',   (SELECT count(*) FROM food) > 0
                   AND (SELECT count(*) FROM food WHERE allergen_reviewed_at IS NULL) = 0,
    'unreviewed_items', COALESCE(
      (SELECT jsonb_agg(product_code ORDER BY product_code)
       FROM food WHERE allergen_reviewed_at IS NULL), '[]'::jsonb)
  );
$function$;

COMMENT ON FUNCTION public.fn_dish_allergen_status(uuid) IS
  'Allergen answer for a dish PLUS its confidence. fn_dish_allergens returns [] both for "no allergens" and "never checked"; this distinguishes them. Counts every food LEAF of the BOM tree, including the item itself when it is a bought-in good with no BOM. confident=false when any leaf is unreviewed OR when there is nothing to judge at all. Never publish a dietary claim for a dish whose ->>''confident'' is false. MC 572c53b1.';

DO $$
DECLARE v_n int; v_conf int; v_tot int;
BEGIN
  -- the four bought-in goods must now be honest about not knowing
  SELECT count(*) INTO v_n
  FROM public.nomenclature n
  WHERE n.product_code IN ('SALE-CHOC_DARK_70','SALE-CHOC_DARK_70_ALMOND',
                           'SALE-CHOC_HIGH_COCOA_MILK','SALE-NO_SHELL_COCONUT')
    AND (public.fn_dish_allergen_status(n.id)->>'confident')::boolean;
  IF v_n > 0 THEN RAISE EXCEPTION '392 ABORT: % bought-in good(s) still claim confidence', v_n; END IF;

  -- Every dish that actually has a food ingredient must still count it — i.e. this change
  -- must not silently empty out an assembled dish's ingredient set.
  -- SALE-SMOOTHIE_CUSTOM is the one legitimate exception and is excluded by name below:
  -- its BOM is cup + lid + straw only, because it is the build-your-own smoothie and its
  -- food arrives as guest-chosen modifiers at order time. A build-your-own item can never
  -- carry a static allergen claim, so confident=false is the correct permanent answer for
  -- it, not a gap to be closed. Its allergens have to be computed per order from the
  -- chosen modifiers — logged separately, not solvable in this migration.
  SELECT count(*) INTO v_n
  FROM public.menu_public m JOIN public.nomenclature n ON n.id = m.id
  WHERE COALESCE(m.stock_state,'') <> 'coming_soon'
    AND n.product_code <> 'SALE-SMOOTHIE_CUSTOM'
    AND EXISTS (SELECT 1 FROM public.bom_structures b WHERE b.parent_id = n.id)
    AND (public.fn_dish_allergen_status(n.id)->>'ingredients')::int = 0;
  IF v_n > 0 THEN RAISE EXCEPTION '392 ABORT: % assembled dish(es) now count zero ingredients', v_n; END IF;

  -- and the build-your-own must indeed report no confidence rather than a false clean bill
  IF (SELECT (public.fn_dish_allergen_status(n.id)->>'confident')::boolean
      FROM public.nomenclature n WHERE n.product_code = 'SALE-SMOOTHIE_CUSTOM') THEN
    RAISE EXCEPTION '392 ABORT: SALE-SMOOTHIE_CUSTOM claims confidence it cannot have';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE (public.fn_dish_allergen_status(n.id)->>'confident')::boolean)
  INTO v_tot, v_conf
  FROM public.menu_public m JOIN public.nomenclature n ON n.id = m.id
  WHERE COALESCE(m.stock_state,'') <> 'coming_soon';

  RAISE NOTICE '392 OK: % of % sellable dishes confident', v_conf, v_tot;
END $$;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '392_fix_allergen_status_bomless_goods.sql',
  'claude-code',
  NULL,
  'Fixes a false-confidence bug introduced in 391: fn_dish_allergen_status excluded the dish itself from its ingredient set, so the 4 bought-in goods with no BOM (3 chocolates incl. a milk one, 1 coconut) reported confident=true over an empty allergen list. Now every food LEAF counts, including the item itself when it is bought-in, and zero ingredients can never mean confident. MC 572c53b1.'
)
ON CONFLICT DO NOTHING;
