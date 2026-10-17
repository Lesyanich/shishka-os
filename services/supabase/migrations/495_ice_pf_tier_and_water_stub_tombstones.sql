-- 495 — finish migration 493's two half-moves: ice's tier, and a water stub's redirect
--       (MC 00a81c22; follow-up to the review of PR #611)
--
-- Number claimed with fn_claim_migration_number, not guessed.
--
-- WHY. Reviewing 493 against production turned up two places where it did half the job. Neither
-- breaks anything today, which is exactly why they are worth closing now rather than leaving for
-- whoever trips over them.
--
--   §1 THE TIER MOVED BY NAME ONLY. 493 promoted ice out of the RAW tier because
--      fn_rollup_bom_costs seeds its recursion with `product_code NOT LIKE 'RAW-%'`, so a RAW-
--      item with a recipe never gets rolled up. It changed product_code, name and is_available —
--      and left `type` at 'raw_ingredient'. Verified in production: PF-ICE_CUBES is the only
--      live PF- row that is not 'semi_finished' (127 are; one other is NULL and is left alone
--      here, being nothing to do with ice). The cost rollup and v_cost_trust_nomenclature both
--      branch on the code prefix, which is why 493's asserts passed and why the number on screen
--      is right. But anything that keys off `type` now misclassifies ice: a prep list built from
--      type='semi_finished' silently omits the one item 493 declared we produce, and a purchasing
--      view built from type='raw_ingredient' offers in-house ice as something to buy — the very
--      premise ("ice costs 16.67/kg delivered") that 493 existed to destroy.
--
--   §2 A REDIRECT THAT GOES NOWHERE. fn_match_nomenclature's last level reads the destination
--      out of a '[MERGED->CODE]' name prefix. 493 pooled six bulk-water rows onto RAW-RO-WATER
--      from five different stubs but labelled only two of them. RAW-AUTO-33353416 ("Water .,
--      2000 L") came out of it holding zero rows and keeping its original name, so the next FM
--      chit with that exact line finds no barcode, no catalog entry and no redirect, and mints a
--      fresh stub — re-scattering the water 493 just finished consolidating.
--
-- DELIBERATELY NOT TOUCHED, so the next reader does not think they were missed:
--   * RAW-AUTO-aef8f2d4 ("2000 L Water") still holds one live row — the 2024-01-01 delivery 493
--     excluded for being outside the window mig 459 enforces. A '[MERGED->...]' prefix asserts
--     that everything moved, so putting one here would lie. Repointing that row is a cost
--     decision (water would go 0.1625 -> 0.1607/L) and belongs to whoever settles its date.
--   * RAW-AUTO-89739060 carries a '[JUNK-NO-MATCH]' prefix. That label is a decision, not an
--     oversight: its line text "267 2000 L" is OCR noise and is not worth a redirect.
--
-- NO DATA BEYOND THE TWO ROWS ABOVE. No purchase_logs row is touched, no cost is recomputed, and
-- nothing is deleted. Asserted in-transaction.
--
-- Applied through the Supabase connector, which wraps the whole file in one transaction.

BEGIN;

CREATE TEMP TABLE tmp_before AS
    SELECT id, product_code, cost_per_unit, cost_source, type FROM public.nomenclature;

CREATE TEMP TABLE tmp_money AS
    SELECT coalesce(sum(total_price), 0) AS s, count(*) AS c FROM public.purchase_logs;

-- Pre-flight: both targets must look the way the review found them.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.nomenclature
                    WHERE product_code = 'PF-ICE_CUBES' AND type = 'raw_ingredient') THEN
        RAISE EXCEPTION '495 abort: PF-ICE_CUBES is not the raw_ingredient row this migration expects';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.nomenclature
                    WHERE product_code = 'RAW-AUTO-33353416'
                      AND name NOT LIKE '[%') THEN
        RAISE EXCEPTION '495 abort: RAW-AUTO-33353416 is missing or already labelled';
    END IF;

    IF EXISTS (SELECT 1 FROM public.purchase_logs pl
                JOIN public.nomenclature n ON n.id = pl.nomenclature_id
               WHERE n.product_code = 'RAW-AUTO-33353416' AND pl.voided_at IS NULL) THEN
        RAISE EXCEPTION '495 abort: RAW-AUTO-33353416 still holds live purchase rows; a MERGED prefix would lie';
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- §1 Ice joins the tier it was promoted into.
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.nomenclature
   SET type = 'semi_finished', updated_at = now()
 WHERE product_code = 'PF-ICE_CUBES';

-- ──────────────────────────────────────────────────────────────────────────
-- §2 Give the emptied water stub the redirect the matcher can actually read.
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.nomenclature
   SET name = '[MERGED->RAW-RO-WATER] ' || name,
       is_deleted = true,
       is_available = false,
       updated_at = now()
 WHERE product_code = 'RAW-AUTO-33353416';

-- ──────────────────────────────────────────────────────────────────────────
-- Asserts. The redirect one is the point: it proves the next receipt line lands
-- on RO water instead of breeding a stub.
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE b record; a record; v_bad int; v_list text; v_code text; v_level text;
BEGIN
    SELECT * INTO b FROM tmp_money;
    SELECT coalesce(sum(total_price), 0) AS s, count(*) AS c INTO a FROM public.purchase_logs;
    IF a.s <> b.s OR a.c <> b.c THEN
        RAISE EXCEPTION '495 abort: money or rows moved, % / % -> % / %', b.s, b.c, a.s, a.c;
    END IF;

    -- Not one cost may move: this migration changes a tier label and a name, nothing priced.
    SELECT count(*), string_agg(n.product_code, ', ') INTO v_bad, v_list
      FROM public.nomenclature n JOIN tmp_before t ON t.id = n.id
     WHERE n.cost_per_unit IS DISTINCT FROM t.cost_per_unit
        OR n.cost_source IS DISTINCT FROM t.cost_source;
    IF v_bad > 0 THEN
        RAISE EXCEPTION '495 abort: % cost(s) moved: %', v_bad, v_list;
    END IF;

    IF (SELECT type FROM public.nomenclature WHERE product_code = 'PF-ICE_CUBES') <> 'semi_finished' THEN
        RAISE EXCEPTION '495 abort: ice did not reach the semi_finished tier';
    END IF;

    -- Ice keeps every user it had; the tier change must not disturb the BOM.
    IF (SELECT count(*) FROM public.bom_structures bs
          JOIN public.nomenclature n ON n.id = bs.ingredient_id
         WHERE n.product_code = 'PF-ICE_CUBES') <> 29 THEN
        RAISE EXCEPTION '495 abort: ice lost BOM references';
    END IF;

    -- The redirect now resolves. This is the behaviour the finding was about.
    SELECT n.product_code, m.match_level INTO v_code, v_level
      FROM public.fn_match_nomenclature(NULL, NULL, NULL, 'Water ., 2000 L', NULL) m
      LEFT JOIN public.nomenclature n ON n.id = m.nomenclature_id;
    IF v_code IS DISTINCT FROM 'RAW-RO-WATER' THEN
        RAISE EXCEPTION '495 abort: "Water ., 2000 L" still resolves to % at level %, expected RAW-RO-WATER',
            coalesce(v_code, '(none)'), v_level;
    END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('495_ice_pf_tier_and_water_stub_tombstones.sql', 'claude-opus-session-c7283135', 'success',
        'Closes two half-moves found reviewing 493 (PR #611). (1) PF-ICE_CUBES kept '
     || 'type=raw_ingredient after being promoted out of the RAW tier, leaving it the only live '
     || 'PF- row not semi_finished, so anything keying off `type` rather than the code prefix '
     || 'read in-house ice as a purchased ingredient. (2) RAW-AUTO-33353416 ("Water ., 2000 L") '
     || 'was emptied by 493 but never given the [MERGED->RAW-RO-WATER] prefix that '
     || 'fn_match_nomenclature''s tombstone level reads, so that receipt line would have minted a '
     || 'fresh stub instead of landing on RO water; asserted by replaying the line through the '
     || 'live matcher. RAW-AUTO-aef8f2d4 left alone on purpose: it still holds the 2024-01-01 row '
     || '493 excluded, and a MERGED prefix there would assert a move that did not happen. No '
     || 'purchase row touched, no cost recomputed, asserted in-transaction.')
ON CONFLICT (filename) DO NOTHING;

-- INTENTIONAL DROP — both are TEMP snapshot tables created by this migration above.
DROP TABLE tmp_before; DROP TABLE tmp_money;

COMMIT;
