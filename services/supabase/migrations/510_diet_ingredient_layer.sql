-- 510_diet_ingredient_layer.sql
--
-- Diet tags derived from ingredients — PART 1 of the build: the INGREDIENT layer and the
-- read-only dish status. Spec: docs/plans/spec-diet-tags-derivation.md (PR #634); every
-- design decision below was made by the CEO on 2026-10-17 and is recorded there.
--
-- WHAT THIS MIGRATION DOES
--   1. Adds the per-ingredient classification columns to nomenclature
--      (animal_origin, diet_state, diet_reviewed_at/by, diet_evidence).
--   2. fn_dish_diet_status(dish_id) — sibling of fn_dish_allergen_status: same BOM walk,
--      same food-leaf definition, same shape.
--   3. fn_propose_ingredient_diets(apply) — the deterministic half of the hybrid: rules
--      R1-R3 over the leaves of the live menu. It only ever writes diet_state='proposed'.
--
-- WHAT IT DELIBERATELY DOES NOT DO (later PRs, each its own review)
--   * It classifies NOTHING. No row changes state when this migration is applied; the
--     propose function is a function, not a backfill. The "dry-run" view of what it would
--     propose is in the PR body.
--   * It tags NO dish. Nothing is written to nomenclature_tags. The Plant-based filter on
--     the site still matches zero dishes after this lands, which is the honest state.
--   * No dish-level flag (diet_needs_check), no hash, no triggers, no confirm function, no
--     public-view change, no admin queue. Those are PART 2 (spec sections 2.4-2.5, 4).
--   * R5's "ingredient identity changed -> back to unknown" needs a trigger; PART 2.
--
-- WHY NOT REUSE allergen_reviewed_at (spec 2a)
-- allergen_reviewed_at asserts "this ingredient's ALLERGEN set is known". RAW-CHICKEN-BREAST
-- is reviewed with an empty allergen set, so reading it as "reviewed = plant" would call
-- chicken clean. Diets need their own assertion, hence diet_state.
--
-- THE TRAP THIS FUNCTION IS BUILT AROUND (gotcha_allergen_dual_source)
-- A tag, or an origin array, only records a POSITIVE. An empty animal_origin means "plant"
-- ONLY when diet_state = 'confirmed'; NULL means unknown. fn_dish_diet_status therefore
-- returns diets = NULL (not []) when it is not confident, so "unknown" can never be read as
-- "has no diets"; and it requires ingredients > 0 (the mig 392 zero-ingredient bug) and no
-- soft-deleted leaf (the 4 deleted RAW still sitting in live BOMs would otherwise count as
-- ordinary ingredients, exactly like fn_dish_allergen_status does today).
--
-- DEFINITIONS (CEO brief): plant-based = no animal origin on any food leaf, honey counts as
-- animal. vegetarian = no meat / fish / shellfish / other_animal; dairy, egg and honey
-- allowed. Every plant-based dish is also vegetarian.
--
-- CONTRACT-REVIEWED: touches nomenclature, which shishka.health reads through menu_public
-- (contracts/menu-contract.json). Safe: ADD COLUMN only, all nullable or defaulted, no
-- column renamed, retyped or dropped, no view redefined, no price touched. menu_public
-- selects explicit columns, so the new ones are invisible to the site.

BEGIN;

-- ── 1. Ingredient classification columns ─────────────────────────────────────
ALTER TABLE public.nomenclature
  ADD COLUMN IF NOT EXISTS animal_origin     text[],
  ADD COLUMN IF NOT EXISTS diet_state        text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS diet_reviewed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS diet_reviewed_by  text,
  ADD COLUMN IF NOT EXISTS diet_evidence     text;

COMMENT ON COLUMN public.nomenclature.animal_origin IS
  'Animal-derived components of this ingredient. NULL = unknown. {} = plant, VALID ONLY when diet_state=confirmed. Vocabulary: meat, fish, shellfish, dairy, egg, honey, other_animal.';
COMMENT ON COLUMN public.nomenclature.diet_state IS
  'unknown | proposed (rule or model suggested, no human yet) | confirmed (a human asserted animal_origin, including asserting it is empty).';

-- Vocabulary + state invariants. Re-runnable: drop-then-add keeps the migration idempotent.
ALTER TABLE public.nomenclature DROP CONSTRAINT IF EXISTS nomenclature_diet_state_chk;
ALTER TABLE public.nomenclature ADD CONSTRAINT nomenclature_diet_state_chk
  CHECK (diet_state IN ('unknown', 'proposed', 'confirmed'));

ALTER TABLE public.nomenclature DROP CONSTRAINT IF EXISTS nomenclature_animal_origin_vocab_chk;
ALTER TABLE public.nomenclature ADD CONSTRAINT nomenclature_animal_origin_vocab_chk
  CHECK (animal_origin IS NULL
         OR animal_origin <@ ARRAY['meat','fish','shellfish','dairy','egg','honey','other_animal']::text[]);

-- A confirmed row must carry the assertion AND who made it; unknown carries no origin.
ALTER TABLE public.nomenclature DROP CONSTRAINT IF EXISTS nomenclature_diet_confirmed_chk;
ALTER TABLE public.nomenclature ADD CONSTRAINT nomenclature_diet_confirmed_chk
  CHECK (diet_state <> 'confirmed'
         OR (animal_origin IS NOT NULL AND diet_reviewed_at IS NOT NULL AND diet_reviewed_by IS NOT NULL));
ALTER TABLE public.nomenclature DROP CONSTRAINT IF EXISTS nomenclature_diet_unknown_chk;
ALTER TABLE public.nomenclature ADD CONSTRAINT nomenclature_diet_unknown_chk
  CHECK (diet_state <> 'unknown' OR animal_origin IS NULL);

-- ── 2. fn_dish_diet_status — read-only, same walk as fn_dish_allergen_status ──
CREATE OR REPLACE FUNCTION public.fn_dish_diet_status(p_dish_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
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
  -- Food leaf = no BOM children and not packaging. The dish itself counts when it is
  -- bought-in (no BOM): mig 392's lesson, a dish with zero ingredients is never "clean".
  food AS (
    SELECT n.id, n.product_code, n.is_deleted, n.diet_state, n.animal_origin
    FROM tree_distinct td
    JOIN public.nomenclature n ON n.id = td.nomenclature_id
    LEFT JOIN public.product_categories pc ON pc.id = n.category_id
    WHERE COALESCE(pc.code, '') NOT LIKE 'NF-%'
      AND NOT EXISTS (SELECT 1 FROM public.bom_structures b WHERE b.parent_id = td.nomenclature_id)
  ),
  agg AS (
    SELECT
      count(*)                                            AS ingredients,
      count(*) FILTER (WHERE diet_state <> 'confirmed')   AS unconfirmed,
      count(*) FILTER (WHERE is_deleted)                  AS soft_deleted
    FROM food
  ),
  origins AS (
    SELECT COALESCE(array_agg(DISTINCT o ORDER BY o), '{}'::text[]) AS o
    FROM food, LATERAL unnest(COALESCE(animal_origin, '{}'::text[])) AS o
  )
  SELECT jsonb_build_object(
    'ingredients',  a.ingredients,
    'unconfirmed',  a.unconfirmed,
    'soft_deleted', a.soft_deleted,
    'origins',      to_jsonb(os.o),
    'confident',    (a.ingredients > 0 AND a.unconfirmed = 0 AND a.soft_deleted = 0),
    -- NULL, never [], when not confident: "unknown" must not be readable as "no diets".
    'diets',        CASE
                      WHEN NOT (a.ingredients > 0 AND a.unconfirmed = 0 AND a.soft_deleted = 0) THEN NULL
                      ELSE to_jsonb(ARRAY_REMOVE(ARRAY[
                             CASE WHEN cardinality(os.o) = 0 THEN 'plant-based' END,
                             CASE WHEN NOT (os.o && ARRAY['meat','fish','shellfish','other_animal']::text[])
                                  THEN 'vegetarian' END
                           ], NULL))
                    END,
    'unconfirmed_items', COALESCE((SELECT jsonb_agg(product_code ORDER BY product_code)
                                   FROM food WHERE diet_state <> 'confirmed'), '[]'::jsonb),
    'soft_deleted_items', COALESCE((SELECT jsonb_agg(product_code ORDER BY product_code)
                                    FROM food WHERE is_deleted), '[]'::jsonb)
  )
  FROM agg a, origins os;
$function$;

COMMENT ON FUNCTION public.fn_dish_diet_status(uuid) IS
  'Diet status of a dish from its food leaves. diets is NULL unless confident (every leaf confirmed, >0 leaves, none soft-deleted). Sibling of fn_dish_allergen_status; see docs/plans/spec-diet-tags-derivation.md.';

REVOKE ALL ON FUNCTION public.fn_dish_diet_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_dish_diet_status(uuid) TO authenticated, service_role;

-- ── 3. fn_propose_ingredient_diets — the deterministic half of the hybrid ────
-- Scope: food leaves of the 81 live menu dishes (same live filter as menu_public).
-- Rules, in order. A row already 'confirmed' is never read, never written (R5).
--   R1  allergen tag implication: allergen-dairy -> dairy, allergen-eggs -> egg,
--       allergen-fish -> fish, allergen-shellfish -> shellfish.
--   R2a category that cannot lie, animal:  F-PRO-RED -> meat, F-PRO-EGG -> egg,
--       F-DAI-CHZ / F-DAI-YGT -> dairy.  (F-PRO-SEA resolves only through R1.)
--   R3  honey: category F-SPC-SWT and name contains 'honey'.
--   R2b plain produce, proposes {} (plant): fruit, frozen fruit/veg, herbs, mushrooms,
--       vegetables, dry spices, salt, nuts, seeds, legumes, rice, coffee, water, vinegar,
--       nut butter — and ONLY when the name carries no composite marker.
--   Everything else is ESCALATED and left unknown: categories that mislead (F-DAI-MLK holds
--   coconut/almond milk, F-DAI-OIL, F-PRO-PLT holds chicken, F-PRO-VEG), composite items,
--   uncovered categories. The model, not this function, proposes those — offline.
-- p_apply=false is a pure dry run. p_apply=true writes diet_state='proposed' only; it never
-- writes 'confirmed' and never touches a row a human has confirmed.
CREATE OR REPLACE FUNCTION public.fn_propose_ingredient_diets(p_apply boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_composite constant text := '(sauce|paste|mix|blend|syrup|seasoned|salad|protein|bread|wrap|pickle|sweetened|dressing|flavou?r)';
  v_written int := 0;
  v_rows jsonb;
BEGIN
  DROP TABLE IF EXISTS _prop;  -- INTENTIONAL DROP (session-local temp table, re-entrancy guard)
  CREATE TEMP TABLE _prop ON COMMIT DROP AS
  WITH RECURSIVE dishes AS (
    SELECT id FROM public.nomenclature
    WHERE product_code LIKE 'SALE-%' AND is_web_visible AND NOT is_deleted
      AND name NOT ILIKE '[ARCHIVED]%'
  ), tree AS (
    SELECT id AS nid, 0 AS depth FROM dishes
    UNION ALL
    SELECT bs.ingredient_id, t.depth + 1 FROM tree t
    JOIN public.bom_structures bs ON bs.parent_id = t.nid WHERE t.depth < 10
  ), leaves AS (
    SELECT DISTINCT n.id, n.product_code, n.name, n.diet_state, pc.code AS cat
    FROM tree t
    JOIN public.nomenclature n ON n.id = t.nid
    LEFT JOIN public.product_categories pc ON pc.id = n.category_id
    WHERE COALESCE(pc.code, '') NOT LIKE 'NF-%'
      AND NOT EXISTS (SELECT 1 FROM public.bom_structures b WHERE b.parent_id = t.nid)
      AND n.diet_state <> 'confirmed'                                  -- R5
  ), r1 AS (
    SELECT l.id, array_agg(DISTINCT CASE tg.slug
             WHEN 'allergen-dairy'     THEN 'dairy'
             WHEN 'allergen-eggs'      THEN 'egg'
             WHEN 'allergen-fish'      THEN 'fish'
             WHEN 'allergen-shellfish' THEN 'shellfish' END) AS o
    FROM leaves l
    JOIN public.nomenclature_tags nt ON nt.nomenclature_id = l.id
    JOIN public.tags tg ON tg.id = nt.tag_id
    WHERE tg.slug IN ('allergen-dairy','allergen-eggs','allergen-fish','allergen-shellfish')
    GROUP BY l.id
  )
  SELECT l.id, l.product_code, l.name, l.cat,
    CASE
      WHEN r1.o IS NOT NULL THEN r1.o
                                  || CASE WHEN l.cat = 'F-PRO-RED' THEN ARRAY['meat'] ELSE '{}'::text[] END
      WHEN l.cat = 'F-PRO-RED'                       THEN ARRAY['meat']
      WHEN l.cat = 'F-PRO-EGG'                       THEN ARRAY['egg']
      WHEN l.cat IN ('F-DAI-CHZ','F-DAI-YGT')        THEN ARRAY['dairy']
      WHEN l.cat = 'F-SPC-SWT' AND l.name ~* 'honey' THEN ARRAY['honey']
      WHEN l.cat IN ('F-PRD-FRU','F-PRD-FRZ','F-PRD-HRB','F-PRD-MSH','F-PRD-VEG','F-SPC-DRY','F-SPC-SLT',
                     'F-NTS-NUT','F-NTS-SDS','F-NTS-BUT','F-GRN-LGM','F-GRN-RIC','F-BEV-COF','F-ZW-BYP',
                     'F-SPC-VNG')
           AND l.name !~* v_composite                THEN '{}'::text[]
      ELSE NULL
    END AS origin,
    CASE
      WHEN r1.o IS NOT NULL                          THEN 'R1'
      WHEN l.cat IN ('F-PRO-RED','F-PRO-EGG','F-DAI-CHZ','F-DAI-YGT') THEN 'R2a'
      WHEN l.cat = 'F-SPC-SWT' AND l.name ~* 'honey' THEN 'R3'
      WHEN l.cat IN ('F-PRD-FRU','F-PRD-FRZ','F-PRD-HRB','F-PRD-MSH','F-PRD-VEG','F-SPC-DRY','F-SPC-SLT',
                     'F-NTS-NUT','F-NTS-SDS','F-NTS-BUT','F-GRN-LGM','F-GRN-RIC','F-BEV-COF','F-ZW-BYP',
                     'F-SPC-VNG')
           AND l.name !~* v_composite                THEN 'R2b'
      WHEN l.cat IN ('F-DAI-MLK','F-DAI-OIL','F-PRO-PLT','F-PRO-VEG') THEN 'escalate:misleading_category'
      WHEN l.name ~* v_composite                     THEN 'escalate:composite'
      ELSE 'escalate:unmapped'
    END AS rule
  FROM leaves l LEFT JOIN r1 ON r1.id = l.id;

  IF p_apply THEN
    UPDATE public.nomenclature n
       SET animal_origin = p.origin,
           diet_state    = 'proposed',
           diet_evidence = 'rule ' || p.rule || ' (fn_propose_ingredient_diets)'
      FROM _prop p
     WHERE n.id = p.id AND p.origin IS NOT NULL AND n.diet_state <> 'confirmed';
    GET DIAGNOSTICS v_written = ROW_COUNT;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'code', product_code, 'name', name, 'category', cat,
           'proposed_origin', to_jsonb(origin), 'rule', rule) ORDER BY rule, product_code), '[]'::jsonb)
    INTO v_rows FROM _prop;

  RETURN jsonb_build_object(
    'applied',   p_apply,
    'written',   v_written,
    'leaves',    (SELECT count(*) FROM _prop),
    'proposed',  (SELECT count(*) FROM _prop WHERE origin IS NOT NULL),
    'plant',     (SELECT count(*) FROM _prop WHERE origin = '{}'::text[]),
    'animal',    (SELECT count(*) FROM _prop WHERE origin IS NOT NULL AND origin <> '{}'::text[]),
    'escalated', (SELECT count(*) FROM _prop WHERE origin IS NULL),
    'rows',      v_rows
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_propose_ingredient_diets(boolean) IS
  'Deterministic rules R1-R3 over the food leaves of the live menu. p_apply=false dry run; true writes diet_state=proposed only, never confirmed. Unresolved rows are escalated to the offline model. See docs/plans/spec-diet-tags-derivation.md 2b.';

REVOKE ALL ON FUNCTION public.fn_propose_ingredient_diets(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_propose_ingredient_diets(boolean) TO service_role;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('510_diet_ingredient_layer.sql', 'claude-opus-session-df80a758', NULL,
        'Diet tags from ingredients, part 1 (spec docs/plans/spec-diet-tags-derivation.md): nomenclature.animal_origin/diet_state/diet_reviewed_at/by/diet_evidence with CHECK invariants (empty origin = plant only when confirmed); fn_dish_diet_status (diets NULL unless every food leaf confirmed, >0 leaves, none soft-deleted); fn_propose_ingredient_diets (rules R1-R3, writes proposed only, never confirmed). Classifies nothing and tags no dish on apply.');

COMMIT;
