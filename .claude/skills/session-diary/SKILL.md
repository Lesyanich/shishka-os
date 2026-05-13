---
name: session-diary
description: "Auto-save session summary to native auto-memory before ending. Triggers: session end, end session, завершить сессию, save diary, /session-diary."
---

# Session Diary — AI Summary to Auto-Memory

You are writing a session diary entry. This captures the **rich context** that shell hooks cannot: decisions, reasoning, open questions, and what the next session should know.

## When to trigger

- User says: "end session", "завершить сессию", "save diary", "session end"
- Before closing a long productive session
- When switching context to a very different task

## Steps

1. **Reflect** on the current session. What happened? Consider:
   - Tasks worked on (check MC task IDs if available)
   - Key decisions made and WHY
   - Problems encountered and how they were resolved
   - Open questions or unfinished work
   - Anything the next session should know immediately

2. **Write the diary entry** to native auto-memory using the Write tool:

Save to the auto-memory directory as a session file:
```
~/.claude/projects/<project-key>/memory/session_<YYYY_MM_DD>_<topic>.md
```

3. **Format** the entry as structured text:

```
## Session Summary — YYYY-MM-DD

**Branch:** feature/...
**Tasks:** MC-XXX, MC-YYY

### What happened
- Built X for Y reason
- Fixed Z because ...

### Decisions
- Chose A over B because ...

### Open items
- Still need to ...
- Blocked on ...

### Context for next session
- Start by checking ...
```

4. **Update MEMORY.md** — add a line referencing the new session file in the memory index.

5. **Confirm** to the user that the diary was saved.

## Rules

- Write in **English** (storage language contract)
- Be **specific** — "implemented MenuPage with owner/customer toggle" not "worked on menu"
- Include **task IDs** from Mission Control when available
- Keep under 500 words — this is a summary, not a transcript
- Do NOT include secrets, passwords, or API keys
- Do NOT include raw code snippets — reference file paths instead
