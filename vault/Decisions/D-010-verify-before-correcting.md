---
title: D-010 — Verify reality before correcting CEO on tech facts
type: decision
id: D-010
tags: [decision, ops]
date: 2026-04-07
status: ratified
decided_by: lesia
domain: Tech
supersedes: []
superseded_by: null
related:
  - "[[People/Lesia]]"
  - "[[Decisions/D-012-verify-explore-output]]"
aliases: []
---

# D-010 — Verify reality before correcting CEO on tech facts

> [!decision] Decided 2026-04-07 by lesia
> When CEO claims a tool, model, or version exists and Claude's training data disagrees, run the verification command first — never insist on stale memory.

## Context

2026-04-07: agent insisted "Gemma 4 doesn't exist, you mean Gemma 3n". CEO had to push back twice. `ollama list` showed `gemma4:e4b 9.6 GB` — released after the model's training cutoff. The pushback wasted CEO trust and tokens.

## Decision

On any tech version dispute, run the verification command (`ollama list`, `pip show X`, `which X`, `cat package.json`, WebSearch for releases) before objecting. If verification confirms CEO, say so plainly and fix the artifact. Never lead with "but according to my knowledge…".

## Rationale

Training cutoff is May 2025; sessions can be 6–18 months later, and 2025–2026 model and SDK releases may simply be unknown. Live system state always beats stale training data.

## See Also

- [[Decisions/D-012-verify-explore-output]]
- [[Decisions/D-019-verify-task-state-before-reporting]]
