# Requirements: Menu Control & Preview Page

**Defined:** 2026-04-13
**Core Value:** The owner can see, control, and preview the entire menu in one place

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Menu Display

- [ ] **MENU-01**: Page displays all SALE-type dishes from nomenclature
- [ ] **MENU-02**: Dishes grouped by product_categories (L1 as tabs, L2 as section headings)
- [ ] **MENU-03**: Dishes sorted by display_order within each category
- [ ] **MENU-04**: Empty state shown when no dishes exist or all are hidden

### Owner View

- [ ] **OWN-01**: Owner view shows dish name, description, price (THB), cost, food cost %, margin
- [ ] **OWN-02**: Food cost % color-coded: green (<30%), amber (30-45%), red (>45%)
- [ ] **OWN-03**: is_available toggle per dish with immediate visual feedback
- [ ] **OWN-04**: is_featured toggle per dish
- [ ] **OWN-05**: Category section headers with dish count badge

### Customer Preview

- [ ] **PREV-01**: Customer preview shows cards with placeholder image, name, description, price
- [ ] **PREV-02**: Nutrition badges on cards (calories, protein, carbs, fat)
- [ ] **PREV-03**: Dietary and allergen tags displayed on cards (from tags junction)
- [ ] **PREV-04**: Only is_available dishes shown in customer preview
- [ ] **PREV-05**: Category sections with clear visual separation

### View Toggle

- [ ] **VIEW-01**: Toggle switch between owner view and customer preview on the same page
- [ ] **VIEW-02**: Active view persists during session (not reset on re-render)
- [ ] **VIEW-03**: Unsaved edit state preserved when toggling views

### Inline Editing

- [ ] **EDIT-01**: Click to edit dish name inline in owner view
- [ ] **EDIT-02**: Click to edit dish description inline in owner view
- [ ] **EDIT-03**: Click to edit dish price inline in owner view
- [ ] **EDIT-04**: Optimistic update on save (no flicker, revert on error)
- [ ] **EDIT-05**: Visual indicator during save (loading state)

### Data & Integration

- [ ] **DATA-01**: Single Supabase query fetches dishes with categories and tags (no N+1)
- [ ] **DATA-02**: Cost calculated from BOM via cost_per_unit field
- [ ] **DATA-03**: Food cost % = (cost_per_unit / price) * 100
- [ ] **DATA-04**: Page registered in App.tsx router and AppShell sidebar navigation

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhancements

- **ENH-01**: Recommended price hint based on markup_pct target
- **ENH-02**: Cost staleness indicator with recalculate action
- **ENH-03**: Batch availability toggle per category
- **ENH-04**: Multi-language support (Thai, Burmese)
- **ENH-05**: Image upload directly from menu page
- **ENH-06**: Menu engineering quadrants (Star/Plowhorse) when sales data available
- **ENH-07**: Featured dish highlight in customer preview (larger card)
- **ENH-08**: Drag-and-drop display_order reordering
- **ENH-09**: Menu PDF/print export

## Out of Scope

| Feature | Reason |
|---------|--------|
| New database tables | nomenclature already has all storefront fields |
| Public-facing website | This is admin panel preview only |
| Ordering/cart functionality | Not a customer-facing app |
| Recipe/BOM editing from this page | Stays in existing recipe pages |
| Real-time collaboration | Single-user admin panel |
| Image upload UI | Images provided separately, placeholder for now |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MENU-01 | Phase 1 | Pending |
| MENU-02 | Phase 1 | Pending |
| MENU-03 | Phase 1 | Pending |
| MENU-04 | Phase 1 | Pending |
| OWN-01 | Phase 1 | Pending |
| OWN-02 | Phase 1 | Pending |
| OWN-03 | Phase 1 | Pending |
| OWN-04 | Phase 1 | Pending |
| OWN-05 | Phase 1 | Pending |
| PREV-01 | Phase 2 | Pending |
| PREV-02 | Phase 2 | Pending |
| PREV-03 | Phase 2 | Pending |
| PREV-04 | Phase 2 | Pending |
| PREV-05 | Phase 2 | Pending |
| VIEW-01 | Phase 1 | Pending |
| VIEW-02 | Phase 1 | Pending |
| VIEW-03 | Phase 3 | Pending |
| EDIT-01 | Phase 3 | Pending |
| EDIT-02 | Phase 3 | Pending |
| EDIT-03 | Phase 3 | Pending |
| EDIT-04 | Phase 3 | Pending |
| EDIT-05 | Phase 3 | Pending |
| DATA-01 | Phase 1 | Pending |
| DATA-02 | Phase 1 | Pending |
| DATA-03 | Phase 1 | Pending |
| DATA-04 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0

---
*Requirements defined: 2026-04-13*
*Last updated: 2026-04-13 after initial definition*
