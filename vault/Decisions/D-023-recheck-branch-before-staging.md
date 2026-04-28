---
title: D-023 — Re-check git branch immediately before staging
type: decision
id: D-023
tags: [decision, tech]
date: 2026-04-14
status: ratified
decided_by: lesia
domain: Tech
supersedes: []
superseded_by: null
related:
  - "[[Projects/Multi-Agent Coordination v2]]"
  - "[[Decisions/D-024-always-gh-pr-never-local-merge]]"
aliases: []
---

# D-023 — Re-check git branch immediately before staging

> [!decision] Decided 2026-04-14 by lesia
> Run `git branch --show-current` right before `git add`/`commit`/`push`; never rely on memory from earlier in the session.

## Context

2026-04-14, task 3b26278f: agent created `feature/kds/writeback-schedule-fn`, worked for a while, returned to stage, and `git status` reported the working tree was now on `fix/admin/api-costs-route` with two new commits from a parallel session. Multiple Claude Code windows run against the same Google Drive-backed working tree — any of them can `git switch` and silently flip the branch underneath.

## Decision

Before every `git add`/`commit`/`push`, confirm the current branch matches the one the task is on. Prefer creating new untracked files for work-in-progress (they survive branch switches). If the branch is wrong, `git switch <expected>` first, recheck status, then stage. If `.git/index.lock` appears, wait — another session is mid-operation; do not delete it.

## Rationale

The working tree is shared state across sessions, not per-session. Memory of "the branch I was on 10 minutes ago" is not a safe assumption.

## See Also

- [[Projects/Multi-Agent Coordination v2]]
- [[Decisions/D-024-always-gh-pr-never-local-merge]]
