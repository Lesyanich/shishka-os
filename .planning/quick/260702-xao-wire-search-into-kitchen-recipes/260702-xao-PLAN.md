---
phase: quick
plan: 260702-xao
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/admin-panel/src/pages/KitchenRecipesPage.tsx
autonomous: true
requirements: [QUICK-SEARCH-KITCHEN]

must_haves:
  truths:
    - "A cook on /kitchen/recipes sees a 'Search by name…' box next to the type/availability filters"
    - "Typing in the search box narrows the station cards by dish name (both L1 Cook and L2 Assembly)"
    - "Clearing the box (X or empty) restores the full list"
    - "Switching station tabs (L1 ↔ L2) clears the search box back to empty"
  artifacts:
    - path: "apps/admin-panel/src/pages/KitchenRecipesPage.tsx"
      provides: "searchQuery local state wired into RecipeStationPanel"
      contains: "onSearchQuery={setSearchQuery}"
  key_links:
    - from: "apps/admin-panel/src/pages/KitchenRecipesPage.tsx"
      to: "RecipeStationPanel"
      via: "searchQuery + onSearchQuery props"
      pattern: "onSearchQuery=\\{setSearchQuery\\}"
    - from: "handleStationChange"
      to: "searchQuery reset"
      via: "setSearchQuery('')"
      pattern: "setSearchQuery\\(''\\)"
---

<objective>
Wire the existing name-search box into the cook-facing `/kitchen/recipes` page.

Purpose: `RecipeStationPanel` already renders a search box when given an `onSearchQuery` prop (the owner's `/menu` L1/L2 views use it), but `KitchenRecipesPage` never passes it — so cooks have no way to search recipes by name. This closes that gap with a ~6-line change in one file.

Output: `apps/admin-panel/src/pages/KitchenRecipesPage.tsx` with local `searchQuery` state passed to `RecipeStationPanel` and reset on station change.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/admin-panel/src/pages/KitchenRecipesPage.tsx
@apps/admin-panel/src/pages/menu/components/RecipeStationPanel.tsx

<interfaces>
<!-- RecipeStationPanel already accepts these OPTIONAL props (no change needed there): -->
```typescript
// From apps/admin-panel/src/pages/menu/components/RecipeStationPanel.tsx
export interface RecipeStationPanelProps {
  // ...existing props already wired by KitchenRecipesPage...
  /** Free-text name search — narrows the station's cards by dish name. */
  searchQuery?: string       // default '' inside the panel
  onSearchQuery?: (q: string) => void  // search box renders ONLY when this is passed
}
```

<!-- Reference wiring in MenuPage.tsx (uses URL param ?q=), passed to RecipeStationPanel: -->
```tsx
// apps/admin-panel/src/pages/menu/MenuPage.tsx (lines 510-511)
searchQuery={searchQuery}
onSearchQuery={setSearchQuery}
```

<!-- NOTE: KitchenRecipesPage keeps ALL its filters as LOCAL useState (typeFilter,
     availableFilter, selectedCategory, selectedSubcategory). searchQuery MUST follow
     the same local-useState pattern — do NOT introduce a URL param here. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add local searchQuery state and wire it into RecipeStationPanel</name>
  <files>apps/admin-panel/src/pages/KitchenRecipesPage.tsx</files>
  <action>
Make three small edits in `KitchenRecipesPage.tsx`, all consistent with the page's existing local-useState filters (do NOT add a URL param, do NOT touch RecipeStationPanel):

1. **Add state** — in the "Filters" block (near the other `useState` declarations around lines 58-63, e.g. right after `selectedSubcategory`), add:
   ```tsx
   const [searchQuery, setSearchQuery] = useState('')
   ```

2. **Reset on station change** — in `handleStationChange` (lines 81-87), add a reset line alongside the other per-station filter resets:
   ```tsx
   setSearchQuery('')
   ```

3. **Pass the props** — on the `<RecipeStationPanel ... />` element (lines 144-163), add the two props (place them next to the other filter props, e.g. after `onSelectSubcategory={setSelectedSubcategory}`):
   ```tsx
   searchQuery={searchQuery}
   onSearchQuery={setSearchQuery}
   ```

Do not change anything else. `useState` is already imported (line 1). Passing `onSearchQuery` is what makes the panel render its search box, so no other change is needed for the box to appear.
  </action>
  <verify>
    <automated>cd apps/admin-panel && npx tsc -b</automated>
  </verify>
  <done>
`npx tsc -b` in apps/admin-panel completes with zero errors. `KitchenRecipesPage.tsx` contains `const [searchQuery, setSearchQuery] = useState('')`, a `setSearchQuery('')` line inside `handleStationChange`, and `searchQuery={searchQuery}` + `onSearchQuery={setSearchQuery}` on the `<RecipeStationPanel>` element.
  </done>
</task>

</tasks>

<verification>
- `cd apps/admin-panel && npx tsc -b` passes (no TypeScript errors)
- Grep confirms wiring:
  - `grep -n "onSearchQuery={setSearchQuery}" apps/admin-panel/src/pages/KitchenRecipesPage.tsx`
  - `grep -n "setSearchQuery('')" apps/admin-panel/src/pages/KitchenRecipesPage.tsx`
- Only `apps/admin-panel/src/pages/KitchenRecipesPage.tsx` is modified (RecipeStationPanel untouched)
</verification>

<success_criteria>
- Cook on `/kitchen/recipes` sees a "Search by name…" box beside the type/availability filters
- Typing filters the station cards by dish name in both L1 Cook and L2 Assembly views
- Clearing the box restores the full list
- Switching station tabs resets the search box to empty
- TypeScript build (`tsc -b`) is clean
</success_criteria>

<output>
After completion, create `.planning/quick/260702-xao-wire-search-into-kitchen-recipes/260702-xao-SUMMARY.md`
</output>
