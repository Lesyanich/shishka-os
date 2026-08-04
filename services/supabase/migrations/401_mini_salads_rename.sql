-- 401_mini_salads_rename.sql
-- Rename KP-FIN-SLD-SM '🥗 Small Salads' -> 'Mini Salads' to match the POS category
-- the owner created by hand in Loyverse on 2026-08-04.
--
-- Why the exact string matters: loyverse-sync handleCategories() links a DB category to a
-- Loyverse one by EXACT name equality —
--     const existingByName = new Map(existing.map(c => [c.name, c.id]))
--     const eid = existingByName.get(cat.name)
-- On a miss it does NOT link, it POSTs a brand-new category. So leaving our name as
-- '🥗 Small Salads' would have created a SECOND, duplicate section in the POS and left the
-- owner's hand-made 'Mini Salads' permanently empty.
--
-- After Settings -> Sync Categories runs, the pairing is held by loyverse_category_id (a
-- UUID), not by the name, and handleCategories short-circuits on `if (cat.loyverse_category_id)`.
-- The name is therefore free to change again afterwards without breaking the link — the 🥗
-- emoji gets restored for the website in a follow-up once the ID is populated.
--
-- Data-only. Idempotent. Reversible (set the name back).
--
-- CONTRACT-REVIEWED: safe for shishka.health. menu_public exposes this row as section_name,
-- and the section is not published yet (both SALE-*_SMALL rows are is_web_visible = false),
-- so no live card, section header or price changes. No column added, dropped or retyped.

UPDATE public.product_categories
SET name = 'Mini Salads',
    updated_at = now()
WHERE code = 'KP-FIN-SLD-SM'
  AND name <> 'Mini Salads';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '401_mini_salads_rename.sql',
  'claude-code',
  NULL,
  'Renamed KP-FIN-SLD-SM from "🥗 Small Salads" to "Mini Salads" to exactly match the Loyverse category the owner created by hand — handleCategories links by exact name equality and would otherwise have POSTed a duplicate section. Link is by loyverse_category_id afterwards, so the emoji can be restored later.'
)
ON CONFLICT DO NOTHING;
