-- 487_reconcile_migration_log_repo_drift.sql
-- MC c520decf — log<->repo reconciliation, the piece 483 left out of scope.
--
-- WHY. migration_log is the only record of what prod has actually run, and 13 of
-- its rows no longer describe anything in the repo. Twelve name a file that was
-- renumbered in a branch without shipping the matching log UPDATE; one file was
-- applied to prod but never self-registered. The cost is not a blocked commit —
-- the canary reads the FILE TREE, which is clean — it is that check_migrations()
-- permanently reports applied migrations with no file on disk, and that
-- v_migration_collisions shows 50 rows where a genuinely new collision would
-- have to be spotted. Standing noise in the two tools sessions use to see
-- migration state.
--
-- NO SCHEMA OR DATA CHANGE beyond migration_log.filename strings, one missing
-- migration_log row, and the migration_numbers registry rows that follow from
-- them.
--
-- MATCHED ON SLUG, NOT NUMBER, because the number is what changed. Each target
-- below is a file that exists in the repo at origin/main and has NO
-- migration_log row of its own; each source is a log row whose filename exists
-- nowhere in the repo. Every pair is 1:1 and the slug is identical.
--
--   221_staff_codes                         -> 244f_staff_codes
--   222_loyverse_sync_dish_staff_code       -> 244g_loyverse_sync_dish_staff_code
--   236_staff_schedule_templates            -> 244h_staff_schedule_templates
--   245_shopping_list                       -> 244i_shopping_list
--   249_barada_chocolate_catalog            -> 248a_barada_chocolate_catalog
--   225_orders_customer_channel             -> 224a_orders_customer_channel
--   226_public_menu_view                    -> 224b_public_menu_view
--   227_order_code_and_status               -> 224c_order_code_and_status
--   321_matcha_drink_section                -> 360_matcha_drink_section
--   322_fix_chocolate_section_and_drinks…   -> 361_fix_chocolate_section_and_drinks_order
--   338_thai_tea_category                   -> 358_thai_tea_category
--   339_thai_tea_modifiers_and_price        -> 359_thai_tea_modifiers_and_price
--
-- Six of those twelve clear a duplicate prefix outright (221, 222, 236, 249,
-- 321, 322). v_migration_collisions therefore goes 50 -> 44, NOT to 0, and the
-- residue is not drift: see the addendum in RENUMBERING-2026-06-11.md, which
-- accounts for all 44 row by row. In short, every remaining duplicate is a
-- number burned in prod by a file that is NOT in the repo — either sitting on a
-- branch still awaiting CEO merge (its renumbering belongs to the session that
-- merges it, and renaming the log row now would desync that branch), or present
-- on no git ref at all (applied and never committed; there is no file to point
-- at, and the row is the only evidence prod ran that SQL, so it stays).
--
-- 397 IS AN INSERT, NOT A RENAME. 397_public_holidays_and_substitute_credits.sql
-- is in main and applied to prod — holiday_credits, v_holiday_credit_balance,
-- fn_sync_holiday_credits and public_holidays.is_company_closed were all
-- verified present before this migration was written — but its self-register row
-- is absent, so check_migrations calls it pending and a re-run would be
-- attempted. Prefix 397 is free in the log; the guard accepts it.
--
-- THE GUARD IS NOT TOUCHED. trg_migration_log_guard_number fires on
-- UPDATE OF filename, which is exactly what this migration does. Every target
-- prefix below (224a-c, 244f-i, 248a, 358-361, 397) was checked free first; if
-- the guard rejects one, the target name is wrong and the fix is to re-derive
-- it, never to disable the trigger. Verified on a local PG14 fixture seeded with
-- these real rows, including a negative case proving the guard still rejects an
-- UPDATE into a taken prefix.
--
-- NUMBER CLAIMED, not guessed: fn_claim_migration_number() per
-- docs/constitution/technical-rules.md RULE-MIGRATION-NUMBERING.

BEGIN;

-- ── Preflight ───────────────────────────────────────────────────────────────
DO $preflight$
DECLARE
  v_src int;
  v_dst int;
BEGIN
  SELECT count(*) INTO v_src FROM public.migration_log
   WHERE filename = ANY (ARRAY['221_staff_codes.sql',
                 '222_loyverse_sync_dish_staff_code.sql',
                 '236_staff_schedule_templates.sql',
                 '245_shopping_list.sql',
                 '249_barada_chocolate_catalog.sql',
                 '225_orders_customer_channel.sql',
                 '226_public_menu_view.sql',
                 '227_order_code_and_status.sql',
                 '321_matcha_drink_section.sql',
                 '322_fix_chocolate_section_and_drinks_order.sql',
                 '338_thai_tea_category.sql',
                 '339_thai_tea_modifiers_and_price.sql']);
  IF v_src <> 12 THEN
    RAISE EXCEPTION 'ABORT: expected 12 pre-rename rows in migration_log, found %. Another session reconciled these already — re-derive the pairs before re-running.', v_src;
  END IF;

  SELECT count(*) INTO v_dst FROM public.migration_log
   WHERE filename = ANY (ARRAY['244f_staff_codes.sql',
                 '244g_loyverse_sync_dish_staff_code.sql',
                 '244h_staff_schedule_templates.sql',
                 '244i_shopping_list.sql',
                 '248a_barada_chocolate_catalog.sql',
                 '224a_orders_customer_channel.sql',
                 '224b_public_menu_view.sql',
                 '224c_order_code_and_status.sql',
                 '360_matcha_drink_section.sql',
                 '361_fix_chocolate_section_and_drinks_order.sql',
                 '358_thai_tea_category.sql',
                 '359_thai_tea_modifiers_and_price.sql',
                 '397_public_holidays_and_substitute_credits.sql']);
  IF v_dst <> 0 THEN
    RAISE EXCEPTION 'ABORT: % target name(s) already present in migration_log — nothing done.', v_dst;
  END IF;
END
$preflight$;

-- ── 1. Point the 12 stale rows at the filenames the repo actually ships ─────
WITH rename(old_name, new_name) AS (VALUES
  ('221_staff_codes.sql',                            '244f_staff_codes.sql'),
  ('222_loyverse_sync_dish_staff_code.sql',          '244g_loyverse_sync_dish_staff_code.sql'),
  ('236_staff_schedule_templates.sql',               '244h_staff_schedule_templates.sql'),
  ('245_shopping_list.sql',                          '244i_shopping_list.sql'),
  ('249_barada_chocolate_catalog.sql',               '248a_barada_chocolate_catalog.sql'),
  ('225_orders_customer_channel.sql',                '224a_orders_customer_channel.sql'),
  ('226_public_menu_view.sql',                       '224b_public_menu_view.sql'),
  ('227_order_code_and_status.sql',                  '224c_order_code_and_status.sql'),
  ('321_matcha_drink_section.sql',                   '360_matcha_drink_section.sql'),
  ('322_fix_chocolate_section_and_drinks_order.sql', '361_fix_chocolate_section_and_drinks_order.sql'),
  ('338_thai_tea_category.sql',                      '358_thai_tea_category.sql'),
  ('339_thai_tea_modifiers_and_price.sql',           '359_thai_tea_modifiers_and_price.sql')
)
UPDATE public.migration_log m
   SET filename = r.new_name,
       notes    = COALESCE(m.notes || ' ', '')
                  || '[log<->repo reconciliation by mig 487: the file was renumbered to '
                  || r.new_name || ' in the repo without a log UPDATE; applied to prod as '
                  || r.old_name || ']'
  FROM rename r
 WHERE m.filename = r.old_name;

-- ── 2. The one applied-but-unlogged migration ───────────────────────────────
INSERT INTO public.migration_log (filename, applied_by, status, checksum, notes)
VALUES ('397_public_holidays_and_substitute_credits.sql', 'claude-opus-session-eb56fda0', 'success', NULL,
        'Backfilled by mig 487. Applied to prod on or about 2026-07-31 alongside 395/396/398/399 from the '
     || 'same session, but its self-register row never landed, so check_migrations reported it pending. '
     || 'Objects verified present before backfilling: holiday_credits, v_holiday_credit_balance, '
     || 'fn_sync_holiday_credits, public_holidays.is_company_closed. applied_at here is the backfill time, '
     || 'not the original apply time, which is not recoverable.')
ON CONFLICT (filename) DO NOTHING;

-- ── 3. Keep the number registry honest ──────────────────────────────────────
-- 483 seeded migration_numbers from migration_log as it stood. These 13 prefixes
-- were not in it, so v_migration_number_map would call 358-361 and 397 "gap" —
-- i.e. reusable — when prod has in fact run them.
INSERT INTO public.migration_numbers (number, letter, slug, session_id, state, claimed_at, applied_at)
SELECT (substring(s.prefix FROM '^([0-9]+)'))::int,
       COALESCE(substring(s.prefix FROM '([a-z])$'), ''),
       public.fn_migration_slug_normalize(regexp_replace(s.filename, '^[0-9]+[a-z]?_|\.sql$', '', 'g')),
       'mig-487-reconcile', 'applied', s.applied_at, s.applied_at
  FROM (SELECT l.filename, l.applied_at, substring(l.filename FROM '^([0-9]+[a-z]?)') AS prefix
          FROM public.migration_log l
         WHERE l.filename = ANY (ARRAY['244f_staff_codes.sql',
                 '244g_loyverse_sync_dish_staff_code.sql',
                 '244h_staff_schedule_templates.sql',
                 '244i_shopping_list.sql',
                 '248a_barada_chocolate_catalog.sql',
                 '224a_orders_customer_channel.sql',
                 '224b_public_menu_view.sql',
                 '224c_order_code_and_status.sql',
                 '360_matcha_drink_section.sql',
                 '361_fix_chocolate_section_and_drinks_order.sql',
                 '358_thai_tea_category.sql',
                 '359_thai_tea_modifiers_and_price.sql',
                 '397_public_holidays_and_substitute_credits.sql'])) s
ON CONFLICT (number, letter) DO NOTHING;

-- ── Verify ──────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_new int;
  v_old int;
  v_397 int;
BEGIN
  SELECT count(*) INTO v_new FROM public.migration_log
   WHERE filename = ANY (ARRAY['244f_staff_codes.sql',
                 '244g_loyverse_sync_dish_staff_code.sql',
                 '244h_staff_schedule_templates.sql',
                 '244i_shopping_list.sql',
                 '248a_barada_chocolate_catalog.sql',
                 '224a_orders_customer_channel.sql',
                 '224b_public_menu_view.sql',
                 '224c_order_code_and_status.sql',
                 '360_matcha_drink_section.sql',
                 '361_fix_chocolate_section_and_drinks_order.sql',
                 '358_thai_tea_category.sql',
                 '359_thai_tea_modifiers_and_price.sql',
                 '397_public_holidays_and_substitute_credits.sql']);
  SELECT count(*) INTO v_old FROM public.migration_log
   WHERE filename = ANY (ARRAY['221_staff_codes.sql',
                 '222_loyverse_sync_dish_staff_code.sql',
                 '236_staff_schedule_templates.sql',
                 '245_shopping_list.sql',
                 '249_barada_chocolate_catalog.sql',
                 '225_orders_customer_channel.sql',
                 '226_public_menu_view.sql',
                 '227_order_code_and_status.sql',
                 '321_matcha_drink_section.sql',
                 '322_fix_chocolate_section_and_drinks_order.sql',
                 '338_thai_tea_category.sql',
                 '339_thai_tea_modifiers_and_price.sql']);
  SELECT count(*) INTO v_397 FROM public.migration_log
   WHERE filename = '397_public_holidays_and_substitute_credits.sql';

  IF v_new <> 13 OR v_old <> 0 OR v_397 <> 1 THEN
    RAISE EXCEPTION 'ABORT: reconciliation incomplete (reconciled=% of 13, stale=%, 397=%).', v_new, v_old, v_397;
  END IF;
END
$verify$;

-- ── Self-register (runs under the guard created by 483) ─────────────────────
INSERT INTO public.migration_log (filename, applied_by, checksum, notes)
VALUES ('487_reconcile_migration_log_repo_drift.sql', 'claude-opus-session-497729a4', NULL,
        'Log<->repo reconciliation (MC c520decf), follow-up to 483. Pointed 12 migration_log rows at the '
     || 'filenames the repo ships (renumbered in a branch without a log UPDATE) and backfilled the missing '
     || 'row for 397_public_holidays_and_substitute_credits, whose objects are in prod. '
     || 'v_migration_collisions 50 -> 44; the 44 are NOT drift and are accounted for row by row in '
     || 'RENUMBERING-2026-06-11.md (addendum 2026-10-16b): each is a number burned by a file that is on an '
     || 'unmerged branch (renumbering belongs to the merging session) or on no git ref at all. '
     || 'No schema change.')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
