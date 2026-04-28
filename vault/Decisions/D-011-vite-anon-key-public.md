---
title: D-011 — VITE_SUPABASE_ANON_KEY is public-by-design, not a secret
type: decision
id: D-011
tags: [decision, security]
date: 2026-04-07
status: ratified
decided_by: lesia
domain: Tech
supersedes: []
superseded_by: null
related:
  - "[[Domains/Secrets Management]]"
  - "[[Domains/Admin Panel]]"
aliases: []
---

# D-011 — VITE_SUPABASE_ANON_KEY is public-by-design, not a secret

> [!decision] Decided 2026-04-07 by lesia
> A committed `VITE_SUPABASE_ANON_KEY` is cosmetic untidiness, not a security incident. Protection lives in RLS, not in secrecy.

## Context

On 2026-04-07 COO over-escalated a committed `apps/admin-panel/.env` to "critical security incident" based on an Explore agent's assumption that the file held `DATABASE_URL`. The file actually held only `VITE_*` vars. CEO corrected the panic and the escalation had to be walked back.

## Decision

Treat `VITE_*` and `NEXT_PUBLIC_*` keys as public — Vite embeds them in the browser bundle at build time, every visitor can read them in DevTools. Real secrets that warrant escalation are `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` with password, and paid-API keys (OpenAI, Anthropic, Vercel). For frontend apps, the right action is an RLS audit, not file cleanup.

## Rationale

Rotating an anon key gives nothing — the key is already public via the bundle. Importing enterprise incident-response reflexes into a private single-user repo wastes time and credibility.

## See Also

- [[Domains/Secrets Management]]
- [[Decisions/D-012-verify-explore-output]]
