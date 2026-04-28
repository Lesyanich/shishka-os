---
title: Should MemPalace be wired into MCP, deprecated to git-diary, or deleted?
type: question
tags:
  - open-question
  - tech
date: 2026-04-28
status: open
raised_by: lesia
domain: "[[Domains/Admin Panel]]"
answered_on: null
answer_decision: null
related:
  - "[[Projects/MemPalace]]"
  - "[[Projects/Shishka Brain v2]]"
  - "[[Projects/Knowledge Vault Bootstrap]]"
aliases: []
---

# Should MemPalace be wired into MCP, deprecated to git-diary, or deleted?

> [!question] Open
> Does MemPalace earn its keep as a live MCP server for L1 conversation memory, or has Auto Memory + MC tasks + Graphify already absorbed its role?

## Context

MemPalace was Phase 2 of the Shishka Brain stack — the L1 layer for verbatim conversation snippets. The code exists in the repo, but the MCP server is currently **not wired** into `.mcp.json` (status: "MCP unwired" as of 2026-04-28). Meanwhile, Auto Memory (`~/.claude/projects/.../memory/`) covers durable facts, MC tasks cover action state, and Graphify covers the code graph. The question is whether MemPalace fills a real gap or duplicates what these three already provide.

## Why It Matters

Wiring it ties agents to another moving part with its own schema, drift risk, and maintenance cost. Deleting it loses the only path to per-session verbatim snippets — useful when "what exactly did Lesia say last Tuesday" matters. Choosing wrong means either ongoing dead-code rot or rebuilding the same thing in six months under a different name.

## Options Under Consideration

| Option | Pros | Cons |
|---|---|---|
| A — Wire MCP, agents read/write directly | Verbatim snippets become queryable; closes the L1 gap in the brain spec | Extra MCP server to maintain; another schema to drift; overlaps with Auto Memory in practice |
| B — Deprecate to git-diary-only | Zero infra; session-end summaries land in a markdown file under version control; readable by humans and agents | No structured query; verbatim recall becomes a `grep` problem |
| C — Delete entirely | Removes dead code; one less concept in the brain stack | Loses the L1 layer with no replacement; future "verbatim" need has to rebuild from scratch |

## Decision Pending On

- [[People/Lesia]] — owner of the call
- A real use case where Auto Memory + MC + Graphify visibly fall short — until that surfaces, wiring it is speculative

## See Also

- Project: [[Projects/MemPalace]]
- Project: [[Projects/Shishka Brain v2]]
- Project: [[Projects/Knowledge Vault Bootstrap]]
- Domain: [[Domains/Admin Panel]]
- Related question: [[Open Questions/lightrag-supabase-cleanup]]
