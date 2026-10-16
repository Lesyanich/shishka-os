-- 473a_dish_names_stay_english_in_every_language.sql
-- CEO policy (2026-10-16, MC f91194f7): a dish NAME is never translated, in any language.
--
-- WHY: the guest orders at the counter by reading the name off their phone, and the cashier reads
-- the same name in the POS, in English. A Russian or Thai name the till does not know turns the
-- order into guesswork. The printed A4 menu has always worked this way — only the prose is
-- translated — and this aligns the site with it.
--
-- WHAT: removes the 86 Russian dish-name rows written by migs 448/452/463. Descriptions,
-- ingredient lists, categories, tags, modifiers and site copy stay translated. With the name row
-- gone, the site falls back to the English name by itself (i18n/localize.js), and the Russian cart
-- stops printing the English original under each line because the two now match.
--
-- Reversible: the texts live in migs 448, 452 and 463 if the policy ever changes.
--
-- CONTRACT-REVIEWED: data-only delete inside content_translations.

BEGIN;

DELETE FROM public.content_translations
WHERE entity = 'dish' AND field = 'name';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('473a_dish_names_stay_english_in_every_language.sql', 'claude-opus-session-20399950', NULL,
  'Dish names are never translated (CEO): dropped the RU dish-name rows; descriptions/ingredients stay (MC f91194f7)')
ON CONFLICT DO NOTHING;

COMMIT;
