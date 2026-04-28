-- 165_initiatives_slug_match_tags_seed.sql
-- Resurrect business_initiatives: add slug + match_tags, seed 7 active initiatives,
-- link existing umbrella business_tasks to their initiatives.
--
-- Background: business_initiatives table existed (since migration 091) but stayed
-- empty — task grouping leaned on inconsistent freeform tags ('initiative', 'umbrella',
-- 'kind:meta') instead. CEO ratified Path A (chat 2026-04-28): use the schema
-- as designed, with 7 flat epic slugs and tag-overlap auto-routing in emit_business_task.

begin;

-- ── 1. Schema ────────────────────────────────────────────────────────────

alter table business_initiatives
  add column if not exists slug text,
  add column if not exists match_tags text[] not null default '{}';

-- Non-partial unique index so ON CONFLICT (slug) works.
-- Multiple NULLs allowed by default in Postgres unique indexes.
create unique index if not exists business_initiatives_slug_idx
  on business_initiatives(slug);

create index if not exists business_initiatives_match_tags_idx
  on business_initiatives using gin(match_tags);

comment on column business_initiatives.slug is
  'Stable URL/tag-friendly identifier (e.g. "brain", "kds-phase3"). Used by emit_business_task auto-routing and admin-panel epic views.';
comment on column business_initiatives.match_tags is
  'Tags that, when present on a new business_task, route it to this initiative via emit_business_task. Excludes "epic:<slug>" itself — that match is implicit.';

-- ── 2. Seed 7 active initiatives ─────────────────────────────────────────

insert into business_initiatives (slug, title, description, status, domains, match_tags) values
  (
    'brain',
    'Brain — knowledge graph + MemPalace + entity navigation',
    'Cross-cutting knowledge layer: vault ontology, Graphify pipeline, admin-panel /brain/knowledge view, agent-driven note creation on task closure.',
    'active',
    ARRAY['tech'],
    ARRAY['brain', 'vault', 'graphify', 'mempalace', 'knowledge-graph', 'lightrag', 'knowledge-vault']
  ),
  (
    'kds-phase3',
    'KDS Phase 3 — AI-Driven Kitchen Display System',
    'Kitchen Display System with AI-driven monitoring, escalation chains, label printing, Vision QC, RAG consultant.',
    'active',
    ARRAY['tech', 'kitchen'],
    ARRAY['kds-phase3', 'kds', 'kitchen-display']
  ),
  (
    'menu',
    'Menu Control Page — owner table + customer preview',
    'Unified /menu page: owner control dashboard with cost/margin/inline edit + customer-facing preview. Built on existing nomenclature + bom_structures + tags.',
    'active',
    ARRAY['tech'],
    ARRAY['menu-page', 'menu', 'admin-panel-menu', 'scorecard']
  ),
  (
    'l2-opening',
    'L2 Opening Roadmap — minimum viable launch preparation',
    'Critical-path tasks for L2 location opening: equipment, staffing, menu, regulatory, ops.',
    'active',
    ARRAY['strategy', 'ops', 'procurement', 'kitchen'],
    ARRAY['l2-opening', 'opening-blocker']
  ),
  (
    'erp',
    'ERP Consolidation — role-based access, sidebar restructure, KDS merge',
    'Unified admin panel with role-based access, sidebar grouping, KDS merge into main app.',
    'active',
    ARRAY['tech'],
    ARRAY['erp-consolidation', 'erp', 'role-based-access', 'sidebar', 'user-management']
  ),
  (
    'receipt-ocr',
    'Receipt OCR improvements — multi-receipt, Gemini, supplier cross-check, learning',
    'Iterative improvements to receipt processing pipeline: multi-receipt batches, Gemini Vision, supplier cross-checks, adaptive learning loop.',
    'active',
    ARRAY['tech', 'finance'],
    ARRAY['receipt-ocr', 'receipt-learning', 'adaptive-learning']
  ),
  (
    'ai-chef',
    'AI Executive Chef — ERP Integration',
    'Three surfaces, approval loop, multilingual feedback. Chef agent integrated with admin panel for kitchen workflows.',
    'planning',
    ARRAY['tech', 'kitchen'],
    ARRAY['ai-chef', 'chef-agent', 'chef-chat']
  )
on conflict (slug) do nothing;

-- ── Self-register in migration_log ──

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '165_initiatives_slug_match_tags_seed.sql',
  'claude-code',
  'Resurrect business_initiatives: slug + match_tags columns, seed 7 active epics (brain, kds-phase3, menu, l2-opening, erp, receipt-ocr, ai-chef), link existing umbrella business_tasks via initiative_id. Pairs with emit_business_task auto-router patch.'
) ON CONFLICT (filename) DO NOTHING;

-- ── 3. Link umbrella business_tasks to their initiatives ─────────────────

update business_tasks
set initiative_id = (select id from business_initiatives where slug = 'brain')
where id = '7a8fd4f4-e96e-4ee8-8a46-1a9ab3e7f24e';

update business_tasks
set initiative_id = (select id from business_initiatives where slug = 'kds-phase3')
where id = '9e2b3dff-f778-442d-8866-587b5fad5664';

update business_tasks
set initiative_id = (select id from business_initiatives where slug = 'menu')
where id = '356ba705-ec44-42f5-9e85-d38798e03cfc';

update business_tasks
set initiative_id = (select id from business_initiatives where slug = 'l2-opening')
where id = '7d78f1c4-825b-4e2e-bf94-cbae3ba09172';

update business_tasks
set initiative_id = (select id from business_initiatives where slug = 'erp')
where id = '25cc50dd-ba90-464c-abc5-c92b7cf3294e';

update business_tasks
set initiative_id = (select id from business_initiatives where slug = 'receipt-ocr')
where id = '01e6a872-003e-4ea9-b752-25e4e358fddf';

update business_tasks
set initiative_id = (select id from business_initiatives where slug = 'ai-chef')
where id = '0ee76594-c7d6-4790-bbe7-cafe3eea938d';

commit;
