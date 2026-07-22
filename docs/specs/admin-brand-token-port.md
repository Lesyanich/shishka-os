# Spec — Port brand royal-theme tokens into admin `/menu` (brand-critical convergence)

> **Status:** inbox / not started · **Created:** 2026-06-28 by CEO (Lesia) · **Executor:** Claude Code
> **Branch to use:** `feature/admin/brand-token-port`
> **MC note:** Mission Control MCP was down (`Invalid supabaseUrl`) when this was created — re-emit as a `tech` business_task when MC is back (ready-to-emit fields at bottom).

## Why
The admin `/menu` is **not** unstyled — it has its *own* divergent dark token set in
`apps/admin-panel/src/index.css` `@theme` ("extracted from logo .ai"). That set drifts from the
canonical brand royal theme used on the customer site (`shishka-health/src/styles/tokens/`).
This is a **competing design system**, not a missing one.

## Scope decision (CEO, 2026-06-28): BRAND-CRITICAL convergence — NOT full 1:1
The admin is a **dense data tool** (owner table, food-cost badges, BOM trees). Its near-black
surfaces are arguably *better* for that than the marketing royal-green. So:

### ✅ CONVERGE (admin value → canonical value)
| Token | Admin now | Canon target |
|---|---|---|
| accent / CTA red | `--color-royal-red #9B1C21` | `--accent #B62A23` (red-600) |
| price ink | (amber/various) | honey-300 `#F0CE83` (`--menu-price`) |
| cream text | `#F0EAD6` | `#FBF8F0` (`--cream-50`) |
| display + body font | Alegreya (serif) / Geist | **Albert Sans** (SF Pro w/ Albert Sans fallback) — `--font-display`, `--font-sans` |
| numerics | JetBrains Mono | keep mono (canon uses SF Mono `tabular-nums`) — fine to keep JetBrains |
| contrast contract | ad-hoc | adopt MASTER's a11y contract & anti-patterns |

### 🚫 KEEP (intentional admin divergence)
- Near-black dense surfaces `--s-0 #0A0D08 / --s-1 #10150D / --s-2 #171E12 / --s-3 #1F2818`
- Food-cost threshold colors (`--color-fc-good/warn/bad`), nutrition-badge palette, table density.

## ⚠️ KEY TRAP (do not skip)
Canon contrast numbers (text-body .86 = 9.33:1, muted .62 = 5.63:1, faint .45 large-only) are
verified **against `#1E3903` (royal-green)**. The admin base is **near-black `#0A0D08`** — a
*different* background. **Recompute every alpha-text contrast against the admin surface the text
actually sits on** before trusting it. See memory `gotcha_design_royal_theme_trap` (compositing
model: composite the alpha over the surface, then ratio vs that surface).

## Files in play
- `apps/admin-panel/src/index.css` — the `@theme` block to edit (source of truth for admin tokens)
- `apps/admin-panel/src/pages/menu/components/` — `DishCard.tsx`, `OwnerTable.tsx`,
  `CustomerPreview.tsx`, `NutritionBadge.tsx`, `L1CookView.tsx`, `L2AssemblerView.tsx`
- Canon reference (read-only, other repo): `shishka-health/src/styles/tokens/{colors,theme-royal,fonts,typography}.css`
  and the living guide `shishka-health/design-system/index.html` + `MASTER.md`

## Definition of done
1. `@theme` brand-carrying tokens converged; near-black surfaces + data palette preserved.
2. `/menu` components read converged tokens (no raw hex left for brand colors).
3. All alpha-text contrast **recomputed against admin surfaces** ≥ AA (≥4.5 small / ≥3 large).
4. `npm run build` green (`tsc -b` — stricter than pre-commit; see `feedback_preview_before_pr`).
5. Per-PR **Vercel preview link** delivered BEFORE merge (CEO workflow — test on preview, not prod).

---

## Ready-to-emit MC fields (when MC is back)
- title: `Port brand royal-theme tokens into admin /menu (brand-critical convergence)`
- domain: `tech` · executor_type: `code` · priority: `medium` · source: `owner`
- tags: `[design-system, admin-panel, tokens, brand]`
- related_ids: `{git_branch: feature/admin/brand-token-port, spec_file: docs/specs/admin-brand-token-port.md}`
