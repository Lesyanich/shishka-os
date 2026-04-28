---
title: When do we drop the LIGHTRAG_* Supabase tables retained for the 30-day grace window?
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
  - "[[Projects/Shishka Brain v2]]"
  - "[[Projects/Knowledge Vault Bootstrap]]"
aliases: []
---

# When do we drop the LIGHTRAG_* Supabase tables retained for the 30-day grace window?

> [!question] Open
> Drop the `LIGHTRAG_*` tables on the planned 2026-05-12 date, drop them now, or extend the grace window another 30 days?

## Context

LightRAG was decommissioned on 2026-04-12 (GCP VM `shishka-production` stopped, code archived to `_archive/services/lightrag/`). The Supabase `LIGHTRAG_*` tables were intentionally kept for a 30-day grace period in case cross-references surfaced — that window closes on 2026-05-12. No rollback to LightRAG is envisioned; the question is purely whether the buffer is still earning its keep.

## Why It Matters

Stale tables waste storage, clutter the schema, and risk an agent finding them and treating them as live infra (Lesia has corrected this confusion multiple times already — see `project_lightrag_removed.md`). Dropping too early is cheap if backups exist; dropping too late is mostly hygiene cost. The signal that matters is whether anything in production logs still touches those tables.

## Options Under Consideration

| Option | Pros | Cons |
|---|---|---|
| A — Drop on 2026-05-12 as planned | Honours the original commitment; matches the milestone note | Date-driven, not signal-driven; if a query slipped through, we find out via outage |
| B — Drop now | Saves ~2 weeks of storage and removes confusion surface immediately; archive folder is the rollback | Skips the agreed window; any dormant cross-reference fails sooner |
| C — Extend grace another 30 days | Maximally cautious; covers any monthly cron we forgot about | Schema clutter persists; risk of "tables still here, must be live" misreads keeps growing |

## Decision Pending On

- [[People/Lesia]] — owner of the call
- Signal: zero `LIGHTRAG_*` queries in Supabase production logs for the trailing 30 days

## See Also

- Milestone: [[Milestones/2026-04-12-lightrag-decommissioned]]
- Project: [[Projects/Shishka Brain v2]]
- Project: [[Projects/Knowledge Vault Bootstrap]]
- Domain: [[Domains/Admin Panel]]
- Related question: [[Open Questions/mempalace-fate]]
