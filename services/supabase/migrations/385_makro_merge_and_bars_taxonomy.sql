-- 385_makro_merge_and_bars_taxonomy.sql
--
-- Two findings from the CEO building PO-0001 at Makro on 2026-07-28.
--
-- 1. MAKRO EXISTS THREE TIMES.
--    Canonical `Makro` (c548db19, 586 purchases / 65 expenses / 406 catalog rows)
--    plus two rows the receipt importer created on its own:
--      CP Extra Public Company Limited (6f410324, 2026-07-03, 15 purchases, 1 expense)
--      SIAM MAKRO                      (87e532b1, 2026-07-17, 77 purchases, 7 expenses)
--    Spend on the same supplier is split across three ids, so the Price Book and
--    every per-supplier report undercount Makro.
--
--    Root cause is NOT missing alias data: `supplier_aliases` already carries
--    "CP Extra Public Co., Ltd.", "CP Axtra" and "ซีพี เอ็กซ์ตร้า" for Makro. The
--    importer simply never reads that table — `times_applied = 0` on all 40 alias
--    rows. This migration cleans the data and widens the alias list; making the
--    importer resolve through supplier_aliases is a separate task, and without it
--    a fourth Makro will appear.
--
-- 2. PROTEIN BARS HAD NO FINDABLE HOME.
--    `F-SNK-BAR "Energy Bars"` existed but held 0 items (the entire Snacks branch
--    is unused), and the name did not match what the CEO searched for. Bars stay
--    in Snacks rather than moving under `F-SUP-PRO "Protein & Supplements"`: that
--    branch is bulk functional powder dosed by the gram into drinks (kg, COGS
--    4103), a bar is a packaged unit counted in pieces (COGS 4109 Snacks). Mixing
--    them breaks both stock counting and food cost.
--
--    CEO ruling 2026-07-28: bars are bought for RESALE to guests. So they need a
--    sale side too — `menu_public` only shows `SALE-%` items, and a menu section
--    is the category the site groups them under. KP-FIN-BAR is that section.
--
-- Deliberately NOT here: the bar SKUs themselves. Which bars Makro actually
-- stocks is not yet decided, and inventing product codes, prices and pack sizes
-- would put guesses into the menu. The items land once the SKUs are picked.
--
-- Row counts verified against production immediately before writing this file.
--
-- CONTRACT-REVIEWED: menu_public appears here only in prose. No view, column or
-- filter is touched; the one menu-facing change adds an EMPTY category row, and
-- menu_public selects `product_code LIKE 'SALE-%' AND is_web_visible`, so a
-- section with no items contributes nothing. contract-check.mjs green after
-- applying: 75 menu_public rows across both endpoints, all named checks pass.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Merge the two duplicate Makro suppliers into the canonical row
-- ─────────────────────────────────────────────────────────────────────────────

-- Ledger rows: 92 purchases + 8 expenses move to Makro. Checked beforehand that
-- no (supplier_id, invoice_number) pair collides, so the partial unique index
-- idx_expense_ledger_no_duplicate_invoice cannot fire.
UPDATE purchase_logs
   SET supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
 WHERE supplier_id IN ('6f410324-3354-49ee-ba63-3ac8a57e364e',
                       '87e532b1-c51a-4967-9488-ffb17926fda6');

UPDATE expense_ledger
   SET supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
 WHERE supplier_id IN ('6f410324-3354-49ee-ba63-3ac8a57e364e',
                       '87e532b1-c51a-4967-9488-ffb17926fda6');

-- OCR classification rules. 20 of the 73 duplicate-owned rules restate a rule
-- Makro already has, with the same category_code and no conflicting verdict —
-- moving those would leave the classifier choosing between identical rows, so
-- drop them and repoint the 61 that are genuinely new.
DELETE FROM category_overrides d
 WHERE d.supplier_id IN ('6f410324-3354-49ee-ba63-3ac8a57e364e',
                         '87e532b1-c51a-4967-9488-ffb17926fda6')
   AND EXISTS (
     SELECT 1 FROM category_overrides m
      WHERE m.supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
        AND lower(m.match_pattern) = lower(d.match_pattern)
        AND m.match_field IS NOT DISTINCT FROM d.match_field
        AND m.flow_type   IS NOT DISTINCT FROM d.flow_type
   );

UPDATE category_overrides
   SET supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
 WHERE supplier_id IN ('6f410324-3354-49ee-ba63-3ac8a57e364e',
                       '87e532b1-c51a-4967-9488-ffb17926fda6');

-- The duplicates' own alias rows ("SIAM MAKRO", "CP Extra Public Company
-- Limited") are exactly the spellings that must resolve to Makro from now on.
UPDATE supplier_aliases
   SET supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
 WHERE supplier_id IN ('6f410324-3354-49ee-ba63-3ac8a57e364e',
                       '87e532b1-c51a-4967-9488-ffb17926fda6');

-- Empty today (0 rows each), included so the merge stays correct if rows land
-- on a duplicate between writing and applying this.
UPDATE correction_rules  SET supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
 WHERE supplier_id IN ('6f410324-3354-49ee-ba63-3ac8a57e364e','87e532b1-c51a-4967-9488-ffb17926fda6');
UPDATE gs1_weight_items  SET supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
 WHERE supplier_id IN ('6f410324-3354-49ee-ba63-3ac8a57e364e','87e532b1-c51a-4967-9488-ffb17926fda6');
UPDATE purchase_orders   SET supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
 WHERE supplier_id IN ('6f410324-3354-49ee-ba63-3ac8a57e364e','87e532b1-c51a-4967-9488-ffb17926fda6');
UPDATE supplier_catalog  SET supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
 WHERE supplier_id IN ('6f410324-3354-49ee-ba63-3ac8a57e364e','87e532b1-c51a-4967-9488-ffb17926fda6');
UPDATE supplier_files    SET supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
 WHERE supplier_id IN ('6f410324-3354-49ee-ba63-3ac8a57e364e','87e532b1-c51a-4967-9488-ffb17926fda6');
UPDATE unmatched_items   SET supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
 WHERE supplier_id IN ('6f410324-3354-49ee-ba63-3ac8a57e364e','87e532b1-c51a-4967-9488-ffb17926fda6');
UPDATE nomenclature      SET default_supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
 WHERE default_supplier_id IN ('6f410324-3354-49ee-ba63-3ac8a57e364e','87e532b1-c51a-4967-9488-ffb17926fda6');

-- Every legal-entity and receipt spelling of Makro seen so far, so the next
-- import has a row to match once the importer reads this table. The unique index
-- is on lower(alias); ON CONFLICT DO NOTHING skips whatever already exists.
INSERT INTO supplier_aliases (supplier_id, alias, source) VALUES
  ('c548db19-8a70-4f34-96af-d66162793cbf', 'SIAM MAKRO PUBLIC COMPANY LIMITED', 'manual'),
  ('c548db19-8a70-4f34-96af-d66162793cbf', 'Siam Makro',                        'manual'),
  ('c548db19-8a70-4f34-96af-d66162793cbf', 'Makro Rawai',                       'manual'),
  ('c548db19-8a70-4f34-96af-d66162793cbf', 'CP AXTRA PUBLIC COMPANY LIMITED',   'manual'),
  ('c548db19-8a70-4f34-96af-d66162793cbf', 'บริษัท ซีพี แอ็กซ์ตร้า จำกัด (มหาชน)',      'manual'),
  ('c548db19-8a70-4f34-96af-d66162793cbf', 'แม็คโคร',                             'manual')
ON CONFLICT DO NOTHING;

-- Retire the duplicates. Follows the existing convention ("[MERGED] Makro
-- Rawai", 2026-04-13): rename and soft-delete rather than DELETE, so any row
-- that still points here stays traceable to where its history went.
UPDATE suppliers
   SET name       = '[MERGED] ' || name,
       is_deleted = true,
       notes      = concat_ws(E'\n', notes,
                    'Merged into Makro (c548db19-8a70-4f34-96af-d66162793cbf) by migration 385 on 2026-07-28. Auto-created by the receipt importer, which does not resolve suppliers through supplier_aliases.'),
       updated_at = now()
 WHERE id IN ('6f410324-3354-49ee-ba63-3ac8a57e364e',
              '87e532b1-c51a-4967-9488-ffb17926fda6');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Bars taxonomy — purchase side
-- ─────────────────────────────────────────────────────────────────────────────

-- "Energy Bars" hid protein bars from anyone searching "protein" or "bar".
-- One subcategory covers both kinds: at the handful of SKUs a kitchen this size
-- carries, splitting protein from energy bars buys nothing and doubles the
-- places an item can be filed wrong.
UPDATE product_categories
   SET name       = '🍫 Bars (Protein & Energy)',
       name_th    = 'บาร์โปรตีน & บาร์พลังงาน',
       updated_at = now()
 WHERE code = 'F-SNK-BAR';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Bars taxonomy — sale side (resale to guests)
-- ─────────────────────────────────────────────────────────────────────────────

-- The section the site and POS group retail bars under. is_menu_section = true
-- because menu_public resolves an item's section as "this category if it is a
-- section, else its parent" — without the flag the bars would surface under
-- Finished Dishes. sort_order 9 puts them straight after Chocolate, the other
-- packaged retail shelf.
--
-- loyverse_category_id stays NULL: Loyverse categories are created in the Back
-- Office, and the id is filled in when the first bar is pushed to the POS.
-- Empty until then, and an empty section renders nowhere — the site builds its
-- chips from the sections of items that exist.
INSERT INTO product_categories
  (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code, is_active, is_menu_section)
SELECT 'KP-FIN-BAR', '🍫 Bars', 'บาร์', p.id, 3, 9, 4150, true, true
  FROM product_categories p
 WHERE p.code = 'KP-FIN'
ON CONFLICT (code) DO NOTHING;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '385_makro_merge_and_bars_taxonomy.sql',
  'claude-code',
  NULL,
  'Merge the two importer-created Makro duplicates (CP Extra Public Company Limited, SIAM MAKRO) into canonical Makro c548db19 and widen its alias list; rename F-SNK-BAR to "Bars (Protein & Energy)" and add retail menu section KP-FIN-BAR. CEO 2026-07-28: bars are for resale to guests. Importer still ignores supplier_aliases — follow-up task.'
)
ON CONFLICT DO NOTHING;

COMMIT;
