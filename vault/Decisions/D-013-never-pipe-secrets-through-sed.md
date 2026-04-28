---
title: D-013 — Never sed-redact potentially-secret command output
type: decision
id: D-013
tags: [decision, security]
date: 2026-04-08
status: ratified
decided_by: lesia
domain: Tech
supersedes: []
superseded_by: null
related:
  - "[[Domains/Secrets Management]]"
  - "[[Decisions/D-014-never-tail-secret-stderr]]"
aliases: []
---

# D-013 — Never sed-redact potentially-secret command output

> [!decision] Decided 2026-04-08 by lesia
> Never pipe secret-bearing output through `sed`/`awk`/`tr` for "redaction"; route to `/dev/null` or a `chmod 600` temp file instead.

## Context

During MemPalace Phase 2 setup, a debug command `security ... -w 2>&1 | sed 's/AGE-SECRET-KEY.*/REDACTED/'` printed the age private key as hex (Keychain encodes multi-line values in hex; sed didn't match). The full key landed in conversation context and the keypair had to be rotated.

## Decision

For commands that may touch a secret: route stdout to `/dev/null` for exit-code-only checks, use `mktemp` + `chmod 600` for files that must persist briefly, or use length/shape probes (`wc -c`, `head -c 20 | xxd`) for diagnostics. Never assume `sed` will catch what you expect.

## Rationale

The agent's streaming reader captures raw bytes before any pipe processes them. Even when `sed` matches, the unredacted buffer may already have been observed. The only safe pattern is "do not print".

## See Also

- [[Decisions/D-014-never-tail-secret-stderr]]
- [[Domains/Secrets Management]]
