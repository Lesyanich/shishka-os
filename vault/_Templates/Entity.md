---
title: <Entity / Page Name>
type: entity
tags:
  - <entity-tag>      # menu | brand | recipes | equipment | procurement | finance | operations | database | tech
date: YYYY-MM-DD
status: active        # active | paused | deprecated
owners:
  - "[[People/<Name>]]"
related:
  - "[[<entity-folder>/<other page>]]"
assets:
  # Optional. Shows up as a "Where things live" panel in the admin Pages tab.
  # - label: "Logo files"
  #   path: "Drive: Brand/Logos/"
  #   url: "https://drive.google.com/..."
aliases: []
---

# <Entity / Page Name>

> [!info] One-line definition
> What this page describes in plain business language.

## Overview

Two to four paragraphs. What does this entity cover? Why does it matter? Who reads this page when?

## Key Concepts

- **Concept 1** — short definition
- **Concept 2** — short definition

## Sub-pages

If this is an entity-folder README, list child pages with one-line summaries:

- [[<folder>/<child page>]] — short summary
- [[<folder>/<child page>]] — short summary

## Where things live (Drive, code, DB)

If `assets:` frontmatter is set, a "Where things live" panel renders automatically in the admin Pages tab. Use it for:

- Drive folders (receipts, photos, contracts)
- Supabase tables / RPCs that back this entity
- Code paths (`apps/.../`, `services/.../`)

## Recent Decisions

- [[Decisions/D-NNN-...]] — one-line summary

## Open Questions

- [[Open Questions/<slug>]] — one-line summary

## See Also

- Adjacent entities: [[<other entity folder>]]
- Specs (if relevant): `docs/plans/spec-<name>.md`
