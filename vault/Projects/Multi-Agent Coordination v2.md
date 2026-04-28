---
title: Multi-Agent Coordination v2
type: project
tags: [project, agents, coordination, mc]
date: 2026-04-11
status: done
domain: "[[Domains/Admin Panel]]"
mc_task: 3f41841d
spec: docs/plans/spec-multi-agent-coordination.md
branch: feature/shared/multi-agent-coordination-v2
pr_numbers: [51, 147]
start: 2026-04-11
end: 2026-04-28
related:
  - "[[Decisions/D-018-claim-task-first-action]]"
  - "[[Milestones/2026-04-28-multi-agent-coordination-v2]]"
aliases: [Claim Gate, MAC v2]
---

# Multi-Agent Coordination v2

> [!info] Project
> Harness-enforced claim gate so two parallel Claude sessions cannot grab the same MC task.

## Objective

v1 (PR #51) shipped the protocol as convention; agents could still ignore it. v2 makes coordination enforced via three additions: globally unique session IDs (Claude `session_id` 8-char prefix or `MMDD-HHMM-rand4` fallback), an active SessionStart hook that injects live `in_progress` task state, and a PreToolUse hook on `mcp__shishka-mission-control__update_task` that denies foreign claims with a structured reason. Stale-detection now reads `updated_at` (auto-bumped on every write), not `claimed_at`.

## Current State

- **Phase:** shipped, in production
- **Owner:** [[People/Lesia]]
- **Spec:** `docs/plans/spec-multi-agent-coordination.md`
- **Branch:** `feature/shared/multi-agent-coordination-v2`
- **PRs:** #51 (v1), #147 (v2)

## Recent Outcomes

- 2026-04-21 — v1 merged (PR #51) — claim algorithm as skill text
- 2026-04-28 — v2 merged (PR #147) — claim gate now enforced by harness hook (see [[Milestones/2026-04-28-multi-agent-coordination-v2]])
- 2026-04-28 — `.claude/.session-id` per worktree, read by all downstream tools (never construct inline)

## Risks & Open Questions

- Hook fail-open philosophy means infrastructure problems (missing keychain, network error) silently allow — only proven collisions block

## See Also

- Spec: `docs/plans/spec-multi-agent-coordination.md`
- Related: [[Decisions/D-018-claim-task-first-action]], [[Milestones/2026-04-28-multi-agent-coordination-v2]]
- Domain: [[Domains/Admin Panel]]
