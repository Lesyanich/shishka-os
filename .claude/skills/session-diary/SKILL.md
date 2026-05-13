---
name: session-diary
description: "Auto-save session summary to MemPalace before ending. Triggers: session end, end session, завершить сессию, save diary, /session-diary."
---

# Session Diary — AI Summary to MemPalace

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

2. **Write the diary entry** using the MemPalace MCP tool:

```
mcp__shishka-mempalace__mempalace_diary_write(
  agent_name: "claude-code",
  entry: "<your summary>",
  topic: "session-summary"
)
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

4. **Confirm** to the user that the diary was saved.

## Rules

- Write in **English** (storage language contract)
- Be **specific** — "implemented MenuPage with owner/customer toggle" not "worked on menu"
- Include **task IDs** from Mission Control when available
- Keep under 500 words — this is a summary, not a transcript
- Do NOT include secrets, passwords, or API keys
- Do NOT include raw code snippets — reference file paths instead
