-- 479_renumber_th_migrations_log_sync.sql
-- Housekeeping: point migration_log at the filenames this branch actually ships (MC f91194f7).
--
-- WHY: the Thai batch was applied to prod between 15:16 and 15:22 on 2026-10-16 under numbers
-- 466-471. Parallel sessions had taken 466, 467, 468, 469 and 471 for unrelated work in the same
-- hour (see [[gotcha_migration_number_collision_concurrent_sessions]] — the branch's last number
-- is not the project's). Renumbering the FILES without touching the log would leave
-- check_migrations reporting six applied migrations with no file and six files never applied.
--
-- This only renames rows. The schema changes themselves were applied under the old names and are
-- not re-run; every file carries ON CONFLICT DO NOTHING on its own log insert, so re-running a
-- file after this is a no-op rather than a duplicate row.
--
-- 466_dish_names_stay_english_in_every_language   -> 473_…
-- 467_th_translations_labels                      -> 474_…
-- 468_th_descriptions_and_allergen_clauses        -> 475_…
-- 469_th_ingredients_part1                        -> 476_…
-- 470_th_ingredients_part2                        -> 477_…  (470 was free, moved for a contiguous block)
-- 471_ru_new_allergen_tags_and_worklist_drops…    -> 478_…
--
-- CONTRACT-REVIEWED: touches migration_log only.

BEGIN;

WITH rename(old_name, new_name) AS (VALUES
  ('466_dish_names_stay_english_in_every_language.sql',           '473a_dish_names_stay_english_in_every_language.sql'),
  ('467_th_translations_labels.sql',                              '474_th_translations_labels.sql'),
  ('468_th_descriptions_and_allergen_clauses.sql',                '475_th_descriptions_and_allergen_clauses.sql'),
  ('469_th_ingredients_part1.sql',                                '476_th_ingredients_part1.sql'),
  ('470_th_ingredients_part2.sql',                                '477_th_ingredients_part2.sql'),
  ('471_ru_new_allergen_tags_and_worklist_drops_dish_names.sql',  '478_ru_new_allergen_tags_and_worklist_drops_dish_names.sql')
)
UPDATE migration_log m
SET filename = r.new_name,
    notes = COALESCE(m.notes, '') || ' [renumbered from ' || r.old_name || ' by mig 479: number taken by a parallel session]'
FROM rename r
WHERE m.filename = r.old_name
  AND NOT EXISTS (SELECT 1 FROM migration_log x WHERE x.filename = r.new_name);

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('479_renumber_th_migrations_log_sync.sql', 'claude-opus-session-c4754104', NULL,
  'Log sync: the Thai batch 466-471 is renumbered 473-478 (numbers collided with parallel sessions) (MC f91194f7)')
ON CONFLICT DO NOTHING;

COMMIT;
