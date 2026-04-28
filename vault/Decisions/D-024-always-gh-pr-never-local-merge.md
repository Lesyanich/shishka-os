---
title: D-024 — Always merge via gh pr create + gh pr merge, never local merge to main
type: decision
id: D-024
tags: [decision, tech]
date: 2026-04-20
status: ratified
decided_by: lesia
domain: Tech
supersedes: []
superseded_by: null
related:
  - "[[Decisions/D-023-recheck-branch-before-staging]]"
  - "[[Projects/Multi-Agent Coordination v2]]"
aliases: []
---

# D-024 — Always merge via gh pr create + gh pr merge, never local merge to main

> [!decision] Decided 2026-04-20 by lesia
> When integrating a feature branch, always `gh pr create --base main --fill` followed by `gh pr merge --squash --delete-branch`; never `git checkout main && git merge && git push`.

## Context

Parallel Claude sessions push to `main` concurrently and produce non-fast-forward rejections. STATUS.md is also always dirty from the generate-status hook, which blocks rebase. Local merge-and-push fails repeatedly; GitHub handles concurrent merges atomically.

## Decision

When the user says "мердж" or "merge into main", create the PR via `gh pr create` and merge via `gh pr merge --squash`. Do not check out `main` locally for an integration merge.

## Rationale

GitHub's merge queue serializes concurrent integrations and bypasses the local STATUS.md churn. Local merges race and lose; PR merges win and preserve history.

## See Also

- [[Decisions/D-023-recheck-branch-before-staging]]
- [[Decisions/D-003-commit-and-push-after-every-change]]
