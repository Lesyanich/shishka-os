-- 467a_ru_hero_no_harm_moves_to_subline.sql
-- CEO copy change (2026-10-16, MC f91194f7): «Без вреда» moves out of the Russian hero title and
-- opens the subline instead.
--
--   title: «Вкусно. Чисто. Без вреда»  →  «Вкусно. Чисто.»
--   sub:   «Без рафинированных масел, …»
--        → «Без вреда: без рафинированных масел, глутамата и ультрапереработанных продуктов.
--           Только свежие ингредиенты»
--
-- A colon rather than a full stop, so the line does not open with «Без вреда. Без рафинированных…».
-- Same words, same order as asked. The English hero is untouched, so source_hash stays valid and
-- the row remains fresh.
--
-- CONTRACT-REVIEWED: data-only update of one content_translations row.

BEGIN;

UPDATE public.content_translations
SET value = value
      || jsonb_build_object('title', 'Вкусно. Чисто.')
      || jsonb_build_object('sub',
           E'Без вреда: без рафинированных масел, глутамата и ультрапереработанных продуктов.\nТолько свежие ингредиенты'),
    reviewed_at = NULL, reviewed_by = NULL
WHERE entity = 'site_content' AND entity_key = 'hero' AND field = 'data' AND lang = 'ru';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('467a_ru_hero_no_harm_moves_to_subline.sql', 'claude-opus-session-20399950', NULL,
  'RU hero: «Без вреда» moves from the title to the head of the subline (MC f91194f7)')
ON CONFLICT DO NOTHING;

COMMIT;
