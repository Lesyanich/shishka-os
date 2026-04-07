# [DEPRECATED] boris-rules.md

> **This file is deprecated as of 2026-04-07.**
>
> The "Boris Rules" name was legacy with no remaining meaning. Numbering had drifted (rules started at #8, two different files used #13 for two different rules). All rules have been migrated to semantic IDs in the new constitution layout.

## Migration Map

| Legacy ID | New ID | New Location |
|---|---|---|
| Boris Rule #8 (BOM filtering) | `RULE-BOM-PREFIX-FILTER` | `engineering-rules.md` |
| Boris Rule #9 (Obsidian protocol) | `RULE-ARCH-NOTE-SYNC` | `engineering-rules.md` |
| Boris Rule #10 (DB schema docs) | `RULE-DB-SCHEMA-DOCS` | `engineering-rules.md` |
| Boris Rule #11 (Commit gate) | `RULE-COMMIT-GATE` | `engineering-rules.md` |
| Boris Rule #12 (Txn date — engineering) | `RULE-TXN-DATE-INTEGRITY` | `engineering-rules.md` |
| Boris Rule #13 (Edge fn / async LLM) | `RULE-ASYNC-LLM-PATTERN` | `engineering-rules.md` |
| Boris Rule #13 (Task closure — agent-tracking) | `RULE-TASK-CLOSURE` | `agent-rules.md` |
| Boris Rule #14 (Spec binding) | `RULE-SPEC-MC-BINDING` | `agent-rules.md` |
| Boris Rule #15 (MCP identity) | `RULE-MCP-IDENTITY` | `agent-rules.md` |
| Boris Rule #17 (Scoped context) | `RULE-SCOPED-CONTEXT` | `agent-rules.md` |
| P0 Rule #1 (Supabase SSoT) | `RULE-SUPABASE-SSOT` | `core-rules.md` |
| P0 Rule #2 (UUID) | `RULE-UUID-COMPLIANCE` | `core-rules.md` |
| P0 Rule #3 (Lego BOM) | `RULE-LEGO-ARCHITECTURE` | `core-rules.md` |
| P0 Rule #4 (No direct DB edits) | `RULE-NO-DIRECT-DB-EDITS` | `core-rules.md` |
| P0 Rule #5 (State management) | `RULE-COMPUTED-STATUS` | `core-rules.md` |
| P0 Rule #12 (Worktree) | `RULE-WORKTREE-DISCIPLINE` | `engineering-rules.md` |
| P0 Rule #16 (Migration tracking) | `RULE-MIGRATION-TRACKING` | `engineering-rules.md` |
| Compound Engineering ("The Boris Rule") | `RULE-COMPOUND-ENGINEERING` | `core-rules.md` |

**Do not add new rules to this file.** It exists only as a redirect for legacy references. A planned sed pass (MC task) will rewrite all 22 referencing files to use semantic IDs.

## New Constitution Layout

```
docs/constitution/
├── core-rules.md          ← foundational, immutable
├── engineering-rules.md   ← code, DB, git
├── agent-rules.md         ← agent behavior, tracking, MCP
├── frontend-rules.md      ← UI conventions
├── bible-protocol.md      ← knowledge base protocol
└── session-handoff.md     ← cross-session protocol
```
