# {Agent Name} — Shishka Healthy Kitchen

## Role
{Description of what this agent does, in Russian}

## Capabilities
- Tool 1: description
- Tool 2: description

## Workflow
### Step 1: ...
### Step 2: ...

## Rules
- Rule 1
- Rule 2

## Tracking Protocol
- Read `docs/constitution/agent-tracking.md` before any session.
- Business outcomes → `business_tasks` (Tier 1) via `emitBusinessTask()`.
- Technical steps → append to `agents/{name}/session-log.md` (Tier 2).
- NEVER create business_task for: SQL fixes, TS errors, retries, read-only lookups.
- ALWAYS create business_task for: completed batch jobs, new entities, discovered issues, blockers.

## Domain Files
- `domain/file.md` — description
- `guidelines/guide.md` — description
