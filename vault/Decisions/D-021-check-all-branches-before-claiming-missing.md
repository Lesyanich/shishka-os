---
title: D-021 — Check all branches before claiming planning artifacts are missing
type: decision
id: D-021
tags: [decision, ops]
date: 2026-04-14
status: ratified
decided_by: lesia
domain: Tech
supersedes: []
superseded_by: null
related:
  - "[[Decisions/D-023-recheck-branch-before-staging]]"
  - "[[Domains/Admin Panel]]"
aliases: []
---

# D-021 — Check all branches before claiming planning artifacts are missing

> [!decision] Decided 2026-04-14 by lesia
> Before reporting that planning artifacts (`.planning/phases/*`, CONTEXT.md, RESEARCH.md) are missing, run `git log --oneline --all -- '.planning/phases/*'` to find them on diverged branches.

## Context

Planning artifacts had been committed on `feature/kds/pre-commit-husky`, but current work moved to `feature/kds/e2e-smoke`. Init reported "no context" because it only inspected the working tree, and the agent re-asked discuss-phase questions Lesia had already answered. Re-asking erodes trust and wastes time.

## Decision

When init or session-start cannot find planning artifacts in the working tree, check `git log --all` for the path before reporting missing. If found, restore with `git show <commit>:<path>` rather than re-asking.

## Rationale

The repo runs many short-lived feature branches; artifacts produced on one branch are reachable from `git --all` even when not in the current tree. The user has already paid the cost of answering once — the agent must look harder before charging that cost again.

## See Also

- [[Decisions/D-023-recheck-branch-before-staging]]
- [[Decisions/D-022-skip-ui-spec-when-context-has-decisions]]
