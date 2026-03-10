---
title: Agent Skills & Capabilities
tags:
  - skills
  - agent
  - tooling
  - skill-registry
  - shishka-os
date: 2026-03-10
status: active
aliases:
  - Skills Registry
  - Agent Tools
  - Skill Library
---

# Agent Skills & Capabilities

> [!info] Skill Library
> Comprehensive registry of all installed, available, and community skills for Claude Code. Updated as new skills are added.

## Installed Skills

### Obsidian Skills (kepano/obsidian-skills)

Skills for managing the Obsidian Vault knowledge base. Source: [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills).

| Skill | Status | Trigger | Use Case in Shishka OS |
|-------|--------|---------|----------------------|
| `obsidian-markdown` | Active | `.md` files, wikilinks, callouts, frontmatter | Architecture notes per [[Shishka OS Architecture\|Boris Rule #9]] |
| `obsidian-bases` | Active | `.base` files, table/card views, filters | Database-like views of nomenclature or tasks |
| `json-canvas` | Active | `.canvas` files, mind maps, flowcharts | System architecture & BOM relationship visualization |
| `obsidian-cli` | Active | Vault operations, search, plugin dev | Programmatic vault management from Claude Code |
| `defuddle` | Active | Web page URL extraction | Clean markdown extraction from docs, token-efficient |

### Anthropic Official Skills (anthropics/skills)

Document processing and development skills. Source: [anthropics/skills](https://github.com/anthropics/skills).

| Skill | Status | Trigger | Use Case in Shishka OS |
|-------|--------|---------|----------------------|
| `pdf` | Active | Any `.pdf` file operation | Parsing Thai supplier invoices, generating reports |
| `xlsx` | Active | Any spreadsheet file operation | Financial reports, cost analysis, inventory exports |
| `skill-creator` | Active | Creating/testing new skills | Building custom SOPs for Shishka OS workflows |
| `frontend-design` | Active | Build web UI, components, pages, dashboards | Premium UI for StagingArea, MagicDropzone, dashboards |

### MCP Servers

External tool servers connected via Model Context Protocol.

| Server | Status | Transport | Use Case |
|--------|--------|-----------|----------|
| `context7` | Active | stdio (`npx @upstash/context7-mcp`) | Fetch latest docs for Supabase, OpenAI, React, etc. |
| `Claude_in_Chrome` | Active | Built-in | Browser automation, testing, screenshot |
| `Claude_Preview` | Active | Built-in | Dev server preview, snapshot, inspect |
| `mcp-registry` | Active | Built-in | Search and connect external app connectors |
| `scheduled-tasks` | Active | Built-in | Scheduled task management |

### Custom Skills (Shishka OS)

Domain-specific skills built for Shishka Healthy Kitchen operations.

| Skill | Status | Trigger | Description |
|-------|--------|---------|-------------|
| `shishka-invoice-parser` | Active | "parse invoice", "nakladnaya", supplier PDF/image | Extracts items from supplier invoices, fuzzy-matches to `nomenclature`, generates `purchase_logs` SQL INSERTs |

> [!tip] How Invoice Parser Works
> 1. Read PDF/image invoice
> 2. Extract: Supplier Name, Date, Line Items (Name, Qty, Total Price)
> 3. Fuzzy match items to `RAW-*` / `PF-*` in `nomenclature` table
> 4. Generate ready-to-execute `INSERT INTO purchase_logs` statements
> 5. Auto-cost trigger updates `nomenclature.cost_per_unit` on insert

---

## Available Anthropic Skills (Not Yet Installed)

All 17 official skills from [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills). Skills marked "Installed" above are omitted.

| Skill | Description | Potential Use Case |
|-------|-------------|-------------------|
| `algorithmic-art` | Creates generative art via computational aesthetics in interactive p5.js sketches with seeded randomness | Menu visuals, brand art generation |
| `brand-guidelines` | Applies official brand identity (colors, typography, formatting) to artifacts | Shishka brand consistency across docs |
| `canvas-design` | Creates museum-quality visual art as PDF/PNG compositions with design manifesto | Marketing materials, menu cards |
| `claude-api` | Guides building LLM-powered apps using Claude API and Agent SDK | Future: autonomous kitchen agents |
| `doc-coauthoring` | Structured workflow for collaborative document creation (gather, refine, test) | SOP documents, training manuals |
| `docx` | Create, edit, analyze Word documents via programmatic generation or XML manipulation | Reports, contracts, official docs |
| `internal-comms` | Creates internal communications: 3P updates, newsletters, status reports | Team updates, investor reports |
| `mcp-builder` | Comprehensive guide for building MCP servers that connect LLMs to external services | Custom Supabase MCP, Syrve POS integration |
| `pptx` | Create, read, edit PowerPoint presentations with design guidance | Investor decks, team presentations |
| `slack-gif-creator` | Creates optimized animated GIFs for Slack with frame assembly and validation | Team communication visuals |
| `theme-factory` | Styling toolkit with 10 professional font/color themes for documents | Presentation and report theming |
| `web-artifacts-builder` | Build multi-component React apps bundled into single self-contained HTML files | Standalone dashboard exports |
| `webapp-testing` | Automated testing via Python Playwright: frontend verification, UI debugging, screenshots | End-to-end UI testing automation |

---

## Community Skills & Extensions

Notable community-built skills and tools that can extend agent capabilities.

| Skill / Tool | Source | Description | Status |
|-------------|--------|-------------|--------|
| `claude-mem` | Community | Persistent memory across sessions — stores facts, preferences, and context | Candidate |
| `code-review-agents` | Community | Automated PR review with multi-agent code audit | Candidate |
| `ralph-loop` | Community | Autonomous work loop — agent plans and executes without human intervention | Candidate |
| `GSD` (Get Stuff Done) | `~/.claude/hooks/` | Project management framework with phases, milestones, roadmaps, and verification | Installed (hooks) |

---

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
  frontend-design/       # Premium frontend UI design  (NEW - Phase 4.4)
  shishka-invoice-parser/ # Custom: supplier invoice SOP
```

## Future Skills Roadmap

| Planned Skill | Purpose | Phase |
|--------------|---------|-------|
| `shishka-cost-report` | Generate weekly food cost XLSX with margin analysis | Phase 6 (Finance) |
| `shishka-menu-card` | Generate printable PDF menu cards from SALE items | Phase 7 (Storefront) |
| `shishka-waste-report` | Weekly waste analytics XLSX grouped by reason + liability | Phase 6 (Finance) |

## Related

- [[Shishka OS Architecture]] -- System architecture overview
- [[Database Schema]] -- Full database schema reference
- [[Receipt Routing Architecture]] -- Hub & Spoke receipt routing (Phase 4.4)
- [[STATE]] -- Current deployment state
