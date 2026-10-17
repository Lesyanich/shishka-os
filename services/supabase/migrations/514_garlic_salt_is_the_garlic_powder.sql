-- 514 — the kitchen's "garlic powder" is McCormick Garlic Salt (MC 00a81c22)
--
-- APPLIED 2026-10-17. Number claimed with claim_migration_number, not guessed.
--
-- WHY. RAW-GARLIC-POWDER sat at a hand-typed zero (cost_source 'manual', never purchased) and was
-- the single blocker keeping SALE-TOAST_CHICKEN_TAWOOK — 81 units sold, the best seller among the
-- costless dishes — in 'no_cost' in v_dish_cost_trust. There was no garlic-powder purchase anywhere
-- in purchase_logs, supplier_catalog or the expense text, which looked like a gap in the receipts.
--
-- WHAT IT WAS. The CEO confirmed the kitchen uses McCormick Garlic Salt as its garlic powder. That
-- product WAS bought: SIAM MAKRO, 2026-07-25, 1 x 214 THB for 446 g. The receipt was read correctly
-- (Thai "แม็คคอร์มิคการลิค ซอลท์ 446ก." -> "McCormick Garlic Salt 446g") and has been sitting in
-- receipt_inbox with status 'parsed' ever since, because nobody approved it. The recognition was
-- fine; the line simply never reached purchase_logs. The same chit is one of ~13 Makro receipts
-- from 14 Jul - 8 Aug 2026 still waiting for approval.
--
-- THE PRICE. 214 THB / 0.446 kg = 479.8206 THB per kg. For scale: the recipes use 5 g per kg of
-- tawook chicken and 10 g per kg of shish kebab, so this adds about 2.40 and 4.80 THB per kg to a
-- semi-finished costing 130 and 498 — under 2 percent either way. The earlier candidates
-- (Phuengluang 380/kg, Hand Brand 635/kg) differed by 1.28 THB per kg of chicken, which is why the
-- brand question never needed to hold anything up.
--
-- WHY cost_source = 'catalog_estimate' AND NOT 'manual' OR 'wac'. A real receipt backs the number,
-- but it is not in purchase_logs, so 'wac' would claim a provenance the data does not have. 'manual'
-- would be worse: the cost triggers refuse to overwrite it, so approving the receipt later would
-- leave the figure frozen instead of replacing it. 'catalog_estimate' is replaced by the first real
-- purchase, and the menu badge already labels it honestly.
--
-- THE ALIAS IS THE SECOND HALF. Before this migration fn_match_nomenclature resolved the receipt
-- line "McCormick Garlic Salt 446g" to nothing, so approving that receipt would have minted a fresh
-- RAW-AUTO stub and re-created exactly the problem this audit exists to remove. The alias makes
-- the line land on RAW-GARLIC-POWDER at level name:aliases; the migration asserts it by replaying
-- the line through the live matcher. fn_normalize_product_name keeps the size token
-- ("mccormickgarlicsalt446g"), so the alias is the exact form the OCR produces. A different pack
-- size would need its own alias, which is deliberately not guessed at here.
--
-- A NOTE FOR THE CHEF, not a data question. Garlic salt is not garlic powder: it carries salt. At
-- 5-10 g per kg the contribution is small and the kitchen already works with it, but the
-- semi-finished names still say "garlic powder".
--
-- Applied through the Supabase connector, which wraps the whole file in one transaction.

BEGIN;

CREATE TEMP TABLE tmp_before_cost AS
    SELECT id, product_code, cost_per_unit, cost_source FROM public.nomenclature;
CREATE TEMP TABLE tmp_money AS
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c FROM public.purchase_logs;

DO $$
BEGIN
    -- Still the hand-typed zero this migration was written against, and still never purchased.
    IF NOT EXISTS (SELECT 1 FROM public.nomenclature
                    WHERE product_code = 'RAW-GARLIC-POWDER' AND base_unit = 'kg'
                      AND coalesce(cost_per_unit,0) = 0 AND cost_source = 'manual') THEN
        RAISE EXCEPTION '514 abort: RAW-GARLIC-POWDER is not the zero-cost, manual, kg row this migration expects';
    END IF;
    IF EXISTS (SELECT 1 FROM public.purchase_logs pl JOIN public.nomenclature n ON n.id = pl.nomenclature_id
                WHERE n.product_code = 'RAW-GARLIC-POWDER' AND pl.voided_at IS NULL) THEN
        RAISE EXCEPTION '514 abort: a real purchase now exists; a catalog estimate must not shadow it';
    END IF;
END $$;

-- McCormick Garlic Salt 446 g, SIAM MAKRO 2026-07-25, 1 x 214 THB (parsed, not yet approved):
-- 214 THB / 0.446 kg = 479.8206 THB per kg.
UPDATE public.nomenclature
   SET cost_per_unit = round(214 / 0.446, 4),
       cost_source   = 'catalog_estimate',
       aliases       = (SELECT array_agg(DISTINCT a) FROM unnest(coalesce(aliases, ARRAY[]::text[])
                                                               || ARRAY['McCormick Garlic Salt 446g']) a),
       updated_at    = now()
 WHERE product_code = 'RAW-GARLIC-POWDER';

DO $$
DECLARE v_before record; v_after record; v_bad int; v_list text; v numeric; v_code text; v_level text;
BEGIN
    SELECT * INTO v_before FROM tmp_money;
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c INTO v_after FROM public.purchase_logs;
    IF v_after.s <> v_before.s OR v_after.c <> v_before.c THEN
        RAISE EXCEPTION '514 abort: money or rows moved, % / % -> % / %', v_before.s, v_before.c, v_after.s, v_after.c;
    END IF;

    SELECT count(*), string_agg(n.product_code, ', ') INTO v_bad, v_list
      FROM public.nomenclature n JOIN tmp_before_cost t ON t.id = n.id
     WHERE (n.cost_per_unit IS DISTINCT FROM t.cost_per_unit OR n.cost_source IS DISTINCT FROM t.cost_source)
       AND n.product_code LIKE 'RAW-%' AND n.product_code <> 'RAW-GARLIC-POWDER';
    IF v_bad > 0 THEN
        RAISE EXCEPTION '514 abort: % unintended ingredient cost change(s): %', v_bad, v_list;
    END IF;

    SELECT cost_per_unit INTO v FROM public.nomenclature WHERE product_code = 'RAW-GARLIC-POWDER';
    IF abs(v - 479.8206) > 0.001 THEN
        RAISE EXCEPTION '514 abort: garlic powder landed on %, expected 479.8206', v;
    END IF;

    -- The alias is the second half of the point: the receipt line must now land on this item
    -- when someone approves it, instead of minting a fresh RAW-AUTO stub.
    SELECT n.product_code, m.match_level INTO v_code, v_level
      FROM public.fn_match_nomenclature(NULL, NULL, NULL, 'McCormick Garlic Salt 446g', 'แม็คคอร์มิคการลิค ซอลท์ 446ก.') m
      LEFT JOIN public.nomenclature n ON n.id = m.nomenclature_id;
    IF v_code IS DISTINCT FROM 'RAW-GARLIC-POWDER' THEN
        RAISE EXCEPTION '514 abort: the garlic-salt receipt line still resolves to % at level %', coalesce(v_code,'(none)'), v_level;
    END IF;

    -- And the tawook chain must now carry the cost.
    SELECT cost_per_unit INTO v FROM public.nomenclature WHERE product_code = 'PF-CHICKEN_GRILL_TAWOOK';
    IF v IS NULL OR v < 127.9 THEN
        RAISE EXCEPTION '514 abort: PF-CHICKEN_GRILL_TAWOOK did not pick up the garlic cost (now %)', v;
    END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('514_garlic_salt_is_the_garlic_powder.sql', 'claude-opus-session-477e2227', 'success',
        'MC 00a81c22. RAW-GARLIC-POWDER sat at a hand-typed zero (cost_source manual, never purchased) '
     || 'and blocked SALE-TOAST_CHICKEN_TAWOOK (81 units sold) in v_dish_cost_trust. The CEO confirmed the '
     || 'kitchen uses McCormick Garlic Salt as its garlic powder. Priced from the real, parsed-but-unapproved '
     || 'SIAM MAKRO receipt of 2026-07-25 (1 x 214 THB for 446 g = 479.8206/kg), recorded as '
     || 'catalog_estimate rather than manual so that approving the receipt later replaces it with a wac '
     || 'figure. Added the alias McCormick Garlic Salt 446g because the matcher resolved that line to '
     || 'nothing and approval would have minted a fresh RAW-AUTO stub; asserted by replaying the line. '
     || 'purchase_logs unchanged, no other ingredient cost moved, asserted.')
ON CONFLICT (filename) DO NOTHING;

-- INTENTIONAL DROP — both are TEMP snapshot tables created by this migration above.
DROP TABLE tmp_before_cost; DROP TABLE tmp_money;

COMMIT;
