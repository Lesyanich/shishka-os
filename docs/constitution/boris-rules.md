# [DEPRECATED] boris-rules.md

> **Deprecated 2026-04-07, retargeted 2026-05-04 (WS-3 of 75e735e5).**
>
> The "Boris Rules" name was legacy with no remaining meaning. All rules migrated to semantic IDs.

## Migration Map (current locations)

| Legacy ID | Semantic ID | Current Location |
|---|---|---|
| Boris Rule #8 (BOM filtering) | `RULE-BOM-PREFIX-FILTER` | `technical-rules.md` § Part I |
| Boris Rule #9 (Obsidian protocol) | `RULE-ARCH-NOTE-SYNC` | `technical-rules.md` § Part I |
| Boris Rule #10 (DB schema docs) | `RULE-DB-SCHEMA-DOCS` | `technical-rules.md` § Part I |
| Boris Rule #11 (Commit gate) | `RULE-COMMIT-GATE` | `technical-rules.md` § Part I |
| Boris Rule #12 (Txn date) | `RULE-TXN-DATE-INTEGRITY` | `technical-rules.md` § Part I |
| Boris Rule #13 (Edge fn / async LLM) | `RULE-ASYNC-LLM-PATTERN` | `technical-rules.md` § Part I |
| Boris Rule #13 (Task closure) | `RULE-TASK-CLOSURE` | `operational-rules.md` § Part II |
| Boris Rule #14 (Spec binding) | `RULE-SPEC-MC-BINDING` | `operational-rules.md` § Part II |
| Boris Rule #15 (MCP identity) | `RULE-MCP-IDENTITY` | `operational-rules.md` § Part II |
| Boris Rule #17 (Scoped context) | `RULE-SCOPED-CONTEXT` | `operational-rules.md` § Part II |
| P0 Rule #1 (Supabase SSoT) | `RULE-SUPABASE-SSOT` | `operational-rules.md` § Part I |
| P0 Rule #2 (UUID) | `RULE-UUID-COMPLIANCE` | `operational-rules.md` § Part I |
| P0 Rule #3 (Lego BOM) | `RULE-LEGO-ARCHITECTURE` | `operational-rules.md` § Part I |
| P0 Rule #4 (No direct DB edits) | `RULE-NO-DIRECT-DB-EDITS` | `operational-rules.md` § Part I |
| P0 Rule #5 (State management) | `RULE-COMPUTED-STATUS` | `operational-rules.md` § Part I |
| P0 Rule #12 (Worktree) | `RULE-WORKTREE-DISCIPLINE` | `technical-rules.md` § Part I |
| P0 Rule #16 (Migration tracking) | `RULE-MIGRATION-TRACKING` | `technical-rules.md` § Part I |
| Compound Engineering ("The Boris Rule") | `RULE-COMPOUND-ENGINEERING` | `operational-rules.md` § Part I |

## Current Constitution Layout (post-WS-3)

```
docs/constitution/
├── operational-rules.md      ← MAIN: core + agent + routing + bible + sessions
├── technical-rules.md        ← code, DB, git, frontend
└── *.md (deprecated stubs)   ← redirects only, do not edit
```

**Do not add new rules to this file.**
