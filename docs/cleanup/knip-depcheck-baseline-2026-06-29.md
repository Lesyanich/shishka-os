# Knip + Depcheck Baseline — 2026-06-29

> Epic: Code Cleanup & Security Hardening (`2a8b06a4`) · Phase 0.1 (`a8283f2c`)
> Spec: `docs/plans/spec-code-cleanup-security-hardening.md`
> This is an **inventory only** — no code is deleted here. Findings feed Phase 1 (audit)
> and Phase 2 (fix). Every candidate below must be **verified** before removal.

## Method

- Tools: [`knip@5`](https://knip.dev) (unused files/exports/deps) + `depcheck` (deps cross-check),
  both run via `npx` — **not** installed as devDependencies. Reason: in this worktree every
  `node_modules` is a symlink to the shared main checkout, so `npm install` would mutate deps
  used by other live sessions. Actual install + CI wiring is deferred to **Phase 6.1** (`f6135c6b`).
- Per-package `knip.json` configs were committed (admin-panel, kds, 3× mcp-*). They declare each
  package's real entry points (Vite `index.html`/`main.tsx`, Vercel `api/**`, MCP `src/index.ts`).

### Reliability of each package's baseline

| Package | node_modules present | Baseline trust | Notes |
|---|---|---|---|
| `apps/admin-panel` | ✅ (symlink → installed main checkout) | **Authoritative** | All knip plugins active; depcheck corroborates deps. |
| `apps/kds` | ✅ (`npm ci` run here) | **Authoritative** | Clean — see below. |
| `services/mcp-chef` | ❌ none | Partial | knip run with `eslint`/`vite`/`vitest` plugins disabled to execute at all. |
| `services/mcp-finance` | ❌ none | Partial | same |
| `services/mcp-mission-control` | ❌ none | Partial | same |

> **Partial baselines are noisy by construction.** With the `vitest` plugin disabled, knip treats
> every `*.test.ts` as an unused file (false positive). Without `node_modules` it cannot follow MCP
> tool-registration, so live tools (e.g. `mcp-chef/src/tools/search-makro-catalog.ts`, a registered
> tool) show as "unused". **Phase 1.5 (`cb7ac55b`) must re-run these after `npm ci`** for a faithful
> baseline. Dep / binary findings for the 4 partial packages are **unreliable — ignore for now**.

---

## `apps/admin-panel` — authoritative

| Category | Count | Action owner |
|---|---|---|
| Unused files | 43 | Phase 2.2 (`4d5c5232`) — **verify each** (see false-positive note) |
| Unused dependencies | 2 | Phase 2.2 |
| Unused devDependencies | 1 | Phase 2.2 |
| Unused exports | 28 | Phase 2.2 |
| Unused exported types | 158 | Phase 2.2 (mostly hook `UseXResult` interfaces) |
| Duplicate exports | 13 | Phase 2.4 / verify — likely lazy-route false positives |

### Unused dependencies (knip + depcheck agree)

- `react-force-graph-2d` — **likely real dead dep** (the force-graph page is among the unused files). Verify.
- `tailwindcss` — **FALSE POSITIVE**: consumed via `@tailwindcss/vite` plugin + CSS `@import`, not a JS import. **Keep.**
- `@testing-library/user-event` (devDep) — verify against test files before removing.

### Unused files (43) — candidate dead code, NOT yet confirmed

High-value candidates (whole orphaned pages/feature dirs):

- Pages: `Dashboard.tsx`, `ControlCenter.tsx`, `FinanceManager.tsx`, `KitchenDashboard.tsx`,
  `KitchenLive.tsx`, `LogisticsScanner.tsx`, `MyTasks.tsx`, `OrderManager.tsx`
- `components/control-center/*` (5 files), `components/kitchen-dashboard/*` (4),
  `components/finance/*` (9 incl. `index.ts`), `components/logistics/*`, `components/orders/*`,
  `components/receipts/InboxUploader.tsx`
- Hooks: `useBOMCoverage`, `useCapEx`, `useEquipmentSlots`, `useKitchenDashboard`,
  `useKitchenTasks`, `useStockTransfer`, `useSupplierMapping`
- Lib/api/types: `lib/printing.ts`, `lib/scanner.ts`, `api/mempalace.ts`, `types/receipt.ts`

⚠ **Verification required** — a file can be flagged "unused" because it is reached only via a
dynamic `import()` / router string that knip's entry graph did not trace. The cluster of orphaned
`*Dashboard`/`ControlCenter`/`OrderManager` pages suggests a **superseded admin surface** (plausibly
real dead code), but each must be confirmed against `App`/router config in Phase 2.2 before deletion.

### Duplicate exports (13) — verify, likely false positives

`Payslip`, `PayslipPdf`, `ScheduleTemplatePanel`, `FinanceAnalytics`, `FinanceDashboard`,
`FinanceLayout`, `FinanceLedger`, `AttendancePage`, `HRLayout`, `PayrollPage`, `SchedulePage`,
`StaffPage`, `KitchenTasksPage` — each exports both a named and a `default`. These pages are
lazy-loaded; the `default` is what the router uses. The named export may be unused but the file is
**live**. Treat as a lint nicety (drop the redundant named export), not dead code.

Full machine output: see PR build logs / re-run `cd apps/admin-panel && npx knip@5`.

---

## `apps/kds` — authoritative (re-run after `npm ci`)

**Clean.** Only finding is 1 "unused dependency" = `tailwindcss` — the same `@tailwindcss/vite`
false positive as admin-panel. **Keep it.** No unused files, no unused exports. The 21 "unused
files" reported in the deps-less first pass were 100% vitest false positives.

## Partial baselines (re-run after `npm ci` — Phase 1.5)

Reported headline counts (file-level signal only; **dep/binary lines ignored**):

| Package | Unused files (incl. test false-pos) | Unused exports | Unused exported types |
|---|---|---|---|
| `services/mcp-chef` | 21 | 16 | 5 |
| `services/mcp-finance` | 20 | 8 | 49 |
| `services/mcp-mission-control` | 4 | 1 | 0 |

Confirmed false positives already spotted:
- `mcp-chef`: all `*.test.ts` (vitest plugin off) **+** `src/tools/search-{homepro,line,makro,sangdamrong,tops}-catalog.ts`
  and `search-line-marketplace.ts` — these are **live registered MCP tools**, flagged unused only
  because tool registration is unresolved without deps.
- `mcp-mission-control`: all 4 "unused files" are `src/__tests__/*.test.ts` (vitest off). The one
  real export hint — `parseJsonIfString` in `src/lib/zod-helpers.ts` — is worth checking in Phase 1.5.

---

## Hand-off to later phases

- **Phase 1.1 / 1.2** (`70bf13c9` / `f25392ba`): `services/gas/` and `services/local-receipt-parser/`
  were not knip targets (no TS project). Confirm dead via grep — separate subtasks.
- **Phase 1.3** (`01be8f25`): audit admin-panel hooks — start from the unused-hook list above.
- **Phase 1.5** (`cb7ac55b`): `npm ci` then re-run knip on kds + 3 mcp services for a clean baseline.
- **Phase 2.2** (`4d5c5232`): prune verified-unused exports/deps; resolve `react-force-graph-2d`.
- **Phase 6.1** (`f6135c6b`): install knip + prettier as devDeps and wire `npx knip` into CI + pre-commit.
