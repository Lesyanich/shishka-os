-- 427_retire_lemonades.sql
-- CEO, 2026-08-30: "we canceled Lemonades". All four go.
--
-- SCOPE IS THE TILL ONLY. All four are already is_web_visible = false and none
-- of them appear in menu_public, so shishka.health never showed them and this
-- migration cannot change the public menu. What they ARE is live on the POS:
-- is_available = true, pos_status = 'synced', linked to a Loyverse item, and
-- sitting in the uncategorised pile on the cashier screen.
--
-- NOTHING DEPENDS ON THEM. Checked before writing: no other dish sits in the
-- Lemonades category, and no BOM anywhere consumes a SALE-LEMONADE_* as a
-- component. The only attachments are four dish_modifier_groups rows.
--
-- THOSE FOUR MODIFIER ROWS ARE A MIS-ATTACHMENT AND ARE DELETED, NOT LEFT.
-- Every lemonade carries loyverse_modifier_list_id 6d699d24 -- the "Coffee
-- Boosters" group -- so the till has been offering an espresso shot as an
-- add-on to a lemonade since 2026-08-11. Retiring the dish would hide it, but
-- the row would survive and re-attach the moment anyone revived the drinks.
-- Deleting the attachment is the honest fix. The modifier LIST itself is
-- shared with Coffee, Matcha and Thai Tea and is deliberately left alone.
--
-- THE CATEGORY IS DEACTIVATED because these four were its only members, and an
-- empty section is exactly the untidiness this cleanup is meant to remove.
--
-- loyverse_item_id IS DELIBERATELY LEFT SET. The till removal runs afterwards
-- as queue action='delete', and handleDeleteDish resolves the dish to its
-- Loyverse item through that column -- clearing it here would strand the four
-- items on the POS with no way to find them. The delete handler nulls the link
-- and sets pos_status = 'draft' itself once Loyverse confirms.
--
-- Loyverse delete is a soft-delete and is recoverable from Back Office.
--
-- CONTRACT-REVIEWED: values only, no columns or view definitions touched. All
-- four dishes were already is_web_visible = false and absent from menu_public,
-- so the public menu is byte-identical before and after.
-- scripts/contract-check.mjs green on both the Supabase and shishka.health
-- endpoints after apply (menu_public still 87 rows, no-null-price 0, all named
-- pools intact).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Drop the bogus Coffee Boosters attachment
-- ---------------------------------------------------------------------------
DELETE FROM public.dish_modifier_groups d
 USING public.nomenclature n
 WHERE n.id = d.dish_id
   AND n.product_code LIKE 'SALE-LEMONADE%';

-- ---------------------------------------------------------------------------
-- 2. Retire the four drinks
-- ---------------------------------------------------------------------------
UPDATE public.nomenclature
   SET is_available   = FALSE,
       is_web_visible = FALSE,
       updated_at     = now()
 WHERE product_code IN ('SALE-LEMONADE_CLASSIC',
                        'SALE-LEMONADE_GINGER',
                        'SALE-LEMONADE_MINT',
                        'SALE-LEMONADE_PASSIONFRUIT');

-- ---------------------------------------------------------------------------
-- 3. Deactivate the now-empty section
-- ---------------------------------------------------------------------------
UPDATE public.product_categories
   SET is_active = FALSE, updated_at = now()
 WHERE name LIKE '%Lemonade%'
   AND NOT EXISTS (SELECT 1 FROM public.nomenclature n
                    WHERE n.category_id = product_categories.id
                      AND n.is_available);

-- ---------------------------------------------------------------------------
-- 4. Register
-- ---------------------------------------------------------------------------
INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES (
  '427_retire_lemonades.sql',
  'claude-opus-session-a1378b2f',
  'success',
  'CEO 2026-08-30 cancelled the Lemonades. Retired all 4 (SALE-LEMONADE_CLASSIC/GINGER/MINT/PASSIONFRUIT, 85 THB each) and deactivated the now-empty Lemonades category. Web unaffected: all 4 were already is_web_visible=false and absent from menu_public. Also deleted 4 dish_modifier_groups rows that wrongly attached the shared "Coffee Boosters" modifier list (6d699d24) to lemonades since 2026-08-11 - the list itself is shared with Coffee/Matcha/Thai Tea and is untouched. loyverse_item_id left set on purpose so the follow-up queue action=delete can resolve each dish to its till item; that handler nulls the link and sets pos_status=draft. Part of the POS cleanup: till is carrying 189 items against a 135-dish menu.'
)
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- ROLLBACK (manual, if ever needed)
--
-- Restores the drinks and the section. It does NOT recreate the Coffee
-- Boosters attachment -- that was a bug, not a feature. It also does not undo
-- the Loyverse delete: re-add the items from Back Office (soft-deleted, so
-- they are recoverable) or re-push with queue action='dish'.
-- ---------------------------------------------------------------------------
-- BEGIN;
--   UPDATE public.nomenclature SET is_available = TRUE
--    WHERE product_code IN ('SALE-LEMONADE_CLASSIC','SALE-LEMONADE_GINGER',
--                           'SALE-LEMONADE_MINT','SALE-LEMONADE_PASSIONFRUIT');
--   UPDATE public.product_categories SET is_active = TRUE WHERE name LIKE '%Lemonade%';
-- COMMIT;
