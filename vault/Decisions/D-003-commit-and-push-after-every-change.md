---
title: D-003 — Commit and push after every meaningful change
type: decision
id: D-003
tags: [decision, ops]
date: 2026-03-31
status: ratified
decided_by: lesia
domain: Tech
supersedes: []
superseded_by: null
related:
  - "[[Domains/Admin Panel]]"
  - "[[People/Lesia]]"
aliases: []
---

# D-003 — Commit and push after every meaningful change

> [!decision] Decided 2026-03-31 by lesia
> Every completed task must end with `git add` + `git commit` + `git push`, plus an update to CURRENT.md and any affected Obsidian docs.

## Context

The repo lives on Google Drive and Lesia works across multiple sessions and devices. Batching multiple tasks into one delayed commit causes lost work and confusion when other devices sync in mid-flight.

## Decision

After completing each task or feature: stage the relevant files, commit, push, and update `docs/context/projects/{project}/CURRENT.md`. Update Obsidian docs whenever DB schema, architecture, or phase status shifts. Do not wait until session end.

## Rationale

Incremental commits keep the working tree small, make conflicts surface early, and ensure every device synced via Google Drive sees the same state. Bundled commits delay this safety net for no benefit.

## See Also

- [[Domains/Admin Panel]]
- [[Decisions/D-024-always-gh-pr-never-local-merge]]
