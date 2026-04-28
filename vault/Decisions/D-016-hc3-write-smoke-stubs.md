---
title: D-016 — HC-3 gate requires smoke test stubs for new admin-panel files
type: decision
id: D-016
tags: [decision, tech]
date: 2026-04-09
status: ratified
decided_by: lesia
domain: Tech
supersedes: []
superseded_by: null
related:
  - "[[Domains/Admin Panel]]"
  - "[[Decisions/D-025-eslint-off-not-warn-with-max-warnings-0]]"
aliases: []
---

# D-016 — HC-3 gate requires smoke test stubs for new admin-panel files

> [!decision] Decided 2026-04-09 by lesia
> New `apps/admin-panel/src/` files must ship with a co-located `*.test.ts` smoke stub that imports vitest, even though admin-panel has no test runner yet.

## Context

PR #38 (brain-view) was blocked by `scripts/check-test-pair.sh` for 7 missing test files. The HC-3 AI-TDD gate enforces co-located tests by file existence only — there is no runner; vitest is in devDeps but `vitest.config.ts` is absent. Tech-debt task `fd8af0bf` tracks installing the runner.

## Decision

For each new `.ts/.tsx` file under `apps/admin-panel/src/`, write a minimal stub at `<dir>/__tests__/<name>.test.ts` that imports `describe/it/expect` from `vitest` and asserts a named-export shape, marked with `// TODO(<feature>): expand once vitest is wired`. Never bypass with `--no-verify`; never install the runner mid-feature.

## Rationale

The pre-commit gate is file-existence only, so smoke stubs satisfy it cheaply. They typecheck against the existing devDep, and once the runner lands they can be expanded into real RTL assertions without a structural change.

## See Also

- [[Domains/Admin Panel]]
- [[Decisions/D-025-eslint-off-not-warn-with-max-warnings-0]]
