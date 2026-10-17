-- 493 — ice becomes a PF made from RO water, and the RO-water canonical is settled
--       (MC cd76dcd7, on the CEO's decision)
--
-- APPLIED 2026-10-17. Closes the largest item left open by migration 488.
--
-- THE ANSWER CHANGED THE QUESTION. 488 left RAW-ICE_CUBES unsettled and asked the CEO what a
-- kilogram of ice costs delivered. The answer was that we do not buy ice at all — "лед мы сами
-- делаем из воды" — so 16.67/kg was never a price, and no purchase record could ever have
-- justified it. The canonical even said so all along: it was named "Ice Cubes (RO Water)".
-- The CEO chose the structural fix over a hand-set number: make ice a PF with a real recipe.
--
-- WHY THE RENAME IS LOAD-BEARING, not cosmetic. fn_rollup_bom_costs seeds its recursion with
--     WHERE n.is_available = TRUE AND n.product_code NOT LIKE 'RAW-%'
-- so a RAW- item that has a BOM is skipped and its cost is never rolled up. Giving ice a recipe
-- while leaving it RAW- would have changed nothing. Promoting it to PF- is what makes the
-- recipe actually drive the cost, and it is also what RULE-LEGO-ARCHITECTURE requires: we
-- produce ice, so it belongs in the PF tier. The UUID is unchanged, so all 29 BOM lines that
-- reference ice stay intact — only the code and the tier move.
--
-- WHAT THE RECEIPTS SUPPORT. Bulk water arrives as 2,000 L deliveries at 300-350 THB, roughly
-- monthly. Six such rows were scattered across five different RAW-AUTO stubs. Pooled onto
-- RAW-RO-WATER and normalized to litres they give 1,950 THB / 12,000 L = 0.1625 THB/L.
-- Note the number is robust: every delivery is the same volume at one of two prices, so the
-- per-litre figure sits between 0.15 and 0.175 no matter which subset is included. That is why
-- this could be settled without opening six more receipt photographs.
--
-- Ice therefore costs 0.1625/kg, against the 16.67 it was carrying — about 100x too high.
-- On a Thai Milk Tea the ice line falls from 3.33 to 0.03 and the dish's COGS from 14.96 to
-- 12.19; ice had been 22% of that drink's cost.
--
-- A SECOND DEFECT FOUND ON THE WAY. RAW-RO-WATER was already an ingredient in 15 other recipes
-- while costing 0, which is what pushed those dishes into 'no_cost'. Settling water fixes
-- those too, and that is where most of this migration's movement actually comes from.
--
-- SELECTION RULE, stated so it can be argued with: only rows whose own line text states the
-- 2,000 L volume (or that already carry quantity 2000) were moved. Deliberately NOT moved, and
-- still open:
--   * "Water delivery" @300, 07-04 — no volume on the line
--   * "Drinking Water (Inferred), 20L" @300, 20-03 — the volume contradicts the price
--   * "2000 L Water" @300 dated 2024-01-01 — outside the [today-2y] window mig 459 enforces
--   * three small "Water" rows at 30, 40 and 80 THB — could be bottled water for staff
--   * "Drinking water, 19L bottle" rows — a different product (RAW-WATER-DRINKING exists)
-- The ⚠ in stub-merge-map.md applies here: its fuzzy_candidate column suggests RAW-RO-WATER for
-- several of these, but that column is a pg_trgm hint and is explicitly not an instruction —
-- the same column maps "Grain Cube" and "Hmong Snack Cube" onto ice. None of it was followed.
--
-- Applied through the Supabase connector, which wraps the whole file in one transaction.

CREATE TEMP TABLE tmp_money AS
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c FROM public.purchase_logs;
CREATE TEMP TABLE tmp_before_cost AS
    SELECT id, product_code, cost_per_unit, cost_source FROM public.nomenclature;

CREATE TEMP TABLE tmp_water (pl_id uuid PRIMARY KEY, old_code text, evidence text);
INSERT INTO tmp_water VALUES
 ('5e37c72a-0a99-4231-9b62-fbf19c1578e2', 'RAW-AUTO-33353416', 'line "Water ., 2000 L" @300, 18-03-2026'),
 ('b4770d3b-3c54-4b45-858f-c6c63f34a88c', 'RAW-AUTO-89739060', 'line "267 2000 L" @300, 01-04-2026 (the 267 is OCR noise on a tombstoned junk stub; the volume and price match the series)'),
 ('9a7fd43b-6545-4f0c-9208-f5b5cb2342cd', 'RAW-AUTO-69961f11', 'line "FM Water 2000 L" @300, 11-04-2026 (this is the row mig 460 already rescued from morning glory)'),
 ('ec93dcc9-b057-45fb-a4bd-d2531d97e50d', 'RAW-AUTO-aef8f2d4',  'line "Item 2000" @350, 24-04-2026, on the stub named "2000 L Water"; price matches the later FM deliveries'),
 ('5cc00549-b8a1-493f-a2a2-36d901537b9d', 'RAW-AUTO-6bd87457',  'line "Water (30 X 9)" @350, 29-05-2026 — already booked as quantity 2000, i.e. already in litres'),
 ('570accb3-dd10-4898-b3f4-ef744885dac1', 'RAW-AUTO-69961f11', 'line "FM Water 2000 L" @350, 08-10-2026');

DO $$
DECLARE v_bad int; v_list text;
BEGIN
    SELECT count(*), string_agg(w.pl_id::text, ', ') INTO v_bad, v_list
      FROM tmp_water w
      LEFT JOIN public.purchase_logs pl ON pl.id = w.pl_id
      LEFT JOIN public.nomenclature n ON n.id = pl.nomenclature_id
     WHERE pl.id IS NULL OR pl.voided_at IS NOT NULL OR n.product_code <> w.old_code;
    IF v_bad > 0 THEN
        RAISE EXCEPTION '493 abort: % water row(s) missing or drifted: %', v_bad, v_list;
    END IF;
    IF (SELECT count(*) FROM public.nomenclature WHERE product_code='RAW-RO-WATER') <> 1 THEN
        RAISE EXCEPTION '493 abort: RAW-RO-WATER not found';
    END IF;
    IF (SELECT count(*) FROM public.nomenclature WHERE product_code='PF-ICE_CUBES') <> 0 THEN
        RAISE EXCEPTION '493 abort: PF-ICE_CUBES already exists';
    END IF;
END $$;

-- §1 Bulk water deliveries go onto the RO-water canonical, normalized to litres.
UPDATE public.purchase_logs pl
   SET nomenclature_id = (SELECT id FROM public.nomenclature WHERE product_code='RAW-RO-WATER'),
       quantity = 2000,
       price_per_unit = round(pl.total_price / 2000, 6),
       notes = coalesce(pl.notes,'') || ' [mig493 repoint ' || w.old_code
               || '->RAW-RO-WATER, qty ' || pl.quantity || '->2000 L; ' || w.evidence || ']'
  FROM tmp_water w
 WHERE pl.id = w.pl_id;

-- §2 Tombstone the two still-active stubs that this emptied (mig 325 pattern).
UPDATE public.nomenclature
   SET is_deleted = true, is_available = false,
       name = '[MERGED->RAW-RO-WATER] ' || name, updated_at = now()
 WHERE product_code IN ('RAW-AUTO-69961f11','RAW-AUTO-6bd87457')
   AND NOT EXISTS (SELECT 1 FROM public.purchase_logs pl
                    WHERE pl.nomenclature_id = nomenclature.id AND pl.voided_at IS NULL);

-- §3 Ice is produced in-house, so it belongs in the PF tier, not RAW. See the header for why
--    this rename is what makes the recipe drive the cost at all.
UPDATE public.nomenclature
   SET product_code = 'PF-ICE_CUBES',
       name = 'Ice Cubes (made in-house from RO water)',
       is_available = true,
       updated_at = now()
 WHERE product_code = 'RAW-ICE_CUBES';

-- §4 The recipe. 1 kg of ice is 1 kg of water: mass is conserved when water freezes, and RO
--    water is measured in litres at 1 kg/L, so 1 L in per 1 kg out, no yield loss.
INSERT INTO public.bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, 1, 0,
       'mig493: ice is frozen RO water, 1 L -> 1 kg, mass conserved. Excludes the ice machine''s '
    || 'electricity and amortisation, which this house books as OpEx and not as a BOM line.'
  FROM public.nomenclature p, public.nomenclature c
 WHERE p.product_code = 'PF-ICE_CUBES' AND c.product_code = 'RAW-RO-WATER';

DO $$
DECLARE b record; a record; v numeric; v_src text; v_bad int; v_list text;
BEGIN
    SELECT * INTO b FROM tmp_money;
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c INTO a FROM public.purchase_logs;
    IF a.s <> b.s OR a.c <> b.c THEN
        RAISE EXCEPTION '493 abort: money or rows moved, % / % -> % / %', b.s, b.c, a.s, a.c;
    END IF;

    SELECT cost_per_unit, cost_source INTO v, v_src
      FROM public.nomenclature WHERE product_code='RAW-RO-WATER';
    IF abs(v - 0.1625) > 0.0001 THEN
        RAISE EXCEPTION '493 abort: RO water landed on % (expected 0.1625 = 1950 THB / 12000 L)', v;
    END IF;

    SELECT cost_per_unit, cost_source INTO v, v_src
      FROM public.nomenclature WHERE product_code='PF-ICE_CUBES';
    IF abs(v - 0.1625) > 0.0001 THEN
        RAISE EXCEPTION '493 abort: ice rolled up to % (expected 0.1625)', v;
    END IF;

    -- Ice must now be costed FROM ITS RECIPE, not from a number somebody typed.
    IF (SELECT trust_class FROM public.v_cost_trust_nomenclature WHERE product_code='PF-ICE_CUBES')
       <> 'derived' THEN
        RAISE EXCEPTION '493 abort: ice did not reach trust_class derived';
    END IF;
    IF (SELECT trust_class FROM public.v_cost_trust_nomenclature WHERE product_code='RAW-RO-WATER')
       <> 'verified' THEN
        RAISE EXCEPTION '493 abort: RO water did not reach verified';
    END IF;

    -- Ice keeps every one of its 29 users.
    IF (SELECT count(*) FROM public.bom_structures bs
          JOIN public.nomenclature n ON n.id = bs.ingredient_id
         WHERE n.product_code = 'PF-ICE_CUBES') <> 29 THEN
        RAISE EXCEPTION '493 abort: ice lost BOM references in the rename';
    END IF;

    -- No RAW ingredient cost may move except RO water and the stubs this emptied.
    SELECT count(*), string_agg(product_code, ', ') INTO v_bad, v_list
      FROM (SELECT n.product_code FROM public.nomenclature n JOIN tmp_before_cost t ON t.id=n.id
             WHERE (n.cost_per_unit IS DISTINCT FROM t.cost_per_unit
                    OR n.cost_source IS DISTINCT FROM t.cost_source)
               AND n.product_code LIKE 'RAW-%'
               AND n.product_code NOT IN ('RAW-RO-WATER','RAW-AUTO-33353416','RAW-AUTO-89739060',
                                          'RAW-AUTO-69961f11','RAW-AUTO-6bd87457','RAW-AUTO-aef8f2d4')) s;
    IF v_bad > 0 THEN
        RAISE EXCEPTION '493 abort: % unintended ingredient cost change(s): %', v_bad, v_list;
    END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('493_ice_as_pf_and_ro_water_canonical.sql', 'claude-opus-session-58399a46', 'success',
        'MC cd76dcd7, on the CEO decision that ice is made in-house from water. Settled the RO '
     || 'water canonical: 6 bulk 2000 L delivery rows repointed onto RAW-RO-WATER and normalized '
     || 'to litres, giving a receipt-backed 0.1625 THB/L (1950 THB / 12000 L); two emptied stubs '
     || 'tombstoned. Promoted RAW-ICE_CUBES to PF-ICE_CUBES (the rename is required: '
     || 'fn_rollup_bom_costs skips RAW-%) and gave it a BOM of 1 L RO water per kg, so ice is now '
     || 'costed from its recipe at 0.1625/kg instead of a hand-typed 16.67 - about 100x too high. '
     || 'RO water was ALSO already an ingredient in 15 other recipes at cost zero; those are now '
     || 'costed too. total_price untouched, asserted.')
ON CONFLICT DO NOTHING;

-- INTENTIONAL DROP — all three are TEMP tables created by this migration above.
DROP TABLE tmp_money; DROP TABLE tmp_before_cost; DROP TABLE tmp_water;

-- ══════════════════════════════════════════════════════════════════════════
-- MEASURED, live sellable dishes (SALE-%, not deleted, pos_status='synced' = 133).
--
--                 before 488   before 493   after 493
--   unverified         71          54          49
--   no_cost            27          27          16
--   estimated           4          13          29
--   verified            4           8           8
--   manual              0           4           4
--   no_bom             26          26          26
--   deleted             1           1           1
--
-- Read it this way rather than by the unverified column alone: dishes carrying a cost anyone
-- can stand behind — verified, hand-set, or an acknowledged catalog estimate — went from 8 at
-- the start of this audit to 41. Dishes with no usable cost at all fell from 27 to 16.
-- The jump in 'estimated' is honest progress, not noise: those dishes previously had an
-- ingredient with NO cost or a cost contradicting its receipts; now their worst ingredient is
-- a known catalog estimate, which fn_rollup_bom_costs propagates upward by design.
--
-- STILL OPEN after this: turmeric (its receipt sheet was never stored), and the ingredients
-- outside the original top 15 — cocoa powder is now the biggest single blocker at 3 dishes.
-- ══════════════════════════════════════════════════════════════════════════
