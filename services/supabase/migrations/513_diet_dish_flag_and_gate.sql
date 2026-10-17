-- 513_diet_dish_flag_and_gate.sql
--
-- Diet tags derived from ingredients — PART 2: the dish-level "check tags" mark, the hash that
-- proves it, the triggers that raise it, the functions a human confirms with, and the gate that
-- hides diet tags from guests while a dish is flagged. Builds on 510 (part 1, PR #637).
-- Spec: docs/plans/spec-diet-tags-derivation.md (PR #634), all four questions answered by the CEO:
--   Q1 one ingredient review, two outputs · Q2 hybrid rules + offline model + human confirms
--   Q3 HIDE diet tags from guests while flagged · Q4 badge on the dish row + one queue view.
--
-- NOT APPLIED. Applying it changes NOTHING a guest can see: no live dish carries a plant-based or
-- vegetarian link today (all 121 tag links on the 81 live dishes are allergens). Measured in the
-- dry-run, the gate hides exactly 3 existing links from anon (941 of 944 rows) and all three sit on
-- non-live SALE rows (Borsch Bio-Active, Kraut Side, Pumpkin Coconut Soup: is_web_visible=false,
-- is_available=false) that carry a hand-set `vegetarian` and were never reviewed.
--
-- WHAT THIS ADDS
--   1. Tag `plant-based` (tag_group dietary) — the slug the site expects (SPEC section 7).
--   2. Dish columns: diet_basis_hash, diet_needs_check (default TRUE = unreviewed = no diet tag).
--   3. fn_dish_diet_hash: md5 over the dish's food leaves (id, origin, confirmed?, soft-deleted?).
--      Quantities, yield, packaging and notes are NOT in it, so they never raise a flag.
--   4. Triggers on bom_structures and nomenclature that walk UP from a changed line / ingredient to
--      every SALE ancestor and raise diet_needs_check when the hash no longer matches the one that
--      was reviewed. FAIL-CLOSED: they only ever raise the flag; only a human confirm clears it.
--   5. R5 (spec 2b): a confirmed ingredient whose name or default supplier changes goes back to
--      unknown, which then raises the flag on every dish above it.
--   6. fn_confirm_ingredient_diet / fn_confirm_dish_diets — the only writers of the managed diet
--      links (plant-based, vegetarian), and the only thing that clears the flag.
--   7. THE GATE: nomenclature_tags_public_read now hides the managed diet links of a flagged SALE
--      dish from anyone who is not an authenticated staff user. Allergen links are untouched.
--   8. v_dish_diet_check (the admin badge + queue source), fn_dish_diet_review (blocking
--      ingredient detail for one dish), fn_diet_audit (the proof that the triggers missed nothing).
--
-- THE CONSEQUENCE THE CEO ACCEPTED (Q3), stated plainly: a dish whose composition just changed
-- silently loses its vegan / vegetarian label on shishka.health until a human clears the flag.
-- The review queue is what keeps correct dishes from looking unlabelled; it is not housekeeping.
--
-- THINGS A REVIEWER SHOULD KNOW
--   * New objects in public are born closed (mig 490 functions, mig 504 tables/views): every
--     grant below is explicit. The policy helper MUST be executable by anon or the site's
--     nomenclature_tags read would start failing with 42501 — verified in the dry-run as anon.
--   * The policy helper is SECURITY DEFINER because anon has no SELECT on nomenclature; it is a
--     pair of primary-key lookups per row, measured under the anon role in the dry-run (3 s
--     statement_timeout applies to the site).
--   * Hand-editing a plant-based / vegetarian link in the tag editor still works (nothing here
--     blocks it) — but fn_diet_audit reports any dish whose published links disagree with what its
--     ingredients prove, so a hand-typed claim cannot hide.
--
-- CONTRACT-REVIEWED: touches nomenclature_tags (RLS policy) and tags (one INSERT), both read by
-- shishka.health (contracts/menu-contract.json, select "nomenclature_id,tags(slug,name,tag_group,color)",
-- minRows 1). Safe: no column of either table changes, the anon read still returns every row except
-- the managed diet links of flagged SALE dishes (3 rows today, all on non-live dishes), and allergen /
-- other-group links are returned exactly as before (359 of 359 in the dry-run).

BEGIN;

-- ── 1. The tag the site expects ──────────────────────────────────────────────
INSERT INTO public.tags (slug, name, name_th, tag_group, sort_order)
VALUES ('plant-based', 'Plant-based', 'จากพืช', 'dietary', 9)
ON CONFLICT (slug) DO NOTHING;

-- ── 2. Dish-level columns ────────────────────────────────────────────────────
ALTER TABLE public.nomenclature
  ADD COLUMN IF NOT EXISTS diet_basis_hash   text,
  ADD COLUMN IF NOT EXISTS diet_needs_check  boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.nomenclature.diet_basis_hash IS
  'Dishes only. fn_dish_diet_hash at the moment a human last confirmed this dish''s diet tags. NULL = never confirmed.';
COMMENT ON COLUMN public.nomenclature.diet_needs_check IS
  'Dishes only. TRUE = the managed diet tags (plant-based, vegetarian) are hidden from guests: never confirmed, or the composition changed since. Cleared only by fn_confirm_dish_diets.';

-- ── 3. The hash ──────────────────────────────────────────────────────────────
-- Same food-leaf walk as fn_dish_diet_status. A leaf contributes its id, its origin set, whether
-- a human has confirmed it, and whether it is soft-deleted — everything that can change what the
-- dish may claim. Nothing numeric, so a gram edit can never raise a flag.
CREATE OR REPLACE FUNCTION public.fn_dish_diet_hash(p_dish_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH RECURSIVE tree AS (
    SELECT p_dish_id AS nid, 0 AS depth
    UNION ALL
    SELECT bs.ingredient_id, t.depth + 1
    FROM tree t
    JOIN public.bom_structures bs ON bs.parent_id = t.nid
    WHERE t.depth < 10
  ),
  leaves AS (
    SELECT DISTINCT n.id, n.animal_origin, n.diet_state, n.is_deleted
    FROM (SELECT DISTINCT nid FROM tree) td
    JOIN public.nomenclature n ON n.id = td.nid
    LEFT JOIN public.product_categories pc ON pc.id = n.category_id
    WHERE COALESCE(pc.code, '') NOT LIKE 'NF-%'
      AND NOT EXISTS (SELECT 1 FROM public.bom_structures b WHERE b.parent_id = td.nid)
  )
  SELECT md5(COALESCE(string_agg(
           id::text || ':'
           || COALESCE((SELECT string_agg(o, ',' ORDER BY o) FROM unnest(animal_origin) AS o), '?') || ':'
           || (diet_state = 'confirmed')::text || ':' || COALESCE(is_deleted, false)::text,
         '|' ORDER BY id), ''))
  FROM leaves;
$function$;

REVOKE ALL ON FUNCTION public.fn_dish_diet_hash(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_dish_diet_hash(uuid) TO authenticated, service_role;

-- ── 4. Raising the flag (fail-closed) ────────────────────────────────────────
-- Walks UP from p_item (inclusive) to every SALE row above it and raises the flag on those whose
-- reviewed hash no longer matches. Never lowers a flag.
CREATE OR REPLACE FUNCTION public.fn_diet_flag_ancestors(p_item uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_n integer;
BEGIN
  WITH RECURSIVE up AS (
    SELECT p_item AS nid, 0 AS depth
    UNION ALL
    SELECT bs.parent_id, u.depth + 1
    FROM up u
    JOIN public.bom_structures bs ON bs.ingredient_id = u.nid
    WHERE u.depth < 10
  ), dishes AS (
    SELECT DISTINCT n.id
    FROM up u
    JOIN public.nomenclature n ON n.id = u.nid
    WHERE n.product_code LIKE 'SALE-%'
      AND NOT n.diet_needs_check
  )
  UPDATE public.nomenclature n
     SET diet_needs_check = true
    FROM dishes d
   WHERE n.id = d.id
     AND public.fn_dish_diet_hash(n.id) IS DISTINCT FROM n.diet_basis_hash;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_diet_flag_ancestors(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diet_flag_ancestors(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_diet_flag_on_bom()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- A quantity / yield / note edit changes neither the parent nor the ingredient: nothing to do.
  IF TG_OP = 'UPDATE'
     AND OLD.parent_id IS NOT DISTINCT FROM NEW.parent_id
     AND OLD.ingredient_id IS NOT DISTINCT FROM NEW.ingredient_id THEN
    RETURN NEW;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.fn_diet_flag_ancestors(NEW.parent_id);
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    PERFORM public.fn_diet_flag_ancestors(OLD.parent_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_diet_flag_on_bom ON public.bom_structures;
CREATE TRIGGER trg_diet_flag_on_bom
  AFTER INSERT OR UPDATE OR DELETE ON public.bom_structures
  FOR EACH ROW EXECUTE FUNCTION public.fn_diet_flag_on_bom();

CREATE OR REPLACE FUNCTION public.fn_diet_flag_on_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.fn_diet_flag_ancestors(NEW.id);
  RETURN NEW;
END;
$function$;

-- A plain AFTER UPDATE with a WHEN on the real NEW row — NOT "UPDATE OF col": a column changed by
-- a BEFORE trigger (the R5 reset below) does not fire an UPDATE OF trigger.
DROP TRIGGER IF EXISTS trg_diet_flag_on_item ON public.nomenclature;
CREATE TRIGGER trg_diet_flag_on_item
  AFTER UPDATE ON public.nomenclature
  FOR EACH ROW
  WHEN (OLD.animal_origin IS DISTINCT FROM NEW.animal_origin
        OR OLD.diet_state IS DISTINCT FROM NEW.diet_state
        OR OLD.is_deleted IS DISTINCT FROM NEW.is_deleted)
  EXECUTE FUNCTION public.fn_diet_flag_on_item();

-- ── 5. R5: a confirmed ingredient whose identity changed is unknown again ────
CREATE OR REPLACE FUNCTION public.fn_diet_reset_on_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.diet_state       := 'unknown';
  NEW.animal_origin    := NULL;
  NEW.diet_evidence    := COALESCE(OLD.diet_evidence || ' | ', '') || 'reset: name or supplier changed';
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_diet_reset_on_identity_change ON public.nomenclature;
CREATE TRIGGER trg_diet_reset_on_identity_change
  BEFORE UPDATE ON public.nomenclature
  FOR EACH ROW
  WHEN (OLD.diet_state = 'confirmed'
        AND NEW.diet_state = 'confirmed'
        AND (OLD.name IS DISTINCT FROM NEW.name
             OR OLD.default_supplier_id IS DISTINCT FROM NEW.default_supplier_id))
  EXECUTE FUNCTION public.fn_diet_reset_on_identity_change();

-- ── 6. The human's two actions ───────────────────────────────────────────────
-- Confirm one ingredient. p_origin NULL = accept the proposal that is already stored. Only a leaf
-- can be classified (a prep or a dish rolls up). The CHECK constraints from 510 do the rest.
CREATE OR REPLACE FUNCTION public.fn_confirm_ingredient_diet(
  p_id uuid, p_origin text[] DEFAULT NULL, p_evidence text DEFAULT NULL, p_reviewer text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_n public.nomenclature%ROWTYPE;
  v_who text := COALESCE(NULLIF(btrim(p_reviewer), ''), 'unknown') || ' (' || COALESCE(auth.uid()::text, 'service') || ')';
BEGIN
  SELECT * INTO v_n FROM public.nomenclature WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ingredient % not found', p_id; END IF;
  IF EXISTS (SELECT 1 FROM public.bom_structures WHERE parent_id = p_id) THEN
    RAISE EXCEPTION '% has a BOM: classify its ingredients, not the recipe', v_n.product_code;
  END IF;
  IF p_origin IS NULL AND v_n.diet_state <> 'proposed' THEN
    RAISE EXCEPTION '% has no stored proposal to accept (state %); pass p_origin explicitly', v_n.product_code, v_n.diet_state;
  END IF;

  UPDATE public.nomenclature
     SET animal_origin    = COALESCE(p_origin, animal_origin),
         diet_state       = 'confirmed',
         diet_reviewed_at = now(),
         diet_reviewed_by = v_who,
         diet_evidence    = COALESCE(NULLIF(btrim(p_evidence), ''), diet_evidence)
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'code', v_n.product_code, 'confirmed_by', v_who);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_confirm_ingredient_diet(uuid, text[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_confirm_ingredient_diet(uuid, text[], text, text) TO authenticated, service_role;

-- Confirm a dish. Refuses unless every food leaf is confirmed (fn_dish_diet_status.confident).
-- Rewrites the managed links in one transaction, stores the hash, clears the flag.
CREATE OR REPLACE FUNCTION public.fn_confirm_dish_diets(p_dish_id uuid, p_reviewer text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_code text;
  v_st jsonb;
  v_diets text[];
  v_who text := COALESCE(NULLIF(btrim(p_reviewer), ''), 'unknown') || ' (' || COALESCE(auth.uid()::text, 'service') || ')';
BEGIN
  SELECT product_code INTO v_code FROM public.nomenclature WHERE id = p_dish_id AND NOT is_deleted;
  IF v_code IS NULL OR v_code NOT LIKE 'SALE-%' THEN
    RAISE EXCEPTION 'dish % not found or not a SALE item', p_dish_id;
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

REVOKE ALL ON FUNCTION public.fn_confirm_dish_diets(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_confirm_dish_diets(uuid, text) TO authenticated, service_role;

-- ── 7. THE GATE (CEO Q3: hide while flagged) ─────────────────────────────────
-- TRUE = the link may be shown. Only the two managed slugs on a SALE row are ever hidden, and only
-- while diet_needs_check. SECURITY DEFINER because anon cannot read nomenclature.
CREATE OR REPLACE FUNCTION public.fn_diet_tag_visible(p_nomenclature_id uuid, p_tag_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.tags t
    JOIN public.nomenclature n ON n.id = p_nomenclature_id
    WHERE t.id = p_tag_id
      AND t.slug IN ('plant-based', 'vegetarian')
      AND n.product_code LIKE 'SALE-%'
      AND n.diet_needs_check
  );
$function$;

-- Policies run as the caller: without EXECUTE here the site's read would fail with 42501.
REVOKE ALL ON FUNCTION public.fn_diet_tag_visible(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_diet_tag_visible(uuid, uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS nomenclature_tags_public_read ON public.nomenclature_tags;
CREATE POLICY nomenclature_tags_public_read ON public.nomenclature_tags
  FOR SELECT
  USING (( SELECT auth.role() ) = 'authenticated'
         OR public.fn_diet_tag_visible(nomenclature_id, tag_id));

-- ── 8. Admin surface + audit ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_dish_diet_check AS
SELECT
  n.id                                   AS dish_id,
  n.product_code,
  n.name,
  n.diet_needs_check                     AS needs_check,
  CASE WHEN NOT n.diet_needs_check THEN 'ok'
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
  n.diet_reviewed_by
FROM public.nomenclature n
CROSS JOIN LATERAL (SELECT public.fn_dish_diet_status(n.id) AS st) s
WHERE n.product_code LIKE 'SALE-%' AND NOT n.is_deleted;

REVOKE ALL ON public.v_dish_diet_check FROM PUBLIC, anon;
GRANT SELECT ON public.v_dish_diet_check TO authenticated, service_role;

-- Blocking ingredients of one dish, with what a reviewer needs to decide.
CREATE OR REPLACE FUNCTION public.fn_dish_diet_review(p_dish_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH RECURSIVE tree AS (
    SELECT p_dish_id AS nid, 0 AS depth
    UNION ALL
    SELECT bs.ingredient_id, t.depth + 1 FROM tree t
    JOIN public.bom_structures bs ON bs.parent_id = t.nid WHERE t.depth < 10
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', n.id, 'code', n.product_code, 'name', n.name, 'state', n.diet_state,
           'origin', to_jsonb(n.animal_origin), 'evidence', n.diet_evidence, 'soft_deleted', n.is_deleted)
         ORDER BY n.diet_state, n.product_code), '[]'::jsonb)
  FROM (SELECT DISTINCT nid FROM tree) td
  JOIN public.nomenclature n ON n.id = td.nid
  LEFT JOIN public.product_categories pc ON pc.id = n.category_id
  WHERE COALESCE(pc.code, '') NOT LIKE 'NF-%'
    AND NOT EXISTS (SELECT 1 FROM public.bom_structures b WHERE b.parent_id = td.nid)
    AND (n.diet_state <> 'confirmed' OR n.is_deleted);
$function$;

REVOKE ALL ON FUNCTION public.fn_dish_diet_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_dish_diet_review(uuid) TO authenticated, service_role;

-- The proof that the triggers missed nothing. Zero rows = clean. Meant for the nightly / CI check.
--   hash_drift       : unflagged dish whose composition no longer matches what was reviewed
--   published_drift  : unflagged dish whose managed links differ from what its ingredients prove
--   unflagged_unconfident: unflagged dish that is not confident (should be impossible)
CREATE OR REPLACE FUNCTION public.fn_diet_audit()
RETURNS TABLE (dish_id uuid, product_code text, problem text)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH d AS (
    SELECT n.id, n.product_code, n.diet_basis_hash,
           public.fn_dish_diet_status(n.id) AS st,
           COALESCE((SELECT array_agg(t.slug ORDER BY t.slug)
                       FROM public.nomenclature_tags nt JOIN public.tags t ON t.id = nt.tag_id
                      WHERE nt.nomenclature_id = n.id AND t.slug IN ('plant-based', 'vegetarian')), '{}') AS pub
    FROM public.nomenclature n
    WHERE n.product_code LIKE 'SALE-%' AND NOT n.is_deleted AND NOT n.diet_needs_check
  )
  SELECT id, product_code, 'hash_drift' FROM d
   WHERE public.fn_dish_diet_hash(id) IS DISTINCT FROM diet_basis_hash
  UNION ALL
  SELECT id, product_code, 'unflagged_unconfident' FROM d WHERE NOT (st->>'confident')::boolean
  UNION ALL
  SELECT id, product_code, 'published_drift' FROM d
   WHERE (st->>'confident')::boolean
     AND pub IS DISTINCT FROM CASE WHEN jsonb_typeof(st->'diets') = 'array'
                                   THEN COALESCE((SELECT array_agg(x ORDER BY x) FROM jsonb_array_elements_text(st->'diets') x), '{}')
                                   ELSE '{}' END;
$function$;

REVOKE ALL ON FUNCTION public.fn_diet_audit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_diet_audit() TO authenticated, service_role;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('513_diet_dish_flag_and_gate.sql', 'claude-opus-session-df80a758', NULL,
        'Diet tags from ingredients, part 2 (spec docs/plans/spec-diet-tags-derivation.md, CEO Q1-Q4): tag plant-based; nomenclature.diet_basis_hash + diet_needs_check (default true); fn_dish_diet_hash; fail-closed triggers on bom_structures and nomenclature that walk up to SALE ancestors and raise the flag when the reviewed hash no longer matches; R5 identity reset; fn_confirm_ingredient_diet / fn_confirm_dish_diets as the only writers of the managed links; nomenclature_tags_public_read hides plant-based/vegetarian links of flagged SALE dishes from non-authenticated readers via SECURITY DEFINER fn_diet_tag_visible (3 non-live rows affected at apply); v_dish_diet_check, fn_dish_diet_review, fn_diet_audit.');

COMMIT;
