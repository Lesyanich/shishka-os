# COO Autonomous Lane — CEO Handbook

> Quick reference for running the `coo-autonomous` lane.
> Full design: `docs/plans/spec-coo-autonomous-lane.md`
> Protocol rule: `RULE-AUTONOMOUS-LANE` in `docs/constitution/operational-rules.md`

## What it is

A narrow, opt-in lane that lets COO hand low-risk, reversible tasks directly to Code without the CEO mediating each one. You still review everything — just in batches, on your own schedule, not mid-execution.

## What Code will pick up automatically

Only tasks that carry **both** of these:
1. Tag `coo-autonomous` (COO sets this deliberately, not by default)
2. A whitelisted `kind:*` tag: `docs`, `cleanup`, `refactor`, `bug-fix`, `data-fix`

If either is missing → Code ignores it and waits for normal CEO gate.

## What Code will NEVER pick up autonomously

Even if `coo-autonomous` is on the task, Code refuses if the `kind:*` is one of:
- `security`, `rls` — production blast radius
- `meta` — rules/constitution/dispatch changes (you are the principal)
- `install`, `install-prod` — physical or production setup
- `rpc-backend` — schema/RPC changes that hit every agent
- `feature` — all feature work remains gated

If COO misroutes a blacklisted kind, Code strips the tag and posts a rejection comment. No silent execution.

## Your morning loop (≤ 2 minutes)

1. Open MC dashboard
2. Filter: `tag:coo-autonomous`, `status:done`, last 24h → glance at titles and PR links
3. If anything smells wrong → revert the PR on GitHub, comment on the task, strip the tag
4. Filter: `tag:coo-autonomous`, `status:blocked` → escalations from Code; read the comment, decide

## Your evening loop (≤ 1 minute)

1. Filter: `tag:coo-autonomous`, `status:in_progress` → anything stuck?
2. If a task has been in progress > 4 hours without a comment → ping Code to report

## Opt-out mechanisms

| I want to… | Do this |
|---|---|
| Pull one task back to gated review | Strip `coo-autonomous` tag from that task in MC |
| Disable the lane entirely (kill switch) | Create a project-level tag `coo-autonomous-paused` (any task with the tag, any domain) — Code checks for this on session-start and falls back to the normal critical queue |
| Retire the lane permanently | Remove `RULE-AUTONOMOUS-LANE` from `agent-rules.md` (this is a `kind:meta` change — you make it, not Code) |

## First two weeks — watch for

- **Scope creep**: any task that Code executed but you wish you had seen first → pull the tag, comment, note the `kind:*` that should not have been whitelisted
- **Gate-first violations**: Code proceeding when it should have escalated → revert PR, file a `kind:meta` follow-up to tighten rules
- **Throughput**: count how many tasks/week flow through the lane. If < 3, the lane is not worth it; if > 20 and clean, consider widening the whitelist

## When in doubt

Don't use the lane. The safe default is the gated flow — it has been working. The autonomous lane is a latency optimization for a narrow slice of work. Opt in task-by-task until you trust the pattern.
