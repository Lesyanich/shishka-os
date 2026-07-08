# Menu Control & Preview Page

## What This Is

A unified menu management page in the Shishka admin panel (`/menu`) that serves two purposes: an owner control dashboard showing dish costs, margins, and editability — and a customer-facing preview showing how the menu will look on the future website. Toggle between views on one page.

## Core Value

The owner can see, control, and preview the entire menu in one place — understanding how it looks, sounds, and performs financially.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Menu page displays all SALE-type dishes from nomenclature grouped by product_categories
- [ ] Owner view shows: name, description, price, cost, food cost %, margin, category, tags
- [ ] Customer preview shows: cards with photo placeholder, name, description, price, nutrition badges
- [ ] Toggle switch between owner view and customer preview on the same page
- [ ] Inline editing of dish name, description, price, and is_available in owner view
- [ ] Categories shown as sections/tabs derived from product_categories hierarchy
- [ ] Display order respects `display_order` field from nomenclature
- [ ] Placeholder images for dishes without `image_url`
- [ ] Nutrition info (calories, protein, carbs, fat) shown as badges in preview
- [ ] Dietary/allergen tags displayed on dish cards (from nomenclature_tags + tags)
- [ ] is_available toggle per dish (show/hide from customer view)
- [ ] is_featured flag visible and toggleable (for future homepage hero section)

### Out of Scope

- Image upload UI — images will be added later via separate flow
- Multi-language support (Thai/Burmese) — architecture will be i18n-ready, but v1 is English only
- Public-facing website — this is an admin panel preview only
- Menu PDF/print export
- Ordering/cart functionality
- Recipe/BOM editing from this page (that stays in existing recipe pages)

## Context

- Admin panel: Vite 7 + React 19 + React Router 7, dark-only theme
- Data source: `nomenclature` table (type='dish', product_code LIKE 'SALE-%')
- Cost: `cost_per_unit` calculated via BOM rollup through `bom_structures`
- Categories: `product_categories` (3-level hierarchy L1→L3)
- Tags: `tags` + `nomenclature_tags` junction (dietary, allergen groups)
- Storefront fields already exist in nomenclature: `price`, `image_url`, `slug`, `is_available`, `is_featured`, `display_order`
- Supabase backend with RLS policies
- Existing pages to reference for patterns: BOM page, recipe pages

## Constraints

- **Tech stack**: Must use existing admin-panel stack (Vite + React 19 + RR7) — no new frameworks
- **Data model**: No new tables — build entirely on existing nomenclature + product_categories + bom_structures + tags
- **Theme**: Dark-only, consistent with existing admin panel design system
- **i18n-ready**: String literals should be externalizable, but no i18n framework in v1

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single page with toggle, not two pages | Owner wants unified control — fewer clicks, immediate comparison | -- Pending |
| No new DB tables | nomenclature already has all storefront fields (migration 020) | -- Pending |
| English only for v1 | Thai and Burmese planned later; keep scope tight | -- Pending |
| Inline editing in owner view | Faster workflow than navigating to separate edit pages | -- Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check -- still the right priority?
3. Audit Out of Scope -- reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-13 after initialization*
