---
title: Secrets Management
type: domain
tags:
  - domain
  - secrets
  - security
date: 2026-04-28
status: active
owners:
  - "[[People/Lesia]]"
bounded_context: How Shishka stores, retrieves, and pipes secret credentials — keys, DB URLs, tokens — without ever exposing them in chat or repos.
related:
  - "[[Domains/Admin Panel]]"
  - "[[Domains/Finance]]"
aliases:
  - Secrets
  - Credentials
---

# Secrets Management

> [!info] Domain
> macOS Keychain is the single source of truth for every Shishka secret — agents retrieve, never ask, and never leak.

## Definition

All Shishka API keys and connection strings live in the macOS Keychain under the `shishka-*` service-name convention (`shishka-anthropic-api-key`, `shishka-openai-api-key`, `shishka-database-url`, `shishka-google-api-key`). Agents retrieve via `security find-generic-password -s "<name>" -w` and pipe directly to the consumer (Vercel CLI, psql) — never echoed, never tailed, never sed-redacted.

## Boundaries

Inside: keychain registry, retrieval patterns, safe-piping conventions, hex-decode for multi-line payloads. Outside: what the secrets unlock — the deployed admin panel ([[Domains/Admin Panel]]), the receipt pipeline ([[Domains/Finance]]), and Supabase RLS itself (the actual security boundary, not the anon key).

## Active Projects

- [[Projects/Multi-Agent Coordination v2]] — session IDs and claim gates rely on safe secret retrieval

## Recent Decisions

- [[Decisions/D-011-vite-anon-key-public]] — VITE_SUPABASE_ANON_KEY ships in the bundle, not a secret
- [[Decisions/D-013-never-pipe-secrets-through-sed]] — sed-redaction is forbidden, route to /dev/null
- [[Decisions/D-014-never-tail-secret-stderr]] — `2>&1 | tail` on secret-handling commands leaks secrets
- [[Decisions/D-015-security-w-hex-decode]] — `security -w` emits hex for multi-line; auto-decode with xxd

## See Also

- Architecture: [[Architecture/Shishka OS Architecture]]
- Reference: macOS Keychain entries `shishka-anthropic-api-key`, `shishka-openai-api-key`, `shishka-database-url`, `shishka-google-api-key`
