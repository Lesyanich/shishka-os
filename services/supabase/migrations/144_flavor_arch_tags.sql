-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 144: Flavor Architecture — texture roles tag_group
-- Part of MC d005e136 (CBS tagging + composition slots, Level 1)
--
-- Context (docs/bible/menu-concept.md § CBS, kitchen-philosophy.md § Texture
-- Contrast): CBS axes (Foundation/Accent/Finish) are already modelled via the
-- existing 'boosters' tag_group (acid/fat/solt/aroma/texture/heat/sweet).
-- What's missing is a DISH-LEVEL texture-role vocabulary — "every dish must
-- contain a deliberate crunch component" — so the Chef Agent can audit
-- texture contrast and suggest substitutions.
--
-- Decision (CEO 2026-04-21): introduce a new 'texture' tag_group distinct
-- from 'boosters.texture' (axis marker). This group carries concrete roles
-- a dish can fulfil: crunchy / crispy / silky / creamy / chewy / juicy.
-- Family classification (soup/bowl/salad) continues to be handled by
-- product_categories — no 'family' tag_group for v1.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Extend tag_group ENUM with 'texture' value ──
-- PostgreSQL rule: ENUM value must be committed before use → do the ALTER
-- and the INSERTs in separate transactions. Split via sub-commit below.
ALTER TYPE tag_group ADD VALUE IF NOT EXISTS 'texture';

COMMIT;

BEGIN;

-- ── 2. Seed canonical texture-role tags ──
INSERT INTO tags (slug, name, name_th, tag_group, color, sort_order) VALUES
  ('texture-crunchy', 'Crunchy', 'กรอบ',      'texture', '#F59E0B', 1),
  ('texture-crispy',  'Crispy',  'กรอบเบา',    'texture', '#FBBF24', 2),
  ('texture-silky',   'Silky',   'ละมุน',      'texture', '#A78BFA', 3),
  ('texture-creamy',  'Creamy',  'ครีมมี่',     'texture', '#D8B4FE', 4),
  ('texture-chewy',   'Chewy',   'เคี้ยวหนึบ', 'texture', '#94A3B8', 5),
  ('texture-juicy',   'Juicy',   'ฉ่ำ',         'texture', '#34D399', 6)
ON CONFLICT (slug) DO NOTHING;

-- ── Self-register in migration_log ──
INSERT INTO public.migration_log (filename, applied_by, reviewed_by, description)
VALUES (
  '144_flavor_arch_tags.sql',
  'claude-code',
  'lesia',
  'Flavor Architecture Level 1: new tag_group=texture + 6 role slugs (crunchy/crispy/silky/creamy/chewy/juicy) for dish-level texture audit.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
