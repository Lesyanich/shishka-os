# Spec: Code Cleanup & Security Hardening

> MC Initiative: `2a8b06a4-3cf3-4cda-b3af-413ccabb23fc` (`business_initiatives.slug = code-cleanup-security-hardening`)
> Domains: tech, ops · Status: planning · Author: COO (Claude Code) · Date: 2026-06-28
> Plan file: `~/.claude/plans/stateful-gliding-popcorn.md`

## 0. Vision

Months of fast shipping left legacy code + "garbage" and — more seriously — a **known but
unfixed security gap** (repo is public; the anon key ships in the browser bundle, so RLS is the
only protection). This epic **audits then fixes** across the whole monorepo, closes the
documented RLS gaps behind a **per-apply CEO gate**, and clears DB data garbage — without
regressing the existing strong CI/pre-commit gates.

## 1. Current state (from 2026-06-28 exploration)

- **Dead code:** `services/gas/` (DEPRECATED 2026-04-06, "DO NOT DEPLOY") and
  `services/local-receipt-parser/` (no imports anywhere).
- **No rot-detection:** no `knip` / `depcheck` / `prettier` configured. 109 admin-panel hooks
  (568 KB) with no unused/duplicate audit; large component dirs (`menu/` 356 KB, `finance/`,
  `mission-control/`).
- **5 React-Compiler ESLint rules disabled** to unblock CI (~49 violations) — existing task
  `6218a30f`.
- **Security:** RLS audit `287f3cee` (DONE, PR #52) → `docs/security/rls-audit-report.md` found
  **6 critical + 9 high** tables exposed to anon; fix migration `109_rls_audit_fixes.sql` was
  written but **never applied**. Column-level RLS gaps on `expense_ledger.amount_original`,
  `nomenclature.price`, `inventory_balances.quantity` (direct `.update()` instead of RPC).
- **Strong existing gates:** CI (tsc + eslint `--max-warnings 0` + migration canary + test-pair)
  and `.husky` pre-commit — the cleanup must keep these green.

## 2. Target

Dead services removed; `knip` + `prettier` enforced in CI; RLS critical/high gaps closed and
verified (anon cannot read/write protected tables); price/amount/quantity edits routed through
owner-gated RPCs with an audit log; data-health dangling references resolved.

## 3. Phases & subtasks (MC tree)

All tasks created in `inbox` (await CEO triage). Tools are listed per subtask in each MC task's
description. `blocked_by` enforces fix-after-audit ordering.

### Phase 0 — Tooling & Baseline · `6412ef5b`
| Sub | Task ID | Tools |
|---|---|---|
| 0.1 Install knip + depcheck (monorepo) + baseline | `a8283f2c` | knip, depcheck, npm |
| 0.2 Shared `.prettierrc` + enforcement | `0ae8f133` | prettier, eslint |
| 0.3 `supabase get_advisors` baseline | `f8e1359d` | supabase get_advisors |
| 0.4 Graphify coupling map | `6e6c34c8` | shishka-graphify |

### Phase 1 — Code Audit (discovery) · `ef038c05`
| Sub | Task ID | Tools |
|---|---|---|
| 1.1 Confirm `services/gas/` dead | `70bf13c9` | grep, knip |
| 1.2 Confirm `services/local-receipt-parser/` dead | `f25392ba` | grep, knip |
| 1.3 Audit 109 hooks | `01be8f25` | knip, codereview |
| 1.4 Audit large components | `f7ce47b3` | codereview, graphify |
| 1.5 Audit MCP/kds/edge functions | `cb7ac55b` | codereview, grep |

### Phase 2 — Code Fix (blocked_by Phase 1) · `ad32c9c7`
| Sub | Task ID | Tools |
|---|---|---|
| 2.1 Remove dead services | `7d56412c` | git, /code-review |
| 2.2 Prune unused exports/imports/deps | `4d5c5232` | knip, /simplify |
| 2.3 Consolidate duplicate hooks | `cc1421a4` | /simplify, refactor-method-complexity-reduce |
| 2.4 Extract/split large components | `59088165` | request-refactor-plan, refactor-method-complexity-reduce |
| 2.5 React-Compiler rules (links `6218a30f`) | `471f17a9` | /code-review, eslint |

### Phase 3 — Security Audit · `0f427d84`
| Sub | Task ID | Tools |
|---|---|---|
| 3.1 Reconcile RLS audit + renumber fix mig | `c36c3210` | get_advisors, execute_sql, security-review |
| 3.2 AppSec review auth + /api boundary | `abe792de` | security-review |
| 3.3 Service-role isolation audit | `c081de36` | security-review, codereview, grep |
| 3.4 Column-level RLS → RPC design | `b91be681` | security-review, execute_sql |

### Phase 4 — Security Fix (⚠ CEO gate per apply; blocked_by Phase 3) · `86f69daa`
| Sub | Task ID | Tools |
|---|---|---|
| 4.1 Apply RLS fixes — 6 critical | `a456cc85` | supabase apply_migration |
| 4.2 Apply RLS fixes — 9 high + TWA gating | `773face7` | supabase apply_migration |
| 4.3 Column-level RLS → RPC + audit log | `c2a5d578` | supabase apply_migration |
| 4.4 Post-fix verification | `7df422ba` | get_advisors, /code-review ultra, manual |

### Phase 5 — DB Data-Health Cleanup · `26f8a912`
| Sub | Task ID | Tools |
|---|---|---|
| 5.1 Data-health snapshot | `fec6cde7` | execute_sql, shishka-chef |
| 5.2 Resolve soft-deleted RAW in active BOMs (coord. `e9b9e2a3`) | `fb7dbb18` | shishka-chef, execute_sql |

### Phase 6 — Lock the gains · `c2af0f40`
| Sub | Task ID | Tools |
|---|---|---|
| 6.1 knip + prettier into CI + pre-commit (blocked_by Phase 2) | `f6135c6b` | ci.yml, .husky, /code-review |
| 6.2 Sync arch notes + tech-debt.md (blocked_by Phase 2+4) | `0845e39f` | docs |

## 4. Linked existing tasks (do NOT duplicate)

| Task | Status | Relationship |
|---|---|---|
| `6218a30f` React-Compiler ESLint rules | inbox | continue under 2.5 |
| `287f3cee` RLS audit | done | input to Phase 3 |
| `e9b9e2a3` RAW-AUTO dedup | in_progress (other session) | coordinate from 5.2, do not touch its stubs |

## 5. Acceptance criteria

- [ ] `knip` + `prettier` run clean and are enforced in CI + pre-commit.
- [ ] `services/gas/` + `services/local-receipt-parser/` removed; build + CI green.
- [ ] `supabase get_advisors` returns **0 critical / 0 high** security findings.
- [ ] With only the anon key, SELECT/INSERT/UPDATE on every fixed table is **blocked**.
- [ ] price/amount/quantity edits go through owner-gated RPCs with audit-log rows.
- [ ] Mission Control read+write smoke test passes before AND after the
      `business_tasks` / `business_initiatives` RLS fix.
- [ ] `v_dangling_bom` shows no active BOM line pointing at a soft-deleted RAW.

## 6. Out of scope

Net-new features / product tech-debt (Finance GDrive backup, NLP parser, Chef inbox);
replacing the auth model (we harden RLS, not `signInWithPassword`); the dead `apps/web` stub.

## 7. Risks

- **Migration numbering** — compute the next free number from prod `migration_log`; do not
  trust the report's old `109`.
- **`business_tasks`/`business_initiatives` RLS (4.1)** is delicate — MC runs on them; smoke-test
  authenticated + service-role paths before/after.
- RLS fixes touch prod DB → every apply is CEO-gated.
