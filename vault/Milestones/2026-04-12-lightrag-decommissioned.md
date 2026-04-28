---
title: 2026-04-12 — LightRAG decommissioned
type: milestone
tags:
  - milestone
  - decommission
  - tech
date: 2026-04-12
status: closed
kind: decommission
domain: "[[Domains/Admin Panel]]"
related:
  - "[[Projects/Shishka Brain v2]]"
  - "[[Projects/Graphify Pipeline]]"
  - "[[Open Questions/lightrag-supabase-cleanup]]"
aliases: []
---

# 2026-04-12 — LightRAG decommissioned

> [!success] Milestone
> LightRAG retired as live Shishka infrastructure; replaced end-to-end by Graphify.

## What Happened

GCP VM `shishka-production` was stopped on 2026-04-12 and the LightRAG service archived to `_archive/services/lightrag/`. Graphify took over the same corpus and now also covers code, images, and PDFs. Supabase `LIGHTRAG_*` tables were retained on a 30-day grace window for safety, not for reads.

## Drivers

Replacement was driven by [[Projects/Shishka Brain v2]] consolidating memory into Auto Memory + MemPalace + MC tasks + Graphify, removing the need for a separate retrieval VM (see `docs/plans/spec-shishka-brain.md` §2).

## Impact

- Code: LightRAG service code moved to `_archive/services/lightrag/`
- Process: agents must never reference LightRAG as live infra
- Data: `LIGHTRAG_*` Supabase tables held under 30-day grace, slated for cleanup
- People: removes a class of recurring CEO corrections about "live LightRAG"

## See Also

- Project: [[Projects/Graphify Pipeline]], [[Projects/Shishka Brain v2]]
- Domain: [[Domains/Admin Panel]]
- Open Questions: [[Open Questions/lightrag-supabase-cleanup]]
