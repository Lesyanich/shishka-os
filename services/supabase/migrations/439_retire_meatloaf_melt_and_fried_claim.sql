-- 439_retire_meatloaf_melt_and_fried_claim.sql
-- CEO 2026-09-08: "remove no Fried Food anywhere / Ham Meatloaf Melt anywhere /
--                  update the website and POS and database"
--
-- Two unrelated removals that happen to share a session. Kept in one migration because
-- both are pure value changes on live customer-facing data and neither has a schema part.
--
-- 1. THE BRAND CLAIM. site_content key='rule' drives the red "no ..." strip on
--    shishka.health (BrandRule.jsx reads the jsonb at runtime; the array in
--    src/lib/content.js is only the offline fallback and is edited in the same PR).
--    Dropping "fried food" leaves five items. Note the array is deliberately mixed —
--    plain strings deny, objects with deny:false are positive claims — so the filter
--    compares whole jsonb elements rather than reaching for a ->>'label'.
--
-- 2. THE DISH. SALE-SANDWICH_MEATLOAF_MELT, 199 THB, live in "Wraps & Toasts" since
--    2026-08-09. Archived by the mig-352 convention: the '[ARCHIVED] ' name prefix is
--    what trg_guard_web_visible_when_archived keys on, so the row can never be re-shown
--    on the site by a later stray is_web_visible flip. Setting is_web_visible=false here
--    as well is redundant with that trigger and deliberate — the migration should read
--    correctly on its own.
--
--    RAW-MEATLOAF_SLICED goes with it. The melt was its only consumer (verified against
--    bom_structures), and it is the row MC be0c9433 flagged as a NULL-allergen exposure
--    on a printed board. Leaving an orphan raw behind would keep it in supplier and
--    shopping-list surfaces for a dish nobody can order.
--
--    BOM lines are NOT deleted. An archived dish with its recipe intact can be revived;
--    an archived dish with an empty BOM is just a broken row.
--
-- CONTRACT-REVIEWED: values only, no shape change. site_content keeps its 4 rows and the
--   'rule' row keeps its {eyebrow, lead, items, afterCategory} keys — only one element
--   leaves the items array, which BrandRule.jsx already renders as a variable-length list.
--   menu_public loses one row (87 -> 86) through the existing is_web_visible gate, which is
--   what retiring a dish is supposed to do. contract-check.mjs green against both the direct
--   Supabase endpoint and https://shishka.health/sb after apply.
BEGIN;

-- 1. Brand rule: drop "fried food" ------------------------------------------------------
UPDATE public.site_content
SET data = jsonb_set(
      data,
      '{items}',
      (SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
         FROM jsonb_array_elements(data -> 'items') WITH ORDINALITY AS t(elem, ord)
        WHERE elem <> '"fried food"'::jsonb)
    ),
    updated_at = now()
WHERE key = 'rule'
  AND data -> 'items' @> '["fried food"]'::jsonb;

-- 2. Archive the dish and its orphaned raw ----------------------------------------------
UPDATE public.nomenclature
SET name           = '[ARCHIVED] ' || name,
    is_available   = false,
    is_web_visible = false
WHERE id IN (
        '0f0e5084-4aff-4370-bed1-c540623e2dd5',  -- SALE-SANDWICH_MEATLOAF_MELT
        'a8304a16-ce09-4953-ae6b-6b852316d344'   -- RAW-MEATLOAF_SLICED
      )
  AND name NOT ILIKE '[ARCHIVED]%';

-- 3. Pull it off the Loyverse till -------------------------------------------------------
-- handleDeleteDish resolves loyverse_item_id from the row, nulls the link and drops
-- pos_status back to 'draft'. That null is also this statement's idempotency guard: a
-- second run of the migration queues nothing. Loyverse deletes are soft and restorable
-- from Back Office, so this is reversible from both ends.
INSERT INTO public.loyverse_push_queue (action, target_id, status, requested_by)
SELECT 'delete', n.id, 'pending', 'migration-439'
FROM public.nomenclature n
WHERE n.id = '0f0e5084-4aff-4370-bed1-c540623e2dd5'
  AND n.loyverse_item_id IS NOT NULL;

-- 4. Self-register in migration_log (RULE-MIGRATION-TRACKING) ----------------------------
INSERT INTO public.migration_log (filename, notes, checksum)
VALUES (
  '439_retire_meatloaf_melt_and_fried_claim.sql',
  'CEO 2026-09-08. (a) site_content key=rule: "fried food" removed from the brand strip, 5 items remain. (b) SALE-SANDWICH_MEATLOAF_MELT (199 THB) and its sole-consumer RAW-MEATLOAF_SLICED archived via the mig-352 [ARCHIVED] convention; BOM kept. (c) Loyverse item f45c51f8-9648-4043-8ddb-fd1b2b13302e queued for delete. Web-side copy (content.js, BrandRule.jsx, boardPicks.js, aeo-prerender.mjs) ships in the shishka-health PR. MC 6251c04c.',
  NULL
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
