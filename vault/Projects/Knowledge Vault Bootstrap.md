---
title: Knowledge Vault Bootstrap
type: project
tags: [project, knowledge, vault, brain]
date: 2026-04-28
status: active
domain: "[[Domains/Admin Panel]]"
mc_task: 1ad969ae-9d1f-4959-b8ab-4b02524da7a7
spec: docs/plans/spec-knowledge-vault-bootstrap.md
branch: feature/brain/knowledge-vault-bootstrap-phase2
pr_numbers: []
start: 2026-04-28
end: null
related:
  - "[[Decisions/D-005-db-and-mc-english-only]]"
aliases: [Vault Bootstrap]
---

# Knowledge Vault Bootstrap

> [!info] Project
> Turn `/brain/knowledge` from a code-and-docs map into a business-knowledge graph rendered from `vault/`.

## Objective

Replace the current file-graph view of `BrainKnowledgePage` with a concept graph: decisions, domains, projects, open questions, milestones, people. Build the ontology, import ~50 starter notes from Auto Memory and specs, then patch admin-panel categories so vault folders render with their own colors.

## Current State

- **Phase:** Phase 2 — massive import in progress
- **Owner:** [[People/Lesia]]
- **Spec:** `docs/plans/spec-knowledge-vault-bootstrap.md`
- **Branch:** `feature/brain/knowledge-vault-bootstrap-phase2`
- **PRs:** none yet

## Recent Outcomes

- 2026-04-28 — Phase 1 ontology and templates landed (`vault/_Templates/`, README, 6 folder taxonomy)
- 2026-04-28 — Phase 2 import map approved by CEO; first batch of project notes being written

## Risks & Open Questions

- Curation quality is the bottleneck, not the technical work — every note must be a distillate, not a memory dump
- Graphify rerun and admin-panel category extension still owed (Phase 3)

## See Also

- Spec: `docs/plans/spec-knowledge-vault-bootstrap.md`
- Domain: [[Domains/Admin Panel]]
- Related: [[Projects/Shishka Brain v2]], [[Projects/Graphify Pipeline]]
