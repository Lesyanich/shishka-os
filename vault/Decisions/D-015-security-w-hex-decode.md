---
title: D-015 — macOS Keychain consumers must auto-detect and xxd-decode hex
type: decision
id: D-015
tags: [decision, security]
date: 2026-04-08
status: ratified
decided_by: lesia
domain: Tech
supersedes: []
superseded_by: null
related:
  - "[[Domains/Secrets Management]]"
  - "[[Projects/MemPalace]]"
aliases: []
---

# D-015 — macOS Keychain consumers must auto-detect and xxd-decode hex

> [!decision] Decided 2026-04-08 by lesia
> Any script reading multi-line content from macOS Keychain via `security -w` must auto-detect hex output and decode with `xxd -r -p`.

## Context

On macOS, `security find-generic-password -s "..." -w` emits the payload as a hex dump whenever the stored value contains any non-printable byte — newlines included. `age-keygen` output is multi-line, so naive `age -d -i <(security ... -w)` fails with "unknown identity type". Discovered building MemPalace backup/restore scripts.

## Decision

Use a shared helper: read the raw value, test if it matches `^[0-9a-fA-F]+$` with even length, and pipe through `xxd -r -p` if so. The 6-line `decode_keychain` function in `services/mempalace/restore.sh` is the canonical implementation. Prefer single-line content in Keychain when feasible.

## Rationale

Hex encoding is silent — there is no flag, no warning, just a different format consumers must handle. Centralising the decode in one helper keeps every Keychain consumer correct and avoids the same bug appearing in each new script.

## See Also

- [[Domains/Secrets Management]]
- [[Projects/MemPalace]]
