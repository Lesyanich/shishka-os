-- ============================================================
-- Migration 482: Cost trust classification (read-only views)
--
-- MC 160040d2 — "the owner cannot tell a verified cost from a fabricated one".
--
-- NUMBERING: this file has moved three times, 464 -> 469 -> 480 -> 482, because other
-- sessions were applying migrations the same afternoon. 469 collided with
-- 469_allergen_tag_backfill.sql and 480 with 480_retire_rice_paper_rolls.sql; the latter
-- owns 480+481 as a pair while this is a lone file, so this one moved again. 481 is
-- taken by 481_unlink_stale_manakish_loyverse_pointers.sql, so 482 it is.
-- migration_log is the authority on what is taken, never the repo directory — ask it.
-- The log rows written under the earlier names are corrected below, the way
-- 472_renumber_463_465_466_collision_log_sync.sql and 479_renumber_th_migrations_log_sync.sql
-- did for other sessions' collisions the same day.
--
-- PROBLEM
--   nomenclature.cost_per_unit is rendered everywhere as a bare number. A hand-set
--   cost, a Makro catalog estimate and a WAC derived from corrupt purchase_logs all
--   look identical. Of 138 live sellable SALE-* dishes only 19 have a cost backed by
--   real purchases; 28 have no BOM at all and display 0.00 (a 100% margin fiction).
--
-- SOLUTION — two views, no data is touched, no column is added:
--   1. v_cost_trust_nomenclature — per nomenclature row: what evidence stands behind
--      its stored cost (purchase history / catalog / a human / nothing).
--   2. v_dish_cost_trust — rolls that up the BOM tree per sellable item and reports
--      the WORST class found plus the ingredient that caused it, so a tooltip can
--      name it. The frontend classifies nothing.
--
-- WHY THE VIEWS DO NOT ACCUSE
--   A divergence between the stored cost and the purchase history means "one of these
--   two is wrong and we cannot tell which without the receipt" — NOT "the displayed
--   number is wrong". The 2026-10-16 audit established the opposite for spices and
--   oils: there the STORED cost is the plausible one and purchase_logs is the corrupt
--   source (a 100 g pack booked as 1 kg — the factor-10/20 pattern). Hence the class
--   is named `unverified`, never `wrong`, and the UI copy must follow.
--
-- TOLERANCE — 20%, measured, not guessed
--   Stored WAC is recomputed from the very rows we compare against, so in a healthy
--   chain stored == SUM(total_price)/SUM(quantity) to within rounding. Divergence of
--   the 555 non-deleted cost_source='wac' rows that have purchase history, bucketed
--   on 2026-10-16:
--       0-10%  477      40-50%   5
--      10-20%   20      50-60%  11
--      20-30%    8      60-70%   2
--      30-40%    9      70-100% 23
--   86% of rows sit under 10% and the distribution falls off a cliff straight after;
--   10-20% is a thin tail of 20 rows consistent with ordinary price drift between the
--   last WAC recompute and today, plus rounding. 20% sits just past that natural
--   cluster: loose enough never to cry wolf over market movement, tight enough that
--   the factor-10 unit bug (>= 90%) can never hide. Raising it to 30% would only
--   silence 8 rows; lowering it to 5% would flag 91 and the badge would stop meaning
--   anything. Tolerance is a named constant below — change it in one place.
--
-- SCOPE OF THE COMPARISON
--   * purchase_logs rows with voided_at IS NOT NULL are excluded (mig 463 territory),
--     as are rows with quantity <= 0 or total_price <= 0 — they cannot form a unit cost.
--   * All of a product's history is pooled, not the last N purchases: the stored cost
--     is itself an all-time weighted average, so the comparison must be like for like.
--
-- BOM WALK — mirrors the live fn_rollup_bom_costs (read with pg_get_functiondef,
--   not the repo copy, which drifts):
--   * MOD-* children of a SALE-* parent are EXCLUDED — they are optional add-ons and
--     the live rollup leaves them out of the base cost, so they must not colour it.
--   * depth limit 10, cycle protection via the visited-path array.
--   * A node that has its own BOM is classed `derived`: its trust is its children's,
--     and the walk reaches them anyway. It must not out-shout its own ingredients.
--
-- GRANTS: authenticated only. These views expose purchase economics (what we pay per
--   unit); the public site reads with the anon key, so anon is deliberately NOT granted
--   here, unlike the older v_dish_* views.
--
-- DEPENDS ON: nomenclature (cost_per_unit, cost_source, is_deleted),
--             purchase_logs (quantity, total_price, voided_at), bom_structures.
-- TOUCHES NO DATA. Historical repair of purchase_logs is migration 460 / PR #597.
-- ============================================================

BEGIN;

-- ─── 1. Per-row trust ───
--
-- trust_class / trust_rank (higher rank = worse, the rollup takes the max):
--   50 no_cost     cost is NULL or 0 — the money is simply missing
--   40 deleted     the row is soft-deleted but still priced into an active BOM
--   30 unverified  claims to come from purchases, but they say something else
--                  (reason='contradicts_history') or there are none at all
--                  (reason='no_history')
--   20 estimated   catalog estimate, openly not a real purchase
--   10 manual      a human set it by hand — traceable to a person, not to a receipt
--    0 verified    stored cost agrees with this product's own purchase history
--    0 derived     computed from this row's BOM; its children carry the verdict

CREATE OR REPLACE VIEW public.v_cost_trust_nomenclature AS
WITH purchases AS (
  SELECT
    pl.nomenclature_id,
    count(*)::int        AS purchase_count,
    sum(pl.quantity)     AS purchased_qty,
    sum(pl.total_price)  AS purchased_total,
    max(pl.invoice_date) AS last_purchase_date
  FROM public.purchase_logs pl
  WHERE pl.voided_at IS NULL
    AND pl.quantity    > 0
    AND pl.total_price > 0
  GROUP BY pl.nomenclature_id
),
base AS (
  SELECT
    n.id            AS nomenclature_id,
    n.product_code,
    n.name,
    n.base_unit,
    n.cost_per_unit,
    COALESCE(n.cost_source, 'none')  AS cost_source,
    COALESCE(n.is_deleted, false)    AS is_deleted,
    EXISTS (SELECT 1 FROM public.bom_structures bs WHERE bs.parent_id = n.id) AS has_bom,
    COALESCE(p.purchase_count, 0)    AS purchase_count,
    p.last_purchase_date,
    CASE WHEN p.purchased_qty > 0
         THEN round(p.purchased_total / p.purchased_qty, 4)
    END AS purchase_unit_cost,
    0.20::numeric AS tolerance
  FROM public.nomenclature n
  LEFT JOIN purchases p ON p.nomenclature_id = n.id
),
scored AS (
  SELECT
    b.*,
    CASE
      WHEN b.purchase_unit_cost IS NOT NULL AND COALESCE(b.cost_per_unit, 0) > 0
      THEN round(
             abs(b.cost_per_unit - b.purchase_unit_cost)
             / greatest(b.cost_per_unit, b.purchase_unit_cost), 4)
    END AS divergence_ratio
  FROM base b
)
SELECT
  s.nomenclature_id,
  s.product_code,
  s.name,
  s.base_unit,
  s.cost_per_unit,
  s.cost_source,
  s.is_deleted,
  s.has_bom,
  s.purchase_count,
  s.last_purchase_date,
  s.purchase_unit_cost,
  s.divergence_ratio,
  s.tolerance,
  (s.divergence_ratio IS NOT NULL AND s.divergence_ratio > s.tolerance) AS contradicts_history,
  CASE
    WHEN COALESCE(s.cost_per_unit, 0) = 0                    THEN 'no_cost'
    WHEN s.is_deleted                                        THEN 'deleted'
    WHEN s.has_bom                                           THEN 'derived'
    WHEN s.cost_source = 'catalog_estimate'                  THEN 'estimated'
    WHEN s.cost_source = 'manual'                            THEN 'manual'
    WHEN s.divergence_ratio IS NOT NULL
         AND s.divergence_ratio > s.tolerance                THEN 'unverified'
    WHEN s.purchase_count = 0                                THEN 'unverified'
    WHEN s.divergence_ratio IS NOT NULL                      THEN 'verified'
    ELSE 'unverified'
  END AS trust_class,
  CASE
    WHEN COALESCE(s.cost_per_unit, 0) = 0                    THEN 50
    WHEN s.is_deleted                                        THEN 40
    WHEN s.has_bom                                           THEN 0
    WHEN s.cost_source = 'catalog_estimate'                  THEN 20
    WHEN s.cost_source = 'manual'                            THEN 10
    WHEN s.divergence_ratio IS NOT NULL
         AND s.divergence_ratio > s.tolerance                THEN 30
    WHEN s.purchase_count = 0                                THEN 30
    WHEN s.divergence_ratio IS NOT NULL                      THEN 0
    ELSE 30
  END AS trust_rank,
  CASE
    WHEN COALESCE(s.cost_per_unit, 0) = 0                    THEN 'zero_or_null_cost'
    WHEN s.is_deleted                                        THEN 'soft_deleted_ingredient'
    WHEN s.has_bom                                           THEN 'from_own_bom'
    WHEN s.cost_source = 'catalog_estimate'                  THEN 'catalog_estimate'
    WHEN s.cost_source = 'manual'                            THEN 'hand_set'
    WHEN s.divergence_ratio IS NOT NULL
         AND s.divergence_ratio > s.tolerance                THEN 'contradicts_history'
    WHEN s.purchase_count = 0                                THEN 'no_history'
    WHEN s.divergence_ratio IS NOT NULL                      THEN 'matches_history'
    ELSE 'no_history'
  END AS trust_reason
FROM scored s;

COMMENT ON VIEW public.v_cost_trust_nomenclature IS
  'Per-product cost provenance: what evidence stands behind cost_per_unit. '
  'trust_rank is ordinal (higher = worse) so v_dish_cost_trust can take a max. '
  '`unverified` means the stored cost and purchase_logs disagree beyond 20%, or no '
  'purchase backs it — NOT that the stored cost is the wrong one of the two. '
  'Migration 482, MC 160040d2.';

-- ─── 2. Per-dish rollup over the BOM tree ───

CREATE OR REPLACE VIEW public.v_dish_cost_trust AS
WITH RECURSIVE roots AS (
  SELECT n.id, n.product_code, n.name, n.cost_per_unit,
         COALESCE(n.cost_source, 'none') AS cost_source
  FROM public.nomenclature n
  WHERE COALESCE(n.is_deleted, false) = false
    AND (n.product_code LIKE 'SALE-%'
      OR n.product_code LIKE 'PF-%'
      OR n.product_code LIKE 'MOD-%')
),
tree AS (
  -- Level 1: direct ingredients, MOD-* children of a SALE-* parent excluded
  -- exactly as the live fn_rollup_bom_costs excludes them from the base cost.
  SELECT
    r.id                               AS dish_id,
    child.id                           AS node_id,
    child.product_code                 AS node_code,
    1                                  AS depth,
    ARRAY[r.id, child.id]              AS path
  FROM roots r
  JOIN public.bom_structures bs ON bs.parent_id = r.id
  JOIN public.nomenclature child ON child.id = bs.ingredient_id
  WHERE NOT (r.product_code LIKE 'SALE-%' AND child.product_code LIKE 'MOD-%')

  UNION ALL

  -- Deeper: dishes nest through PF intermediates.
  SELECT
    t.dish_id,
    child.id,
    child.product_code,
    t.depth + 1,
    t.path || child.id
  FROM tree t
  JOIN public.bom_structures bs ON bs.parent_id = t.node_id
  JOIN public.nomenclature child ON child.id = bs.ingredient_id
  WHERE t.depth < 10
    AND NOT (child.id = ANY (t.path))
    AND NOT (t.node_code LIKE 'SALE-%' AND child.product_code LIKE 'MOD-%')
),
nodes AS (
  SELECT DISTINCT t.dish_id, t.node_id
  FROM tree t
),
ingredients AS (
  SELECT
    nd.dish_id,
    ct.nomenclature_id,
    ct.product_code,
    ct.name,
    ct.trust_class,
    ct.trust_rank,
    ct.trust_reason,
    ct.is_deleted,
    ct.cost_per_unit,
    ct.purchase_unit_cost,
    ct.divergence_ratio
  FROM nodes nd
  JOIN public.v_cost_trust_nomenclature ct ON ct.nomenclature_id = nd.node_id
),
agg AS (
  SELECT
    i.dish_id,
    count(*)::int                                                            AS ingredient_count,
    max(i.trust_rank)                                                        AS worst_rank,
    count(*) FILTER (WHERE i.trust_class = 'no_cost')::int                   AS zero_cost_count,
    -- Soft-delete is counted from the flag, not from trust_class: a retired
    -- ingredient that ALSO has no cost classes as no_cost (rank 50) and would
    -- otherwise vanish from this count. 7 live dishes carry one; 5 of them are
    -- costless too.
    count(*) FILTER (WHERE i.is_deleted)::int                                AS deleted_count,
    count(*) FILTER (WHERE i.trust_class = 'unverified')::int                AS unverified_count,
    count(*) FILTER (WHERE i.trust_class = 'estimated')::int                 AS estimated_count,
    count(*) FILTER (WHERE i.trust_class = 'manual')::int                    AS manual_count,
    count(*) FILTER (WHERE i.trust_class IN ('verified', 'derived'))::int    AS verified_count
  FROM ingredients i
  GROUP BY i.dish_id
),
worst AS (
  -- The ingredient the tooltip names. Ties break on the largest divergence, then
  -- the name, so the row is stable between refreshes.
  SELECT DISTINCT ON (i.dish_id)
    i.dish_id,
    i.nomenclature_id AS worst_ingredient_id,
    i.product_code    AS worst_ingredient_code,
    i.name            AS worst_ingredient_name,
    i.trust_class     AS worst_ingredient_class,
    i.trust_reason    AS worst_ingredient_reason,
    i.cost_per_unit   AS worst_ingredient_cost,
    i.purchase_unit_cost AS worst_ingredient_history_cost,
    i.divergence_ratio   AS worst_ingredient_divergence
  FROM ingredients i
  JOIN agg a ON a.dish_id = i.dish_id AND a.worst_rank = i.trust_rank
  ORDER BY i.dish_id, i.trust_rank DESC, i.divergence_ratio DESC NULLS LAST, i.name
)
SELECT
  r.id            AS dish_id,
  r.product_code,
  r.name,
  r.cost_per_unit,
  r.cost_source,
  COALESCE(a.ingredient_count, 0) AS ingredient_count,
  -- No costed BOM line at all: the displayed cost is not a measurement of anything.
  -- Ranked above every ingredient-level defect — this is the 299 THB bowl at 0.00.
  CASE WHEN COALESCE(a.ingredient_count, 0) = 0 THEN 'no_bom'
       WHEN a.worst_rank = 50 THEN 'no_cost'
       WHEN a.worst_rank = 40 THEN 'deleted'
       WHEN a.worst_rank = 30 THEN 'unverified'
       WHEN a.worst_rank = 20 THEN 'estimated'
       WHEN a.worst_rank = 10 THEN 'manual'
       ELSE 'verified'
  END AS trust_class,
  CASE WHEN COALESCE(a.ingredient_count, 0) = 0 THEN 60
       ELSE a.worst_rank
  END AS trust_rank,
  COALESCE(a.zero_cost_count, 0)  AS zero_cost_count,
  COALESCE(a.deleted_count, 0)    AS deleted_count,
  COALESCE(a.unverified_count, 0) AS unverified_count,
  COALESCE(a.estimated_count, 0)  AS estimated_count,
  COALESCE(a.manual_count, 0)     AS manual_count,
  COALESCE(a.verified_count, 0)   AS verified_count,
  w.worst_ingredient_id,
  w.worst_ingredient_code,
  w.worst_ingredient_name,
  w.worst_ingredient_class,
  w.worst_ingredient_reason,
  w.worst_ingredient_cost,
  w.worst_ingredient_history_cost,
  w.worst_ingredient_divergence,
  COALESCE(a.deleted_count, 0) > 0 AS has_deleted_ingredient
FROM roots r
LEFT JOIN agg   a ON a.dish_id = r.id
LEFT JOIN worst w ON w.dish_id = r.id;

COMMENT ON VIEW public.v_dish_cost_trust IS
  'Worst cost-provenance class found anywhere in a sellable item''s BOM tree, plus the '
  'ingredient that caused it (tooltips name it). MOD-* children of SALE-* parents are '
  'excluded, mirroring fn_rollup_bom_costs. ingredient_count = 0 means no costed BOM '
  'line exists, so the shown cost measures nothing. Migration 482, MC 160040d2.';

-- Purchase economics: signed-in staff only. The public site uses the anon key.
REVOKE ALL ON public.v_cost_trust_nomenclature FROM PUBLIC, anon;
REVOKE ALL ON public.v_dish_cost_trust         FROM PUBLIC, anon;
GRANT SELECT ON public.v_cost_trust_nomenclature TO authenticated, service_role;
GRANT SELECT ON public.v_dish_cost_trust         TO authenticated, service_role;

-- Log sync: this migration was applied before it settled on its final number.
UPDATE public.migration_log
SET filename = '482_cost_trust_views.sql'
WHERE filename IN ('469_cost_trust_views.sql', '480_cost_trust_views.sql');

INSERT INTO public.migration_log (filename, applied_by, status, notes)
SELECT '482_cost_trust_views.sql', 'claude-opus-session-42e64bb9', 'success',
       'MC 160040d2: v_cost_trust_nomenclature + v_dish_cost_trust. Read-only, no data touched.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.migration_log WHERE filename = '482_cost_trust_views.sql'
);

COMMIT;
