-- 472_renumber_463_465_466_collision_log_sync.sql
-- Repo hygiene. Renames three migration_log rows to match files renumbered in
-- the same commit. NO SCHEMA OR DATA CHANGE beyond those three filename strings.
--
-- WHY. Three numbers were each applied twice on 2026-10-16 by parallel sessions
-- that merged without renumbering: 463, 465 and 466. The pre-commit canary
-- (scripts/migration-canary.sh --check-numbering) refuses any migration commit
-- while duplicates exist, so this was blocking every session in the repo, not
-- just the one that noticed.
--
-- RULE, unchanged from RENUMBERING-2026-06-11.md: per colliding number the
-- EARLIEST-APPLIED file keeps its name; each later duplicate moves to
-- <anchor><letter>_, where anchor is the numeric prefix of the latest kept-name
-- migration applied strictly before it. That makes lexicographic replay order
-- match the order the migrations actually hit prod.
--
-- Applied order on 2026-10-16 (UTC), keepers marked *:
--   12:45:47 * 463_ru_translations_catch_up_wraps
--   12:49:40 * 464_menu_translations_owner_rights_freshness
--   12:50:33 * 460_purchase_logs_historical_repair
--   13:05:00 * 465_pack_factor_normalization
--   13:10:27 * 466_tomato_paste_pack_factor
--   13:11:03   466_retire_potato_tacos        -> 466a  (anchor 466_tomato_paste)
--   13:14:25   463_analytics_views_s1         -> 466b  (anchor 466_tomato_paste)
--   13:15:38 * 467_unlink_stale_taco_loyverse_pointer
--   13:17:58   465_ru_hero_no_harm_moves_to_subline -> 467a (anchor 467_unlink)
--   13:37:53 * 468_count_class_clear_stubs_and_deleted
--   15:19:10 * 469_allergen_tag_backfill
--
-- Note 466_retire_potato_tacos is this session's own file and it moves, because
-- 466_tomato_paste_pack_factor beat it to the number by 36 seconds. The rule is
-- applied to it exactly as to the other two.
--
-- NUMBERED 472, not 470 or 471. Both are gap numbers already applied to prod
-- from branches that are not merged yet (470_th_ingredients_part2,
-- 471_ru_new_allergen_tags_and_worklist_drops_dish_names), and the standing
-- instruction is never to reuse a gap number.
--
-- THIS DOES NOT FIX THE CAUSE, and the cause is live. While this file was being
-- written, prod's migration_log accumulated further same-number pairs from
-- sessions still running — 466, 467, 468 and 469 each have an extra row from
-- unmerged branches. Those files are not in the repo yet, so they are out of
-- scope here and will collide again when their branches merge. Numbers are
-- being handed out by "max + 1 at the moment I look", which cannot work with
-- several sessions applying migrations in the same minute. The durable fix is an
-- allocation mechanism, not another renumbering pass.

BEGIN;

DO $guard$
DECLARE
  v_found int;
BEGIN
  SELECT count(*) INTO v_found
    FROM public.migration_log
   WHERE filename IN ('466_retire_potato_tacos.sql',
                      '463_analytics_views_s1.sql',
                      '465_ru_hero_no_harm_moves_to_subline.sql');
  IF v_found <> 3 THEN
    RAISE EXCEPTION 'ABORT: expected the 3 pre-rename rows, found %. Someone renamed them already.', v_found;
  END IF;

  SELECT count(*) INTO v_found
    FROM public.migration_log
   WHERE filename IN ('466a_retire_potato_tacos.sql',
                      '466b_analytics_views_s1.sql',
                      '467a_ru_hero_no_harm_moves_to_subline.sql');
  IF v_found <> 0 THEN
    RAISE EXCEPTION 'ABORT: % target name(s) already exist in migration_log.', v_found;
  END IF;
END
$guard$;

UPDATE public.migration_log SET filename = '466a_retire_potato_tacos.sql'
 WHERE filename = '466_retire_potato_tacos.sql';

UPDATE public.migration_log SET filename = '466b_analytics_views_s1.sql'
 WHERE filename = '463_analytics_views_s1.sql';

UPDATE public.migration_log SET filename = '467a_ru_hero_no_harm_moves_to_subline.sql'
 WHERE filename = '465_ru_hero_no_harm_moves_to_subline.sql';

DO $verify$
DECLARE
  v_new int;
  v_old int;
BEGIN
  SELECT count(*) INTO v_new FROM public.migration_log
   WHERE filename IN ('466a_retire_potato_tacos.sql',
                      '466b_analytics_views_s1.sql',
                      '467a_ru_hero_no_harm_moves_to_subline.sql');
  SELECT count(*) INTO v_old FROM public.migration_log
   WHERE filename IN ('466_retire_potato_tacos.sql',
                      '463_analytics_views_s1.sql',
                      '465_ru_hero_no_harm_moves_to_subline.sql');
  IF v_new <> 3 OR v_old <> 0 THEN
    RAISE EXCEPTION 'ABORT: rename incomplete (new=%, old=%).', v_new, v_old;
  END IF;
END
$verify$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('472_renumber_463_465_466_collision_log_sync.sql', 'claude-opus-session-5bddb375', 'success',
        'Repo hygiene, no schema change. Renamed 3 migration_log rows to match files renumbered in the same '
     || 'commit: 466_retire_potato_tacos -> 466a, 463_analytics_views_s1 -> 466b, '
     || '465_ru_hero_no_harm_moves_to_subline -> 467a. Numbers 463/465/466 had each been applied twice on '
     || '2026-10-16 by parallel sessions, and the pre-commit canary blocks EVERY migration commit in the repo '
     || 'while duplicates exist. Rule per RENUMBERING-2026-06-11.md: earliest-applied keeps its name, later '
     || 'duplicates move to <anchor><letter> where anchor is the last kept-name migration applied before them, '
     || 'so lexicographic order matches applied order. Numbered 472 because 470 and 471 are gap numbers already '
     || 'applied from unmerged branches. CAUSE NOT FIXED: numbers are allocated as "max+1 when I look", which '
     || 'collides whenever two sessions apply in the same minute; prod already holds further unmerged '
     || 'same-number pairs at 466-469.')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
