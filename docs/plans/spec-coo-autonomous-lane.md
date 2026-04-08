# Spec — COO Autonomous Lane

> MC Task: `201267d0-590a-47dd-b00d-db6f45c6d7ae`
> Author: Code Agent (implementing COO protocol)
> Status: draft → active upon merge
> Parent initiative: `a27e85db-5a7f-4bcd-a149-ef6c3b62ce0b` (AI-Native Operations Modernization)

## Problem

Currently every COO → Code handoff requires the CEO to mediate: COO drafts a task, CEO reviews it, CEO routes it to Code, Code executes, CEO reviews the result. For low-risk, reversible work (docs cleanup, typo fixes, data-fix migrations, small refactors) this adds latency without adding safety. The CEO stated (2026-04-08): «я хочу чтобы некоторые задачи, которые не требуют моего апрува COO и код передавали друг другу».

## Goal

Introduce a narrow, opt-in lane where COO can hand low-risk tasks directly to Code. Code picks them up in session-start, executes the full lifecycle (work → PR → MC done), and reports on the next morning loop. CEO retains veto via opt-out and a morning/evening review.

## Non-goals

- Session-switching automation, parallel agent orchestration, background daemons
- Any change to how **high-risk** tasks (security, RLS, feature work pre-phase-D, RPC/schema) are handled — those still gate through CEO
- Silent escalation or "fall-through" from autonomous to gated — blacklisted kinds are hard-stops

## Design

### The lane: `coo-autonomous` tag

COO applies tag `coo-autonomous` to a task. The tag is the opt-in marker. Without the tag, behavior is unchanged (CEO gate required).

### Whitelist (kinds eligible for autonomous lane)

- `kind:docs`
- `kind:cleanup`
- `kind:refactor`
- `kind:bug-fix`
- `kind:data-fix`

Rationale: all are reversible, locally-scoped, and have no production blast radius beyond a PR revert.

### Blacklist (kinds that MUST NOT carry `coo-autonomous`)

- `kind:security`, `kind:rls` — prod blast radius, CEO must review
- `kind:meta` — changes to constitution/protocol/dispatch; CEO is the principal
- `kind:install`, `kind:install-prod` — physical or production setup, not reversible
- `kind:rpc-backend` — schema/RPC changes hit every agent; CEO gate
- `kind:feature` — all feature work remains gated until Kitchen UX v2 Phase D lands (then reviewed case-by-case)

If COO tags a blacklisted kind with `coo-autonomous`, Code **refuses and escalates** — this is a hard constraint, not a judgement call.

### Code session-start behavior

In `list_tasks` session-start flow, Code filters by `tag:coo-autonomous` first:

```
list_tasks(status="in_progress")              # continuity (unchanged)
  ↓ empty
list_tasks(status="inbox", tag="coo-autonomous")   # NEW: autonomous queue
  ↓ empty
list_tasks(status="inbox", priority="critical")    # normal fallback
```

If an autonomous task is found:
1. Verify tag + kind combination against whitelist/blacklist
2. If blacklisted kind → add comment "REJECTED: kind X not eligible for autonomous lane", strip `coo-autonomous` tag, leave in inbox
3. Otherwise move to `in_progress`, run full lifecycle, close with `status=done` + PR
4. No CEO ping mid-work

### Gate-first discipline (still applies)

Even inside the autonomous lane, Code uses gate-first workflow:
- Verify before asserting (no "all done" without running build/lint/tests)
- Investigate unexpected state before deleting/overwriting
- Escalate if the task turns out to need a blacklisted action

Gate-first failures **do not fall through** to silent CEO-gated processing — Code posts a comment explaining the blocker and leaves the task `in_progress`.

### CEO morning/evening loop

CEO opens MC in the morning and evening and reviews:
- `status=done` with tag `coo-autonomous` in the last 24h (sanity check)
- `status=blocked` with tag `coo-autonomous` (escalations)

If anything looks wrong, CEO reverts the PR and comments on the task. No active intervention required during autonomous execution.

### Opt-out

CEO can:
- Strip the `coo-autonomous` tag from any inbox task (pulls it back to the gated lane)
- Add `coo-autonomous-paused` tag at the project level to disable the lane entirely (Code checks this on session-start)
- Remove `coo-autonomous` from COO's tag vocabulary in a later protocol update (hard off-switch)

## Acceptance criteria

1. `docs/constitution/agent-rules.md` has a new `RULE-AUTONOMOUS-LANE` section with whitelist, blacklist, gate-first, opt-out
2. `docs/business/DISPATCH_RULES.md` has a new routing row: `coo-autonomous` tag → Code direct pickup, bypass CEO gate
3. `CLAUDE.md` L0 session-start includes the new `tag="coo-autonomous"` filter step with explicit ordering
4. `docs/operations/coo-autonomous-lane.md` exists and documents CEO-facing morning/evening loop + opt-out mechanisms in ≤ 1 page
5. This spec exists and is linked from MC task `201267d0`
6. No code changes in this phase (MCP tools / UI are unchanged; tag-based routing is convention-only)

## Out of scope

- Parallel agent sessions, session-switching, background daemons
- Automated PR review by Code on autonomous-lane PRs (still human review in GH)
- Metrics/telemetry on lane usage — track manually until volume justifies instrumentation
- Any change to Chef/Finance agent routing — those have their own domain-specific flows

## Rollout

1. Merge this spec + docs (no code)
2. COO starts tagging 1–2 low-risk tasks/day with `coo-autonomous`
3. After 2 weeks, CEO reviews: did any task escape scope? Any blacklist violation? Any regret?
4. If stable → expand whitelist to `kind:test` and `kind:schema-patch` (additive, reviewed case-by-case)
5. If unstable → pause lane via `coo-autonomous-paused`, post-mortem, fix rules
