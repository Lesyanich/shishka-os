-- 393 — Resolve 6 of the 10 allergen blockers from the brands we actually buy (MC 572c53b1)
-- CONTRACT-REVIEWED: additive only. Adds one `tags` row and 2 nomenclature_tags rows, and sets
-- allergen_reviewed_at on 6 RAW/GOODS rows. menu_public is only READ (asserts). No view, column
-- or dish row changes. The new allergen-mustard tag lands on two RAW ingredients; menu_public
-- carries no tags column. contract-check.mjs green before and after apply, both endpoints.
--
-- CEO correction 2026-07-29: "почему ты не знаешь ответа? у нас же есть бренд!" — right. Six of
-- the ten questions I raised were already answerable from purchase history and supplier_catalog,
-- which I had queried for the mango work and did not re-read for the allergen work. Answering
-- them from our own data first, and only then from the internet.
--
-- ── RESOLVED FROM OUR OWN DATA ────────────────────────────────────────────────
--
-- RAW-RICE_NOODLE — blocks all 4 spring rolls. NO GLUTEN.
--   supplier_catalog: brand ARO, "ARO Rice Vermicelli 2.7 kg".
--   Every noodle we have actually bought is a rice or fermented-rice noodle: Three Ladies
--   Vietnamese rice noodles, Chao Wik / Chaowik fermented rice noodle basket, Davit fermented
--   rice noodles, Mahachai large rice noodles. Rice vermicelli is rice flour + water.
--   CEO ruling: "по умолчанию ставь нет — это рисовая лапша". Recorded as reviewed-clean.
--
-- RAW-PICKLED_GHERKIN — blocks 2 manakish. CONTAINS MUSTARD.
--   supplier_catalog: brand KUHNE, jar, conversion 0.35 drained.
--   Kühne Gewürzgurken ingredients include mustard seed, and the label declares mustard as an
--   allergen. So the suspicion was right and this is a real positive, not a taxonomy edge case.
--
-- RAW-MUSTARD-DIJON — CONTAINS MUSTARD (ARO Mustard 1 kg, barcode 8856995002121).
--
-- RAW-SYRUP_CARAMEL — blocks both caramel lattes. NO ALLERGEN.
--   Confirmed MONIN Caramel 700 ml (purchase 2026-06-07, ฿380; supplier_catalog ฿380/700 ml).
--   MONIN publishes: sugar, water, flavouring, citric acid, colour E150a. Declared allergen-free,
--   dairy-free and gluten-free. The "some caramel syrups carry milk" worry does not apply to this
--   brand — which is exactly why naming the brand settles it.
--
-- RAW-COCONUT-MILK + SALE-NO_SHELL_COCONUT — NO NUT ALLERGEN.
--   CEO: "не знаю, это не так важно". Taking the decision rather than leaving it open, because
--   leaving it open blocks 2 items indefinitely. We follow the EU/UK list, under which coconut is
--   NOT a tree nut (it is a drupe; coconut allergy is rare and clinically distinct from tree-nut
--   allergy). This also matches Thai FDA. Only the US FDA counts coconut as a tree nut. Coconut
--   still appears by name in the ingredient list, so a guest who avoids it can see it — we are
--   choosing not to raise a false nut warning, not hiding the ingredient.
--   If we ever target a US audience specifically, revisit this one row.
--
-- ── STILL GENUINELY OPEN (deliberately left unreviewed) ───────────────────────
--
-- RAW-BEEF_SALAMI — blocks the salami manakish.
--   supplier_catalog says supplier "Phuket Sausage", "Beef Salami imported, sliced+vacuum",
--   ฿990/kg sliced, trial order 2026-06-23. But the suppliers row has NO contact_person, NO
--   phone and NO notes, and there is no spec anywhere in the DB — and the word "imported" means
--   Phuket Sausage is reselling, so the composition is on the original producer's label. Beef
--   salami commonly carries lactose/milk powder or soy protein as binder, so this cannot be
--   guessed. ASK: get the packet photo or the producer spec from Phuket Sausage.
--
-- SALE-CHOC_DARK_70 / _DARK_70_ALMOND / _HIGH_COCOA_MILK — 3 bought-in goods, no BOM.
--   These are BARADA-brand (same category holds "The BARADA Signature Duo"), i.e. our partner's
--   own chocolate line, and they carry NO supplier_catalog row at all. So the specs should be
--   obtainable internally rather than from a wrapper in a shop. The almond one certainly carries
--   nuts and the milk one certainly carries dairy, but I am not tagging from the product NAME —
--   that is the guessing this whole ledger exists to stop. ASK BARADA for the ingredient decls.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Mustard joins the allergen taxonomy
--    It is one of the EU-14 / UK-FSA declarable allergens and we demonstrably use two
--    mustard-bearing ingredients. There was simply no slug for it, so it could not be
--    recorded even when known. One row closes that.
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO public.tags (slug, name, name_th, tag_group, color, sort_order)
VALUES ('allergen-mustard', 'Contains Mustard', 'มีมัสตาร์ด', 'allergen', '#E53E3E', 9)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id
FROM public.nomenclature n
CROSS JOIN public.tags t
WHERE t.slug = 'allergen-mustard'
  AND n.product_code IN ('RAW-MUSTARD-DIJON','RAW-PICKLED_GHERKIN')
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Mark the six resolved ingredients reviewed
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.nomenclature
SET allergen_reviewed_at = now(),
    allergen_reviewed_by = 'claude-opus-session-2989686b (mig 393, brand-confirmed)',
    updated_at = now()
WHERE product_code IN (
  'RAW-RICE_NOODLE',        -- ARO rice vermicelli + every noodle brand purchased is rice
  'RAW-SYRUP_CARAMEL',      -- MONIN caramel: sugar/water/flavour/citric/E150a, allergen-free
  'RAW-PICKLED_GHERKIN',    -- KUHNE: mustard seed -> tagged above
  'RAW-MUSTARD-DIJON',      -- ARO mustard -> tagged above
  'RAW-COCONUT-MILK',       -- EU/UK + Thai FDA: coconut is not a tree nut
  'SALE-NO_SHELL_COCONUT'
);

-- ──────────────────────────────────────────────────────────────────────────
-- 3. ASSERTIONS
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_n int; v_conf int; v_tot int;
BEGIN
  -- both mustard-bearing ingredients must now carry the tag
  SELECT count(*) INTO v_n
  FROM public.nomenclature n
  WHERE n.product_code IN ('RAW-MUSTARD-DIJON','RAW-PICKLED_GHERKIN')
    AND NOT EXISTS (SELECT 1 FROM public.nomenclature_tags nt JOIN public.tags t ON t.id=nt.tag_id
                    WHERE nt.nomenclature_id=n.id AND t.slug='allergen-mustard');
  IF v_n > 0 THEN RAISE EXCEPTION '393 ABORT: % mustard ingredient(s) untagged', v_n; END IF;

  -- the 4 spring rolls must now be confident AND still carry no gluten
  SELECT count(*) INTO v_n
  FROM public.nomenclature n
  WHERE n.product_code LIKE 'SALE-SUMMER_ROLLS_%'
    AND NOT (public.fn_dish_allergen_status(n.id)->>'confident')::boolean;
  IF v_n > 0 THEN RAISE EXCEPTION '393 ABORT: % spring roll(s) still not confident', v_n; END IF;

  SELECT count(*) INTO v_n
  FROM public.nomenclature n
  WHERE n.product_code LIKE 'SALE-SUMMER_ROLLS_%'
    AND public.fn_dish_allergens(n.id) @> ARRAY['allergen-gluten'];
  IF v_n > 0 THEN RAISE EXCEPTION '393 ABORT: % spring roll(s) unexpectedly carry gluten', v_n; END IF;

  -- the two manakish that use gherkin must now DECLARE mustard, not merely be confident
  SELECT count(*) INTO v_n
  FROM public.nomenclature n
  WHERE n.product_code IN ('SALE-MANAISH_BEEF_GF','SALE-MANAISH_LAMB_GF')
    AND NOT (public.fn_dish_allergens(n.id) @> ARRAY['allergen-mustard']);
  IF v_n > 0 THEN RAISE EXCEPTION '393 ABORT: % gherkin manakish do not declare mustard', v_n; END IF;

  -- the genuinely open items must STAY open — this migration must not quietly guess them
  SELECT count(*) INTO v_n
  FROM public.nomenclature n
  WHERE n.product_code IN ('RAW-BEEF_SALAMI','SALE-CHOC_DARK_70','SALE-CHOC_DARK_70_ALMOND',
                           'SALE-CHOC_HIGH_COCOA_MILK')
    AND n.allergen_reviewed_at IS NOT NULL;
  IF v_n > 0 THEN RAISE EXCEPTION '393 ABORT: % unresolved item(s) were marked reviewed', v_n; END IF;

  SELECT count(*), count(*) FILTER (WHERE (public.fn_dish_allergen_status(n.id)->>'confident')::boolean)
  INTO v_tot, v_conf
  FROM public.menu_public m JOIN public.nomenclature n ON n.id = m.id
  WHERE COALESCE(m.stock_state,'') <> 'coming_soon';

  IF v_conf < 55 THEN
    RAISE EXCEPTION '393 ABORT: expected at least 55/% confident, got %', v_tot, v_conf;
  END IF;
  RAISE NOTICE '393 OK: % of % sellable dishes confident', v_conf, v_tot;
END $$;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '393_resolve_allergen_blockers_from_brands.sql',
  'claude-code',
  NULL,
  'MC 572c53b1. Resolves 6 of 10 allergen blockers from the brands in supplier_catalog + purchase history: rice noodle (ARO vermicelli + every purchased brand is rice) = no gluten, unblocking all 4 spring rolls; MONIN caramel = allergen-free; KUHNE gherkin + ARO dijon = mustard, which required adding the allergen-mustard tag (EU-14, previously absent from the taxonomy); coconut = not a tree nut under EU/UK/Thai FDA (CEO deferred, decision taken and documented). Still open: RAW-BEEF_SALAMI (Phuket Sausage resells an imported salami, no spec on file) and 3 BARADA chocolates (no supplier_catalog row). 45 -> 55 of 60 dishes confident.'
)
ON CONFLICT DO NOTHING;

-- DOWN:
--   UPDATE nomenclature SET allergen_reviewed_at=NULL, allergen_reviewed_by=NULL
--     WHERE product_code IN ('RAW-RICE_NOODLE','RAW-SYRUP_CARAMEL','RAW-PICKLED_GHERKIN',
--                            'RAW-MUSTARD-DIJON','RAW-COCONUT-MILK','SALE-NO_SHELL_COCONUT');
--   DELETE FROM nomenclature_tags nt USING tags t WHERE nt.tag_id=t.id AND t.slug='allergen-mustard';
--   DELETE FROM tags WHERE slug='allergen-mustard';
