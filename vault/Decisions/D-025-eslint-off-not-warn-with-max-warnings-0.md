---
title: D-025 — Use ESLint 'off' (not 'warn') under --max-warnings 0 pre-commit
type: decision
id: D-025
tags: [decision, tech]
date: 2026-04-07
status: ratified
decided_by: lesia
domain: Tech
supersedes: []
superseded_by: null
related:
  - "[[Domains/Admin Panel]]"
  - "[[Decisions/D-016-hc3-write-smoke-stubs]]"
aliases: []
---

# D-025 — Use ESLint 'off' (not 'warn') under --max-warnings 0 pre-commit

> [!decision] Decided 2026-04-07 by lesia
> When relaxing an ESLint rule in admin-panel or MCP services, set it to `'off'`; `'warn'` still blocks commits because pre-commit runs `--max-warnings 0`.

## Context

`.husky/pre-commit` runs `npx eslint --max-warnings 0` on staged files in `apps/admin-panel` and the three MCP services (`mcp-chef`, `mcp-finance`, `mcp-mission-control`). Boris wants a zero-warning local policy. PR #25 (task 82e7a68b) downgraded five React-Compiler-aligned rules from `'error'` to `'warn'` to tolerate pre-existing violations — the commit blocked anyway, even though `npm run lint` (CI) passed.

## Decision

To defer a noisy rule, set it to `'off'` in `eslint.config.js` and track the deferral in an MC follow-up task. Before committing config changes, run `cd apps/admin-panel && npm run lint` and confirm `0 problems` (not just `0 errors`).

## Rationale

`--max-warnings 0` makes warnings indistinguishable from errors at commit time. `'warn'` provides no escape hatch — it just blocks every future commit that touches the affected files. `'off'` is honest: the rule is deferred, the deferral is tracked elsewhere.

## See Also

- [[Domains/Admin Panel]]
- [[Decisions/D-016-hc3-write-smoke-stubs]]
