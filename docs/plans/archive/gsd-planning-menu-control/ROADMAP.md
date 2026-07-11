# Roadmap: Menu Control & Preview Page

## Overview

Build a unified `/menu` admin page where the owner can see all SALE-type dishes grouped by category, inspect cost economics, and preview exactly what customers will see — all from a single toggle. The build proceeds from data outward: hook and owner table first, then customer preview, then write operations, then final route wiring. Each phase ships a working, independently verifiable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Data Foundation + Owner Table** - Fetch all menu data in one query and render a read-only owner cost table grouped by category
- [ ] **Phase 2: Customer Preview** - Render dish cards with nutrition badges and allergen tags; wire view toggle
- [ ] **Phase 3: Mutations + Inline Editing** - Add inline name/description/price editing and is_available/is_featured toggles with optimistic updates
- [ ] **Phase 4: Route Registration + Polish** - Register the page in App.tsx and AppShell nav; add category count badges and cost freshness label

## Phase Details

### Phase 1: Data Foundation + Owner Table
**Goal**: Owner can see all SALE dishes with cost economics, grouped by category and sorted by display order
**Depends on**: Nothing (first phase)
**Requirements**: MENU-01, MENU-02, MENU-03, MENU-04, OWN-01, OWN-02, OWN-05, VIEW-01, VIEW-02, DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. Owner can open the menu page and see all SALE dishes grouped under their L1 category tabs with L2 section headings
  2. Each dish row shows name, description, price (THB), cost, food cost %, and margin — food cost % is color-coded green/amber/red
  3. Dishes within each category appear in display_order sequence
  4. An empty state message appears when no dishes exist or all are filtered out
  5. A view toggle (Owner / Preview) is visible and switches between modes; the active mode persists during the session
**Plans**: TBD
**UI hint**: yes

### Phase 2: Customer Preview
**Goal**: Owner can see a customer-facing card grid that shows only available dishes with nutrition and allergen information
**Depends on**: Phase 1
**Requirements**: PREV-01, PREV-02, PREV-03, PREV-04, PREV-05
**Success Criteria** (what must be TRUE):
  1. Switching to Preview mode shows dish cards with a photo placeholder (or image if image_url is set), name, description, and price
  2. Nutrition badges (kcal, protein, carbs, fat) appear on cards only when values are present — no blank badges for null data
  3. Dietary and allergen tag pills appear on each card based on the dish's linked tags
  4. Dishes marked is_available = false are hidden in customer preview; unavailable dishes remain visible (dimmed) in owner view
  5. Category sections are visually separated in the card grid layout
**Plans**: TBD
**UI hint**: yes

### Phase 3: Mutations + Inline Editing
**Goal**: Owner can edit dish name, description, and price inline, and toggle availability and featured status — with no data loss when switching views
**Depends on**: Phase 2
**Requirements**: OWN-03, OWN-04, EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-05, VIEW-03
**Success Criteria** (what must be TRUE):
  1. Owner can double-click any dish name, description, or price in the owner table to edit it inline; pressing Enter saves and Escape cancels
  2. After saving, the row updates immediately without a visible reload or flicker; on network error the row reverts to the previous value
  3. A loading indicator appears on the field during the save round-trip
  4. Toggling is_available or is_featured on a dish takes effect immediately in the UI while the DB write completes in the background; rapid clicks do not cause race conditions
  5. If the owner starts editing a field and then switches to the preview toggle, the unsaved edit is preserved and visible when they switch back to owner view
**Plans**: TBD
**UI hint**: yes

### Phase 4: Route Registration + Polish
**Goal**: The menu page is accessible from the admin panel sidebar and shows category health badges and cost freshness context
**Depends on**: Phase 3
**Requirements**: DATA-04
**Success Criteria** (what must be TRUE):
  1. A "Menu" nav item appears in the AppShell sidebar and navigates to /menu
  2. Each category section header shows a count badge (e.g. "8 dishes" or "6/8 available")
  3. The cost column header indicates the data is pre-calculated (e.g. "Last calculated cost") so the owner understands the figure may not reflect today's ingredient prices
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Foundation + Owner Table | 0/? | Not started | - |
| 2. Customer Preview | 0/? | Not started | - |
| 3. Mutations + Inline Editing | 0/? | Not started | - |
| 4. Route Registration + Polish | 0/? | Not started | - |
