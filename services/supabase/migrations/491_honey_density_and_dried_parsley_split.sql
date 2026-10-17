-- 491 — honey density, and dried parsley split off fresh (MC cd76dcd7 follow-up)
--
-- APPLIED 2026-10-17. Follows migration 488, which settled 11 of the 15 widest-reach
-- ingredients and left four open pending CEO answers. Two of those answers arrived:
--   honey   — "смотри сам" (your call), so the density assumption below is mine and is stated
--             loudly rather than buried.
--   parsley — "да", approval to give dried parsley its own canonical.
-- Ice cubes and turmeric remain open and are untouched here.
--
-- ⚠ READ 492 TOO. This migration created RAW-PARSLEY-DRIED without noticing that a canonical
-- already existed under a different spelling, RAW-DRIED_PARSLEY. Migration 492 consolidates
-- them. The split itself was right; only the code name was a duplicate.
--
-- Applied through the Supabase connector, which wraps the whole file in one transaction.
--
-- CONTRACT-REVIEWED: the canary matches on `stock_state`, which this migration sets only on
-- the new RAW- row it inserts. menu_public exposes SALE- dishes, never RAW- ingredients, so
-- no column, view or row the public menu reads is touched. Verified with
-- `node scripts/contract-check.mjs` AFTER applying: green on both endpoints (Supabase and
-- shishka.health/sb), 81 dishes, 436 modifiers, 942 tags, all four assertions matched.
-- Stated honestly: the pre-apply run called for in the canary's step 1 was NOT done, because
-- the contract risk here was only recognised at commit time. The post-apply run is green and
-- the dish counts are unchanged from before, so nothing moved.
-- No column moved, so contracts/menu-contract.json in shishka-health needs no change.

CREATE TEMP TABLE tmp_before_cost AS
    SELECT id, product_code, cost_per_unit, cost_source FROM public.nomenclature;

CREATE TEMP TABLE tmp_money AS
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c FROM public.purchase_logs;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. RAW-HONEY (14 live dishes). 215.4566 -> 268.2241/kg.
--
-- Honey was the one ingredient 488 called possibly unsettleable, because its three rows are
-- measured two different ways. One is by WEIGHT and is image-confirmed. The other two are
-- bottles labelled by VOLUME against a kg base_unit, and no receipt can close that gap — only
-- a density can. 488 refused to guess; the CEO has now delegated the call.
--
-- The assumption, stated plainly so it can be overturned by anyone holding a bottle:
-- honey at roughly 17% moisture has a density of about 1.42 kg/L, so 760 ml weighs 1.0792 kg.
-- If a Wetchapong label states a net weight, that beats this and one UPDATE fixes it
-- (at a 1.0 kg net weight honey would land on 278.49 instead of 268.22 — a 4% difference,
-- which is why this was worth doing rather than leaving all three rows wrong).
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.purchase_logs pl SET
    quantity = v.q,
    price_per_unit = round(pl.total_price / v.q, 4),
    notes = coalesce(pl.notes,'') || ' [mig491 qty ' || pl.quantity || '->' || v.q || '; ' || v.why || ']'
FROM (VALUES
 ('67c79fd8-6f3e-4315-882a-5b46ede85cdf'::uuid, 1.0792::numeric,
  'Wetchapong honey 760 ml @315 converted at 1.42 kg/L (honey density, ~17% moisture) -> 1.0792 kg. ASSUMPTION, not a receipt reading: if the bottle label states a net weight, use it instead'),
 ('38ac94a5-a766-4df4-b126-0d8f36605357', 1.54,
  'image: Makro 00063 rcpt 062501196002 07-04-2026 "8850773620286 Doi Kham pure honey 100% 770 g X2" 1 pack of 2 @370 -> 1.54 kg BY WEIGHT, no density needed'),
 ('e520b157-08ba-45d0-9f5f-a441f6dd1d71', 1.0792,
  'Wetchapong honey 760 ml @307 converted at 1.42 kg/L. This row previously carried 1.54 - the Doi Kham WEIGHT applied to a 760 ml bottle, wrong under any density')
) AS v(pl_id, q, why)
WHERE pl.id = v.pl_id;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Dried parsley is a different ingredient from fresh and must not share its WAC.
--
-- Three rows sitting in RAW-PARSLEY are 50 g sachets at 48 and 69 THB — 960 to 1,380 per kilo,
-- against fresh parsley at about 350 on the other fourteen rows. The 07-03 photograph settles
-- it: the Hand Brand parsley sachet is listed directly beside the Hand Brand oregano that
-- RAW-OREGANO-DRIED already models, so the house already has a pattern for this.
--
-- ⚠ The code created here duplicates the pre-existing RAW-DRIED_PARSLEY. See 492.
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO public.nomenclature
    (product_code, name, base_unit, category_id, cost_source, stock_state,
     calories, protein, carbs, fat)
SELECT 'RAW-PARSLEY-DRIED', 'HAND BRAND Dried Parsley 50 g', 'kg',
       (SELECT category_id FROM public.nomenclature WHERE product_code = 'RAW-OREGANO-DRIED'),
       'none', 'in_stock',
       2920, 266, 506, 55
WHERE NOT EXISTS (SELECT 1 FROM public.nomenclature WHERE product_code = 'RAW-PARSLEY-DRIED');

UPDATE public.purchase_logs pl SET
    nomenclature_id = (SELECT id FROM public.nomenclature WHERE product_code = 'RAW-PARSLEY-DRIED'),
    quantity = 0.05,
    price_per_unit = round(pl.total_price / 0.05, 4),
    notes = coalesce(pl.notes,'') || ' [mig491 repoint RAW-PARSLEY->RAW-PARSLEY-DRIED, qty '
            || pl.quantity || '->0.05; ' || v.why || ']'
FROM (VALUES
 ('dcde48f4-a458-4b8f-8634-796239291f10'::uuid,
  'image: Makro rcpt 166501134002 07-03-2026 "8850885304173 Hand Brand parsley 50 g X1" @69, listed beside the Hand Brand oregano 100 g that RAW-OREGANO-DRIED already models'),
 ('35912815-b410-4b0d-a84b-4762cf95ff26',
  'line text "Hand Brand Dried Parsley 50g" @69 - same product, same price point'),
 ('88be4c7c-9617-40dc-8887-0e5e2a61b501',
  'line text "Parsley 50g" @48 = 960/kg. Fresh parsley is ~350/kg on 14 other rows, so a 50 g sachet at this price is a dried herb')
) AS v(pl_id, why)
WHERE pl.id = v.pl_id;

-- The repoint trigger (trg_recalc_wac_on_purchase_update) recalcs both sides, which is wanted
-- here: fresh parsley sheds the dried rows and lands on its real price, 321.8721 -> 347.9661.
-- Honey has no repoint, so it is recomputed explicitly.
DO $$
DECLARE v numeric;
BEGIN
    v := public.fn_recalc_wac_for_product((SELECT id FROM public.nomenclature WHERE product_code='RAW-HONEY'));
    IF v IS NULL OR abs(v - 268.2241) > 0.01 THEN
        RAISE EXCEPTION '491 abort: honey recomputed to %, expected 268.2241', v;
    END IF;
END $$;

DO $$
DECLARE b record; a record; v_bad int; v_list text; v numeric;
BEGIN
    SELECT * INTO b FROM tmp_money;
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c INTO a FROM public.purchase_logs;
    IF a.s <> b.s OR a.c <> b.c THEN
        RAISE EXCEPTION '491 abort: money or rows moved, % / % -> % / %', b.s, b.c, a.s, a.c;
    END IF;

    SELECT cost_per_unit INTO v FROM public.nomenclature WHERE product_code='RAW-PARSLEY';
    IF abs(v - 347.9661) > 0.01 THEN
        RAISE EXCEPTION '491 abort: parsley landed on %, expected 347.9661', v;
    END IF;
    SELECT cost_per_unit INTO v FROM public.nomenclature WHERE product_code='RAW-PARSLEY-DRIED';
    IF abs(v - 1240.0000) > 0.01 THEN
        RAISE EXCEPTION '491 abort: dried parsley landed on %, expected 1240', v;
    END IF;

    SELECT count(*), string_agg(product_code, ', ') INTO v_bad, v_list
      FROM (SELECT n.product_code FROM public.nomenclature n JOIN tmp_before_cost t ON t.id=n.id
             WHERE (n.cost_per_unit IS DISTINCT FROM t.cost_per_unit
                    OR n.cost_source IS DISTINCT FROM t.cost_source)
               AND n.product_code LIKE 'RAW-%'
               AND n.product_code NOT IN ('RAW-HONEY','RAW-PARSLEY','RAW-PARSLEY-DRIED')) s;
    IF v_bad > 0 THEN
        RAISE EXCEPTION '491 abort: % unintended ingredient cost change(s): %', v_bad, v_list;
    END IF;

    SELECT count(*), string_agg(product_code, ', ') INTO v_bad, v_list
      FROM public.v_cost_trust_nomenclature
     WHERE product_code IN ('RAW-HONEY','RAW-PARSLEY') AND trust_class <> 'verified';
    IF v_bad > 0 THEN
        RAISE EXCEPTION '491 abort: % did not reach verified: %', v_bad, v_list;
    END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('491_honey_density_and_dried_parsley_split.sql', 'claude-opus-session-58399a46', 'success',
        'MC cd76dcd7 follow-up, on CEO answers. Honey: Doi Kham row image-confirmed at 1.54 kg '
     || 'by weight; the two Wetchapong 760 ml rows converted at the honey density 1.42 kg/L '
     || '(stated assumption, correctable from the bottle label). WAC 215.4566 -> 268.2241, now '
     || 'verified. Parsley: created RAW-PARSLEY-DRIED and moved 3 fifty-gram sachet rows off '
     || 'fresh parsley; fresh lands at 347.9661 (verified), dried at 1240.00. total_price '
     || 'untouched, asserted. Ice cubes and turmeric still open.')
ON CONFLICT DO NOTHING;

-- INTENTIONAL DROP — both are TEMP snapshot tables created by this migration above.
DROP TABLE tmp_before_cost; DROP TABLE tmp_money;

-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DID NOT MOVE, and that matters more than what it did.
-- Honey and parsley both reached 'verified', and the live-dish distribution did NOT change:
-- still 54 unverified. Every dish those two touch is also blocked by something else.
-- The blocker that actually matters is RAW-ICE_CUBES: it blocks 17 live dishes and is the
-- SOLE remaining blocker for 11 of them. Nothing else comes close (cocoa powder is next, at 3).
-- Ice is made in-house from RO water, so it was never a purchase and 16.67/kg was never a
-- price. Bulk water is receipt-backed at 0.175/L across five 2,000 L deliveries. Settling ice
-- is one decision away from being the single biggest win left on this whole audit.
-- ══════════════════════════════════════════════════════════════════════════
