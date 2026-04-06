# P0 Rules — Immutable Foundation

> Priority: P0 (this file) > Module rules > Task-specific context

## Systems of Record

| System       | Role                  | Notes                                                  |
|--------------|-----------------------|--------------------------------------------------------|
| **SYRVE**    | System of Record (SoR)| Inventory, BOM, Sales. Pushed via `nomenclature_sync`. |
| **Supabase** | System of Engagement  | KDS, DB (PostgreSQL 17.6). SSoT for our apps.          |
| **Obsidian** | Knowledge Base        | Must reflect DB reality. Logs and Handovers live here.  |

## 5 Immutable Rules

1. **SSoT (Single Source of Truth):** Supabase (PostgreSQL 17.6) is the ONLY source of truth. UI is just a mirror.
2. **UUID Compliance:** All database relationships MUST use UUIDs. No exceptions.
3. **Lego-Architecture (BOM):** Menu modules: RAW (Raw) → PF (Semi) → MOD (Topping) → SALE (Dish).
4. **No Direct DB Edits:** All DB schema changes must be written as SQL migrations in `services/supabase/migrations/`.
5. **State Management:** Always call `generate_status` at session start. STATUS.md is auto-generated on commit (HC-1) — never edit it manually. If MC tasks don't reflect reality, update them via `update_task`.
6. **Agent Tracking Protocol:** Агенты пишут бизнес-результаты в `business_tasks` (Tier 1) и ведут технические шаги в `agents/{name}/session-log.md` (Tier 2). Полный протокол: `docs/constitution/agent-tracking.md`. Засорять Mission Control техническим мусором ЗАПРЕЩЕНО.

## Data Integrity Rules

- **UUID First:** ALL IDs sourced from SYRVE must be stored as `UUID`.
- **Naming Law:** ALL CAPS with underscores (e.g., `RAW_CARROT`).
- **RLS Security:** Always validate security policies. Assume all client requests are hostile.

## Socratic Gate

For any new feature, DB migration, or complex request — **STOP**. Do not generate the solution immediately.
Ask 2-3 specific architectural questions focusing on:
1. Scalability (e.g., recursive BOM queries)
2. SSoT alignment (e.g., SYRVE conflicts)
3. Security (e.g., JWT tampering in RPCs)

*Only proceed with code generation after the user answers.*

## Backlog First Protocol

If while working on task A the agent discovers missing functionality B or has an idea for improving another agent/module — **do NOT start implementing it immediately**.

The agent MUST:
1. **Formulate** the task clearly (what, why, expected outcome).
2. **Assess priority** (HIGH / MEDIUM / LOW).
3. **Log it** in `docs/tech-debt.md` (if technical) or `STATUS.md` Backlog section (if feature/business).
4. **Report** to the user: "Discovered [X], logged as [priority] in [file]. Continue with current task?"
5. **Wait for confirmation** before planning or executing the new task.

This preserves focus, saves tokens, and prevents scope creep during active sessions.

## Worktree Discipline (Boris Rule #12)

Code in worktrees is INVISIBLE to main. Before ending a session that used worktrees:
1. **Commit or cherry-pick** finished work into the target branch.
2. **If not ready** — create MC task (status: inbox) with worktree path and file list.
3. **NEVER** leave code only in a worktree without a trail in MC or git log.

Violation of this rule caused loss of the full Receipt Review UI (InboxReviewPanel, ~1000 LOC) on 2026-04-04.

## Migration Tracking (Boris Rule #16)

Every migration file MUST end with a self-register INSERT into `migration_log`.
Before applying a migration manually, run `check_migrations()` to see the pending list.
After applying, verify the migration registered itself: `check_migrations()` should show it as 'applied'.
If migration crashed mid-way — INSERT manually with `status='failed'` and `error_msg`.

## Compound Engineering (The Boris Rule)

If you make a mistake and the user corrects you, you MUST update the relevant file in `docs/` to ensure you NEVER make this mistake again.
