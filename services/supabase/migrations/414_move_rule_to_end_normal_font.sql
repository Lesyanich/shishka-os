-- 414_move_rule_to_end_normal_font.sql
--
-- Move "The Rule" section to the end of the site
-- Change from large heading style to normal font
--
-- CONTRACT-REVIEWED: safe. Updates site_content data payload (afterCategory + style fields).
-- No schema changes, no row count changes. shishka.health reads site_content and will
-- correctly render the new layout position and styling.

BEGIN;

UPDATE site_content
SET data = jsonb_set(
  jsonb_set(
    data,
    '{afterCategory}',
    '999'
  ),
  '{style}',
  '"normal"'
)
WHERE key = 'rule';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '414_move_rule_to_end_normal_font.sql',
  'claude-code',
  NULL,
  'Move "The Rule" section to end of site (afterCategory:999) and change to normal font style'
)
ON CONFLICT DO NOTHING;

COMMIT;
