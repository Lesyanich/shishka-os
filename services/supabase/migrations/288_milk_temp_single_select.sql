-- 288_milk_temp_single_select.sql
-- The Milk and Temperature modifier groups are inherently choose-one, but their
-- Loyverse lists carry min/max = null, so the website builder would render them
-- as multi-select (a guest could stack Cow + Oat + Almond). Mark them
-- single-choice (max_select = 1) so the builder renders a radio with the default
-- pick (Cow Milk / Hot) pre-selected.
--
-- min_select stays 0: a default is always selected and a radio can't be emptied,
-- so the dish never becomes "from ฿X" build-your-own — it keeps its flat price.
--
-- fn_refresh_dish_modifier_groups only upserts the (dish, list) attachment
-- (ON CONFLICT DO NOTHING) and never rewrites min/max, so these values survive
-- the Loyverse pull.

BEGIN;

UPDATE dish_modifier_groups
SET max_select = 1, min_select = 0
WHERE loyverse_modifier_list_id IN (
  '8105066d-7e6d-403f-b737-efb3b3a17a1c',  -- Milk (Cow ฿0 default / Oat·Almond·Coconut ฿25)
  '9238fecb-a800-40f0-9311-1aece967e562'   -- Temperature (Hot default / Iced)
);

INSERT INTO migration_log (filename, applied_by, status)
VALUES ('288_milk_temp_single_select.sql', 'manual', 'success')
ON CONFLICT DO NOTHING;

COMMIT;
