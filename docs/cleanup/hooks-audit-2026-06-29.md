# Admin-Panel Hooks Audit (Phase 1.3)

> Epic: Code Cleanup & Security Hardening (`2a8b06a4`) · Phase 1.3 (`01be8f25`)
> Scope: `apps/admin-panel/src/hooks` — **147 hooks, 804 KB**. Audit only; fixes are Phase 2.2/2.3.
> Builds on the merged knip baseline (PR #440).

## 1. Dead hooks — remove with their dead cluster (→ Phase 2.2)

knip flags 7 hooks as unused. A naive "any importer" grep disagrees for 6 of them — but that's
because their **only** importers are the **dead pages** in the same 43-unused-files cluster (knip's
verdict is transitive from live entry points, which is correct here).

| Hook | Importers | Disposition |
|---|---|---|
| `useEquipmentSlots` | **0** | standalone dead — safe remove |
| `useSupplierMapping` | `FinanceManager.tsx`, `StagingArea.tsx`, `types/receipt.ts` — **all dead** | dead cluster |
| `useBOMCoverage` | only dead pages | dead cluster |
| `useCapEx` | only dead pages | dead cluster |
| `useKitchenDashboard` | only `KitchenDashboard.tsx` + siblings (dead) | dead cluster |
| `useKitchenTasks` | only dead pages | dead cluster |
| `useStockTransfer` | only dead pages | dead cluster |

**Recommendation:** don't delete these hooks in isolation — remove the **whole orphaned surface
together** (the dead pages `Dashboard`/`ControlCenter`/`FinanceManager`/`KitchenDashboard`/… + their
components + these hooks), as one reviewable PR, so no import dangles mid-way. This is the bulk of the
43 unused files from the knip baseline. Verify each page is truly unreachable from the router first.

## 2. Near-duplicate families — consolidation candidates (→ Phase 2.3)

Hook count by name-family (≥3):

| Family | # hooks | Consolidation note |
|---|---|---|
| **`useDish*`** | **16** | Biggest target: `useDishCard`, `useDishCardSave`, `useDishDetail`, `useDishModifierGroups`, … — likely overlapping fetch/save logic. Candidate for a unified `useDish` + sub-selectors. |
| `useModifier*` | 8 | `useModifierOptions`, `useModifierOptionEditing`, `useModifierSync`, … — modifier CRUD scattered. |
| `useStock*` | 7 | stock/stocktake/stock-sheet overlap. |
| `useStaff*` | 7 | `useStaff`, `useStaffList`, `useStaffTasks`, `useStaffTelegram`, … |
| `useMenu*` | 6 | `useMenuData`, `useMenuDishes`, `useMenuListEnrichment`, … (data-fetch layering). |
| `useEquipment*` | 5 | incl. dead `useEquipmentSlots`. |
| `useShift*` / `usePfPack*` / `useBom*` | 4 each | |
| `useSupplier*` / `useProduction*` | 3 each | |

⚠ These are **name** clusters, not proven duplicates — Phase 2.3 must diff the actual bodies before
merging. Highest ROI: the **`useDish*` 16-hook family** (start here).

## 3. Oversized hooks — split candidates (→ Phase 2.4)

Largest by LOC (top of `wc -l`): `useMenuData`, `useReceiptInbox`, `useSupplierMapping` (dead — drop,
don't split), `useSaladBarLayout`, `useMenuListEnrichment`, `useProductionOrders`, `useExpenseLedger`,
`useInventory`, `useSkuManager`, `useStaffTasks`. `useMenuData` is the single biggest data hook —
prime split target (it already carries the BOM-join + cost rollup; see the `useMenuData` gotchas).

## Hand-off

- **Phase 2.2 (`4d5c5232`)**: remove the dead page+hook cluster (§1) as one PR after router-reachability check.
- **Phase 2.3 (`cc1421a4`)**: consolidate `useDish*` first (§2), body-diff before merging.
- **Phase 2.4 (`59088165`)**: split `useMenuData` (§3) — plan-first.
