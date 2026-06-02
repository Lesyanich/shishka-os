-- 229_competitor_intel.sql
-- Competitive-analysis base (Supabase spine for the vault/Competitors/ registry).
-- Queryable index of competitors + a growing log of "interesting cases".
-- Deep narrative + screenshots stay in vault/Competitors/<slug>/; this table is the
-- durable, queryable, admin-surfaced index that links to it.

-- ── competitors: one row per competitor / benchmark ─────────────────────────
CREATE TABLE public.competitors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,                       -- e.g. 'easyhealth'
  name          TEXT NOT NULL,
  segment       TEXT,                                        -- positioning / market segment
  site_url      TEXT,
  app_ios       TEXT,                                        -- App Store id / url
  app_android   TEXT,                                        -- Play package / url
  depth         TEXT NOT NULL DEFAULT 'backlog'
                  CHECK (depth IN ('backlog','light','deep','teardown')),
  threat_level  TEXT CHECK (threat_level IN ('low','high','critical')),
  summary       TEXT,                                        -- 1-2 line "who they are"
  verdict_copy  TEXT,                                        -- what we should COPY
  verdict_beat  TEXT,                                        -- where we BEAT them
  verdict_skip  TEXT,                                        -- what to SKIP
  their_edge    TEXT,                                        -- their edge we lack today
  vault_doc     TEXT,                                        -- repo path to deep analysis
  tags          TEXT[] NOT NULL DEFAULT '{}',
  last_analyzed DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.competitors IS
  'Competitive-analysis index. Deep narrative + screenshots live in vault/Competitors/<slug>/ (vault_doc).';

-- ── competitor_cases: log of interesting cases / things worth remembering ────
CREATE TABLE public.competitor_cases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id   UUID NOT NULL REFERENCES public.competitors(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,                             -- short headline of the case
  category        TEXT CHECK (category IN
                    ('feature','ux','pricing','marketing','tech','ops','loyalty','other')),
  description     TEXT,                                       -- what it is + why it matters
  verdict         TEXT CHECK (verdict IN ('copy','beat','skip','watch')),
  source_url      TEXT,
  screenshot_path TEXT,                                       -- repo/storage path to screenshot
  tags            TEXT[] NOT NULL DEFAULT '{}',
  captured_by     TEXT,                                       -- 'lesia' | agent/session id
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_competitor_cases_competitor ON public.competitor_cases(competitor_id);
CREATE INDEX idx_competitor_cases_category   ON public.competitor_cases(category);

COMMENT ON TABLE public.competitor_cases IS
  'Append-only log of notable competitor cases (feature/ux/pricing/...). Anti-staleness: add via save_competitor_case MCP tool from any session.';

-- ── updated_at trigger on competitors (reuse shared helper) ──────────────────
CREATE TRIGGER trg_competitors_updated_at
  BEFORE UPDATE ON public.competitors
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ── RLS: authenticated can read; owner can write (mirrors salad_bar_slots) ───
ALTER TABLE public.competitors      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view competitors"
  ON public.competitors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can view competitor_cases"
  ON public.competitor_cases FOR SELECT TO authenticated USING (true);

-- owner full write on competitors
CREATE POLICY "Owner can insert competitors" ON public.competitors FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.staff WHERE staff.auth_user_id = auth.uid() AND staff.role = 'owner'));
CREATE POLICY "Owner can update competitors" ON public.competitors FOR UPDATE TO authenticated
  USING     (EXISTS (SELECT 1 FROM public.staff WHERE staff.auth_user_id = auth.uid() AND staff.role = 'owner'));
CREATE POLICY "Owner can delete competitors" ON public.competitors FOR DELETE TO authenticated
  USING     (EXISTS (SELECT 1 FROM public.staff WHERE staff.auth_user_id = auth.uid() AND staff.role = 'owner'));

-- owner full write on competitor_cases
CREATE POLICY "Owner can insert competitor_cases" ON public.competitor_cases FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.staff WHERE staff.auth_user_id = auth.uid() AND staff.role = 'owner'));
CREATE POLICY "Owner can update competitor_cases" ON public.competitor_cases FOR UPDATE TO authenticated
  USING     (EXISTS (SELECT 1 FROM public.staff WHERE staff.auth_user_id = auth.uid() AND staff.role = 'owner'));
CREATE POLICY "Owner can delete competitor_cases" ON public.competitor_cases FOR DELETE TO authenticated
  USING     (EXISTS (SELECT 1 FROM public.staff WHERE staff.auth_user_id = auth.uid() AND staff.role = 'owner'));

-- ── Seed: EasyHealth (first teardown) + notable cases ────────────────────────
INSERT INTO public.competitors
  (slug, name, segment, site_url, app_ios, app_android, depth, threat_level, summary,
   verdict_copy, verdict_beat, verdict_skip, their_edge, vault_doc, tags, last_analyzed)
VALUES
  ('easyhealth', 'Easy Health (Gourment Innovation)',
   'Healthy meal delivery + meal plans, Bangkok/Pattaya',
   'https://easyhealth.asia', 'id6667109383', 'com.easyHealth.app',
   'teardown', 'high',
   'Mature, macro-first healthy meal delivery: à la carte + goal-based meal plans + login-gated BYO meal-builder + points loyalty. Direct competitor.',
   'Calorie-centered КБЖУ donut per dish; Diets & Allergens filter panel; guided 3-step BYO meal-builder; creation-based loyalty (Happy Coin); deep-linkable dish modals.',
   'Costed & consistent BYO via Booster+BOM (live cost + КБЖУ for free vs their flat modifier list); wider cuisine range (manakish/smoothies); we own the full data stack (no Loyverse ceiling).',
   'Multi-branch nearest-store routing; third-party delivery aggregators; heavy meal-plan subscription engine (defer to v3).',
   'Polished food photography + content depth (blog, meal-plan landing pages) and a live deployed customer app. Our MVP blocker is content, not code.',
   'vault/Competitors/easyhealth/analysis.md',
   ARRAY['healthy-food','delivery','meal-plans','byo','direct-competitor'],
   DATE '2026-06-02');

INSERT INTO public.competitor_cases (competitor_id, title, category, description, verdict, source_url, screenshot_path, captured_by, tags)
SELECT id, t.title, t.category, t.description, t.verdict, t.source_url, t.screenshot_path, 'claude-opus-session-3a19896d', t.tags
FROM public.competitors c
CROSS JOIN (VALUES
  ('КБЖУ donut per dish', 'ux',
   'Every dish modal shows a donut chart with calories in the center + macro-split ring and a Protein/Carb/Fat (g) legend. Exactly the "пирожковая КБЖУ" we want. We already store calories/protein/carbs/fat in nomenclature + v_public_menu; macros computed client-side (P×4+C×4+F×9).',
   'copy', 'https://easyhealth.asia/menu', 'vault/Competitors/easyhealth/assets/dish-detail-acai-modal.png',
   ARRAY['nutrition','donut','menu']),
  ('3-step guided BYO meal-builder', 'feature',
   'Login-gated /my-meals: 3 archetypes (Breakfast/Salad/Wrap) → wizard Select Type → Choose Items → Confirm over a grams-explicit, priced modifier tree (Carb/Green/Protein/Topping/Add-on/Dressing + extras, premium ingredients +฿). Maps 1:1 to our Booster+BOM → costed, consistent custom bowls.',
   'beat', 'https://easyhealth.asia/my-meals', 'vault/Competitors/easyhealth/assets/byo-step2-items.png',
   ARRAY['byo','lego','modifiers','bom']),
  ('Diets & Allergens filter panel', 'ux',
   'Menu filter panel: Diets (High Protein/Vegan/Vegetarian/Paleo/Keto) as include filters + Allergens (9: Gluten/Crustaceans/Eggs/Fish/Peanuts/Soybeans/Milk&Dairy/Nuts/Sesame) as exclude filters. Maps to our tags (group dietary/allergen) already in v_public_menu.',
   'copy', 'https://easyhealth.asia/menu', 'vault/Competitors/easyhealth/assets/filter-diets-allergens.png',
   ARRAY['filters','allergens','diets']),
  ('"Happy Coin" engagement loyalty', 'loyalty',
   'Loyalty currency earned on engagement, not just orders — "Earn 1 Happy Coin for your first custom creation". Gamifies the BYO builder. Plus community layer: Signature Meals + subscribing to other users'' creations.',
   'copy', 'https://easyhealth.asia/my-meals', 'vault/Competitors/easyhealth/assets/byo-signed-in.png',
   ARRAY['loyalty','gamification','community'])
) AS t(title, category, description, verdict, source_url, screenshot_path, tags)
WHERE c.slug = 'easyhealth';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '229_competitor_intel.sql',
  'claude-code',
  NULL,
  'Competitor intel base: competitors + competitor_cases tables (RLS owner-write), seeded EasyHealth + 4 cases'
)
ON CONFLICT DO NOTHING;
