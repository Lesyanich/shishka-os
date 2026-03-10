---
title: Agent Skills & Capabilities
tags:
  - skills
  - agent
  - tooling
  - phase-5-4
date: 2026-03-10
status: active
aliases:
  - Skills Registry
  - Agent Tools
---

# Agent Skills & Capabilities

> [!info] Phase 5.4
> Installed during [[Shishka OS Architecture|Phase 5.4]] to extend agent operational capabilities for document processing, knowledge management, and custom SOP automation.

## Obsidian Skills (kepano/obsidian-skills)

Skills for managing the Obsidian Vault knowledge base. Installed from [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills).

| Skill | Trigger | Use Case in Shishka OS |
|-------|---------|----------------------|
| `obsidian-markdown` | `.md` files, wikilinks, callouts, frontmatter | Creating architecture notes per [[Shishka OS Architecture\|Boris Rule #9]] |
| `obsidian-bases` | `.base` files, table/card views, filters | Future: tracking nomenclature or tasks as Obsidian databases |
| `json-canvas` | `.canvas` files, mind maps, flowcharts | Visualizing system architecture and BOM relationships |
| `obsidian-cli` | Vault operations, search, plugin dev | Programmatic vault management from Claude Code |
| `defuddle` | Web page extraction | Clean markdown extraction from docs, reducing token usage |

## Anthropic Skills (anthropics/skills)

Core document processing skills from [anthropics/skills](https://github.com/anthropics/skills).

| Skill | Trigger | Use Case in Shishka OS |
|-------|---------|----------------------|
| `pdf` | Any `.pdf` file operation | Parsing Thai supplier invoices, generating reports |
| `xlsx` | Any spreadsheet file operation | Financial reports, cost analysis, inventory exports |
| `skill-creator` | Creating/testing new skills | Building custom SOPs for Shishka OS workflows |

## Custom Skills (Shishka OS)

Domain-specific skills built for Shishka Healthy Kitchen operations.

| Skill | Trigger | Description |
|-------|---------|-------------|
| `shishka-invoice-parser` | "parse invoice", "nakladnaya", supplier PDF/image | Extracts items from supplier invoices, fuzzy-matches to `nomenclature`, generates `purchase_logs` SQL INSERTs |

> [!tip] How Invoice Parser Works
> 1. Read PDF/image invoice
> 2. Extract: Supplier Name, Date, Line Items (Name, Qty, Total Price)
> 3. Fuzzy match items to `RAW-*` / `PF-*` in `nomenclature` table
> 4. Generate ready-to-execute `INSERT INTO purchase_logs` statements
> 5. Auto-cost trigger updates `nomenclature.cost_per_unit` on insert

## File Structure

```
.claude/skills/
  obsidian-markdown/     # Obsidian Flavored Markdown
  obsidian-bases/        # Database-like views
  json-canvas/           # Visual canvas files
  obsidian-cli/          # CLI vault operations
  defuddle/              # Web content extraction
  pdf/                   # PDF processing
  xlsx/                  # Spreadsheet processing
  skill-creator/         # Skill development toolkit
  shishka-invoice-parser/ # Custom: supplier invoice SOP
```

## Future Skills Roadmap

| Planned Skill | Purpose | Phase |
|--------------|---------|-------|
| `shishka-cost-report` | Generate weekly food cost XLSX with margin analysis | Phase 6 (Finance) |
| `shishka-menu-card` | Generate printable PDF menu cards from SALE items | Phase 7 (Storefront) |
| `shishka-waste-report` | Weekly waste analytics XLSX grouped by reason + liability | Phase 6 (Finance) |

## Related

- [[Shishka OS Architecture]] — System architecture overview
- [[STATE]] — Current deployment state
