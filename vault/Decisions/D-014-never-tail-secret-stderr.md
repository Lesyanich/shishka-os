---
title: D-014 — Never tail stderr of secret-handling commands
type: decision
id: D-014
tags: [decision, security]
date: 2026-04-15
status: ratified
decided_by: lesia
domain: Tech
supersedes: []
superseded_by: null
related:
  - "[[Domains/Secrets Management]]"
  - "[[Decisions/D-013-never-pipe-secrets-through-sed]]"
aliases: []
---

# D-014 — Never tail stderr of secret-handling commands

> [!decision] Decided 2026-04-15 by lesia
> When a CLI takes a secret via `--value <X>`, always silence stderr with `>/dev/null 2>&1`; never `2>&1 | tail`.

## Context

2026-04-15: `npx vercel env add ... --value "$KEY" 2>&1 | tail` echoed the live `ANTHROPIC_API_KEY` back in Vercel's validation error message. The key leaked into conversation context and had to be rotated across keychain, Vercel, and Supabase Edge Functions on the spot.

## Decision

For any secret passed as `--value <X>` or positional arg: route stderr to `/dev/null`, prefer stdin piping (`printf '%s' "$SECRET" | cmd`) when supported, and pass all required flags including `--yes` in the first call so the rejection-loop never echoes the value. Capture only success/fail via exit code.

## Rationale

CLIs routinely echo `--value <secret>` back in error messages. Combining stderr with stdout and tailing the result is a guaranteed leak path. Stdin-piped values do not appear in error output.

## See Also

- [[Decisions/D-013-never-pipe-secrets-through-sed]]
- [[Decisions/D-015-security-w-hex-decode]]
