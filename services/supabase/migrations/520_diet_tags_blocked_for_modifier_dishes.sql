-- 520_diet_tags_blocked_for_modifier_dishes.sql
--
-- A dish whose food is chosen by the guest can never carry a static diet tag. CEO 2026-10-17:
-- "let it have no tags" (about Custom Smoothie).
--
-- THE HOLE THIS CLOSES
-- SALE-SMOOTHIE_CUSTOM ("Custom Smoothie (Build Your Own)") has a BOM of ice (RO water), cow milk
-- and packaging; every real ingredient arrives as a modifier chosen at order time (5 modifier
-- groups). After the proposals for water and milk are confirmed, fn_dish_diet_status would call it
-- confident and fn_confirm_dish_diets would publish "vegetarian" for a drink the guest assembles.
-- Found while listing which proposals were safe to confirm; MC 79460476 already records that this
-- item can never carry a static claim (same reason it is permanently allergen-unconfident).
--
-- WHAT THIS DOES
--   1. nomenclature.diet_tags_blocked_reason: NULL = taggable; any text = never taggable, and the
--      text is the explanation the admin shows.
--   2. Sets it on SALE-SMOOTHIE_CUSTOM, the only build-your-own dish on the live menu.
--   3. fn_dish_diet_status: a blocked dish is never confident and its diets are NULL.
--      New key blocked_reason.
--   4. fn_confirm_dish_diets: refuses a blocked dish with the stored reason.
--   5. v_dish_diet_check: reason = 'not_taggable' and a new trailing column blocked_reason.
--
-- A hand-added plant-based / vegetarian link on a blocked dish stays hidden from guests anyway:
-- the dish keeps diet_needs_check = true forever and the anon gate hides the managed links of a
-- flagged SALE dish (mig 513).
--
-- NOT CHANGED: coffees. Americano / Espresso are plant-based as listed; modifiers (milk, honey)
-- can change that, and a tag describes the dish as it is on the menu. That is a policy question
-- for the CEO, not something to block here.
--
-- CONTRACT-REVIEWED: touches nomenclature (one ADD COLUMN and one UPDATE of a non-site column) which
-- shishka.health reads through menu_public. menu_public selects explicit columns, so the new column is
-- invisible to the site; no existing column, view or policy the contract asserts changes.

BEGIN;

ALTER TABLE public.nomenclature
  ADD COLUMN IF NOT EXISTS diet_tags_blocked_reason text;

COMMENT ON COLUMN public.nomenclature.diet_tags_blocked_reason IS
  'NULL = this dish can carry diet tags. Text = it never can (food is chosen by the guest as modifiers), shown in the admin. fn_dish_diet_status treats it as never confident.';

UPDATE public.nomenclature
   SET diet_tags_blocked_reason = 'Build-your-own: the guest chooses the food as modifiers, so no static diet claim is possible.'
 WHERE product_code = 'SALE-SMOOTHIE_CUSTOM'
   AND diet_tags_blocked_reason IS DISTINCT FROM 'Build-your-own: the guest chooses the food as modifiers, so no static diet claim is possible.';

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
  ),
  blk AS (
    SELECT diet_tags_blocked_reason AS r FROM public.nomenclature WHERE id = p_dish_id
  ),
  ok AS (
    SELECT (a.ingredients > 0 AND a.unconfirmed = 0 AND a.soft_deleted = 0
            AND NOT EXISTS (SELECT 1 FROM blk WHERE r IS NOT NULL)) AS confident
    FROM agg a
  )
  SELECT jsonb_build_object(
    'ingredients',  a.ingredients,
    'unconfirmed',  a.unconfirmed,
    'soft_deleted', a.soft_deleted,
    'origins',      to_jsonb(os.o),
    'blocked_reason', (SELECT r FROM blk),
    'confident',    ok.confident,
    'diets',        CASE
                      WHEN NOT ok.confident THEN NULL
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
  FROM agg a, origins os, ok;
$function$;

CREATE OR REPLACE FUNCTION public.fn_confirm_dish_diets(p_dish_id uuid, p_reviewer text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_code text;
  v_blocked text;
  v_st jsonb;
  v_diets text[];
  v_who text := COALESCE(NULLIF(btrim(p_reviewer), ''), 'unknown') || ' (' || COALESCE(auth.uid()::text, 'service') || ')';
BEGIN
  SELECT product_code, diet_tags_blocked_reason INTO v_code, v_blocked
    FROM public.nomenclature WHERE id = p_dish_id AND NOT is_deleted;
  IF v_code IS NULL OR v_code NOT LIKE 'SALE-%' THEN
    RAISE EXCEPTION 'dish % not found or not a SALE item', p_dish_id;
  END IF;
  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION '% can never carry diet tags: %', v_code, v_blocked;
  END IF;
  v_st := public.fn_dish_diet_status(p_dish_id);
  IF NOT (v_st->>'confident')::boolean THEN
    RAISE EXCEPTION '% is not ready: % unconfirmed ingredient(s), % soft-deleted, % food leaves. Confirm the blocking ingredients first.',
      v_code, v_st->>'unconfirmed', v_st->>'soft_deleted', v_st->>'ingredients';
  END IF;
  SELECT COALESCE(array_agg(d), '{}') INTO v_diets FROM jsonb_array_elements_text(v_st->'diets') AS d;
  DELETE FROM public.nomenclature_tags nt
   USING public.tags t
   WHERE nt.tag_id = t.id AND nt.nomenclature_id = p_dish_id
     AND t.slug IN ('plant-based', 'vegetarian');
  INSERT INTO public.nomenclature_tags (nomenclature_id, tag_id)
  SELECT p_dish_id, t.id FROM public.tags t
   WHERE t.slug = ANY (v_diets) AND t.tag_group = 'dietary';
  UPDATE public.nomenclature
     SET diet_basis_hash  = public.fn_dish_diet_hash(p_dish_id),
         diet_needs_check = false,
         diet_reviewed_at = now(),
         diet_reviewed_by = v_who
   WHERE id = p_dish_id;
  RETURN jsonb_build_object('ok', true, 'code', v_code, 'diets', to_jsonb(v_diets), 'confirmed_by', v_who);
END;
$function$;

CREATE OR REPLACE VIEW public.v_dish_diet_check AS
SELECT
  n.id                                   AS dish_id,
  n.product_code,
  n.name,
  n.diet_needs_check                     AS needs_check,
  CASE WHEN n.diet_tags_blocked_reason IS NOT NULL THEN 'not_taggable'
       WHEN NOT n.diet_needs_check THEN 'ok'
       WHEN n.diet_basis_hash IS NULL   THEN 'never_reviewed'
       ELSE 'composition_changed' END    AS reason,
  (s.st->>'confident')::boolean          AS ready,
  (s.st->>'unconfirmed')::int            AS unconfirmed,
  (s.st->>'soft_deleted')::int           AS soft_deleted,
  (s.st->>'ingredients')::int            AS ingredients,
  NULLIF(s.st->'diets', 'null'::jsonb)   AS proposed_diets,
  COALESCE((SELECT jsonb_agg(t.slug ORDER BY t.slug)
              FROM public.nomenclature_tags nt JOIN public.tags t ON t.id = nt.tag_id
             WHERE nt.nomenclature_id = n.id AND t.slug IN ('plant-based', 'vegetarian')), '[]'::jsonb) AS published_diets,
  n.diet_reviewed_at,
  n.diet_reviewed_by,
  n.diet_tags_blocked_reason             AS blocked_reason
FROM public.nomenclature n
CROSS JOIN LATERAL (SELECT public.fn_dish_diet_status(n.id) AS st) s
WHERE n.product_code LIKE 'SALE-%' AND NOT n.is_deleted;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('520_diet_tags_blocked_for_modifier_dishes.sql', 'claude-opus-session-df80a758', NULL,
        'Diet tags can never be confirmed for a dish whose food the guest chooses as modifiers (CEO: Custom Smoothie gets no tags): nomenclature.diet_tags_blocked_reason (set on SALE-SMOOTHIE_CUSTOM), fn_dish_diet_status never confident + blocked_reason key, fn_confirm_dish_diets refuses with the reason, v_dish_diet_check reason not_taggable + trailing blocked_reason column. A hand-added link stays hidden by the mig 513 gate because the dish stays flagged.');

COMMIT;
