# Shishka Knowledge Base — INDEX

> **Purpose**: Routing manifest for the project bible. Agents load this file first,
> then read only the files relevant to their current task.
>
> **SSoT**: These files are the canonical source of business knowledge.
> Field notes (Supabase `field_notes`) are raw input; only CEO-approved content lands here.
>
> **Last updated**: 2026-04-05

## How to Use

1. Agent receives a task
2. Agent loads `docs/bible/INDEX.md` (this file)
3. Agent checks which bible files match its domain/task
4. Agent loads only those files
5. If agent discovers new knowledge → create `field_note` (NOT edit bible directly)

## Knowledge Map

| File | Domains | Agents | Load When |
|------|---------|--------|-----------|
| `identity.md` | all | all | Brand questions, investor materials, marketing, onboarding |
| `kitchen-philosophy.md` | kitchen | chef | **CORE — load every session.** Owner-authored. Red lines (incl. RBD seed/grain oils + animal-fat gate + Approved Fats Matrix), signature principles, quality equation, protocols (Clean Label, Lego, L1 Hub, Protein Sourcing Integrity) |
| `menu-concept.md` | kitchen, marketing | chef, marketing | Menu design, CBS application, new dish creation, food philosophy |
| `menu-items.md` | kitchen, procurement, sales | chef, procurement | Specific dishes, ingredients, BOM, procurement planning |
| `operations.md` | kitchen, ops | chef, ops | Production workflow, L1→L2 logistics, cold chain, staffing |
| `locations.md` | ops, strategy, finance | ops, finance | Location planning, rent, phases, physical layout |
| `equipment.md` | kitchen, ops, procurement | chef, ops | Equipment specs, zone mapping, maintenance, bottlenecks |
| `benchmarks.md` | strategy, marketing | marketing, strategy | Competitor analysis, market positioning, what to adopt/avoid |
| `targets.md` | finance, strategy | finance, strategy | Financial KPIs, food cost targets, margins, growth goals |
| `sources.md` | all | all | External resources, GDrive links, reference materials |

## Field Notes Protocol

Staff observations, CEO ideas, and agent discoveries flow through Supabase `field_notes` table:

```
field_note → morning triage (COO) → reviewed → applied to bible / MC task / dismissed
```

Types: `idea` | `problem` | `observation` | `decision`
Sources: `ceo` | `cook` | `admin` | `agent` | `partner`

## Change Log

| Date | File | Change | By |
|------|------|--------|----|
| 2026-04-05 | all | Initial creation from Notion SHISHKA CORE HUB export | CEO + COO |
| 2026-04-07 | kitchen-philosophy.md | Created from owner interview — replaces planned book RAG | CEO + COO |
| 2026-07-03 | kitchen-philosophy.md | Chef recalibration: rice-bran + all RBD seed/grain oils named banned; animal-fat gate; Approved Fats Matrix (deodorized-coconut exception); Protocol 4 Protein Sourcing Integrity | CEO directive |
| 2026-07-03 | (new) agents/chef/domain/knowledge/food-science.md, process-technology.md, sourcing-rules.md; docs/operations/sop-salmon-prep.md; sop-shrimp-prep.md into VCS | Chef recalibration — mechanism-organized culinary science foundation so the agent reasons from physics/chemistry, not per-product rules | CEO directive |
| 2026-07-03 | operations.md | Chef recalibration follow-up: added L2 Point-of-Sale equipment list + Equipment-by-Zone quick reference. Fixes "Infrastructural Blindness" — agent had put char/sear at L2 (no lava grill there); char is L1-only, L2 = Merrychef regen. New RULE-EQUIPMENT-REALITY. | CEO directive |
