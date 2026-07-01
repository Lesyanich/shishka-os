# Prettier — Config & Enforcement Decision (Phase 0.2)

> Epic: Code Cleanup & Security Hardening (`2a8b06a4`) · Phase 0.2 (`0ae8f133`)
> Adds the first `.prettierrc` to the repo (formatting previously relied on ESLint alone).

## Config (`.prettierrc`) — derived from the existing code, not imposed

Measured the prevailing style across `apps/admin-panel/src` (605 ts/tsx files) and matched it:

| Option | Value | Evidence |
|---|---|---|
| `semi` | `false` | 0 statement lines end with `;`, 5089 do not |
| `singleQuote` | `true` | 1468 single-quote imports, 0 double |
| `jsxSingleQuote` | `false` | 6737 double-quote JSX attrs, 0 single |
| `trailingComma` | `all` | multiline imports/objects already carry trailing commas |
| `tabWidth` / `useTabs` | `2` / `false` | 2-space indent throughout |
| `arrowParens` | `always` | 1575 `(x) =>` vs 44 bare `x =>` |
| `printWidth` | `100` | see drift analysis below |

## Enforcement decision: **format-on-change, NOT a repo-wide reformat**

`prettier --check` with the matched config still reports **332 / 605** admin-panel files as
unformatted at `printWidth: 100` (373 at `80`) — purely line-reflow, because the code was never
prettier-formatted. A one-shot `prettier --write` was **rejected**:

- It would touch ~330+ files in admin-panel alone (plus kds + services) → an unreviewable diff.
- It would collide with the **11 other in-flight session PRs** (auth hardening, expiry/variance,
  coffee modifiers, site-content epic, …) currently open against this monorepo.
- It would erase `git blame` history across the whole frontend.

**Adopted instead — incremental, format-on-touch:**

1. **Pre-commit** (`.husky/pre-commit`): run `prettier --write` on **staged** `*.{ts,tsx,js,mjs,json,css,md}`
   files only, then re-stage. New/edited files are auto-formatted; untouched files are left alone.
2. **CI** (`.github/workflows/ci.yml`): run `prettier --check` on files **changed in the PR** (diff
   vs `main`), not the whole tree — consistent with the existing `eslint --max-warnings 0` gate.
3. The 332 legacy files converge to formatted as they are naturally edited. No big-bang.

> `printWidth: 100` chosen over `80` because it produces the smaller drift (332 vs 373) and is the
> modern default — so the lazy convergence above is as small as possible.

## ESLint coexistence

The admin-panel/kds ESLint flat configs are **correctness-only** (typescript-eslint +
react-hooks + react-refresh) — no stylistic/layout rules — so Prettier and ESLint do **not** conflict
and `eslint-config-prettier` is not required today. If a future stylistic ESLint rule is added,
layer `eslint-config-prettier` last. (Re-verify in Phase 6.1 before wiring CI.)

## Hand-off

- **Phase 6.1 (`f6135c6b`)**: install `prettier` as a devDependency (deferred here because the worktree
  `node_modules` is a shared symlink — see Phase 0.1 note) and wire the two enforcement points above.
  This PR ships **config only**; nothing is enforced until 6.1.
