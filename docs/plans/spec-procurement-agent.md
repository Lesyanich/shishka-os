# Spec: Procurement Analyst Agent v1

> MC Task: 14b5bd82-38e4-4c3c-8dd2-90e888e7f927
> Status: Draft
> Author: tech-lead
> Date: 2026-04-24

## 1. Problem

Procurement research sessions (equipment sourcing, supplier comparison, ingredient selection) produce valuable findings that evaporate when the session ends. The CEO must re-explain context every time. No agent owns the procurement domain — strategy orchestrator handles it as a side job, lacking the depth needed for engineering specs, supplier intelligence, and purchase criteria.

## 2. Solution — Procurement Analyst Agent v1

A dedicated domain agent (`/procurement`) that:
1. Owns procurement knowledge (suppliers, equipment criteria, purchase history)
2. Accumulates intelligence across sessions via MemPalace
3. Produces structured session summaries (comparison tables, recommendations) as MC task comments

### 2.1 What v1 does NOT do

- No inventory tracking (v2)
- No automated purchase planning (v3)
- No new MCP server — uses existing tools
- No new DB tables or migrations

## 3. Architecture

### 3.1 Files to create

| File | Purpose |
|------|---------|
| `agents/procurement/AGENT.md` | Agent identity, workflow, autonomy model |
| `agents/procurement/domain/supplier-intelligence.md` | Accumulated supplier knowledge (seed with known suppliers) |
| `agents/procurement/domain/equipment-criteria.md` | Engineering constraints: Thailand 220V/50Hz, tropical humidity, kitchen dimensions, Merrychef compatibility |
| `agents/procurement/domain/procurement-checklist.md` | Universal procurement checklist (price, delivery, warranty, compatibility, alternatives) |
| `agents/procurement/session-log.md` | Tier 2 session log (empty, append-only) |
| `.claude/skills/procurement/SKILL.md` | Slash command `/procurement` loader |
| Update: `docs/constitution/agent-routing.md` | Add `/procurement` row to slash commands table + free text routing |

### 3.2 MCP Scope

| MCP Server | Access | Tools used |
|------------|--------|------------|
| `shishka-mission-control` | RW (domain=procurement) | `list_tasks`, `get_task`, `update_task`, `add_comment`, `emit_business_task` |
| `shishka-finance` | Read-only | `search_suppliers`, `search_expenses`, `expense_summary` — price history, supplier data |
| `shishka-chef` | Read-only | `search_products`, `list_equipment` — kitchen needs, existing equipment |
| `shishka-mempalace` | RW (wing_procurement) | `mempalace_kg_query`, `mempalace_kg_add`, `mempalace_search`, `mempalace_diary_write` |

### 3.3 MemPalace Integration

Wing: `wing_procurement`, Room: `suppliers`, `equipment`, `decisions`

What gets stored:
- Supplier rulings: "Makro Phuket has X but not Y", "Lazada delivery 3-5 days to Rawai"
- Equipment decisions: "dough sheeter — chose model X because of Y"
- Price benchmarks: "RAW_SALMON avg 450 THB/kg at Makro as of 2026-04"
- Negative knowledge: "Supplier Z doesn't deliver to Phuket", "Model A incompatible with our voltage"

### 3.4 Web Search

The agent should use `WebSearch` and `WebFetch` for:
- Equipment specs and reviews
- Supplier websites (Lazada, Shopee, AliExpress for equipment)
- Price comparison across platforms
- Technical specifications verification

## 4. Agent Workflow

### 4.1 Session Start
1. Read `docs/constitution/core-rules.md`
2. Read `agents/procurement/AGENT.md`
3. MemPalace wake-up: `mempalace_status` + `mempalace_kg_query(entity="procurement", wing="wing_procurement")`
4. `list_tasks(status="in_progress", domain="procurement")` — continue unfinished
5. `list_tasks(status="inbox", domain="procurement")` — pending procurement tasks
6. Report: "{N} procurement tasks, {M} in inbox. Ready."

### 4.2 Research Workflow (core v1 loop)
1. Pick up procurement task (equipment search, supplier comparison, ingredient sourcing)
2. Load domain files (equipment-criteria.md, supplier-intelligence.md)
3. Check MemPalace for prior knowledge on the topic
4. Research: web search, finance history, chef needs
5. Build comparison table (structured markdown)
6. Write recommendation with pros/cons
7. Post as MC task comment on the relevant task
8. Update MemPalace with key findings
9. Update domain files if new permanent knowledge discovered

### 4.3 Session Summary Format

```markdown
## Procurement Research: {topic}

### Comparison Table
| Criteria | Option A | Option B | Option C |
|----------|----------|----------|----------|
| Price | ... | ... | ... |
| Delivery | ... | ... | ... |
| Specs | ... | ... | ... |
| Warranty | ... | ... | ... |
| Compatibility | ... | ... | ... |

### Recommendation
**Winner:** Option B
**Why:** {1-2 sentences}
**Risks:** {known risks}
**Next step:** {what CEO needs to decide/do}
```

## 5. Autonomy Model

| Operation | Permission |
|-----------|-----------|
| Read (MC tasks, finance suppliers, chef products, web search) | Free |
| MemPalace write (wing_procurement) | Free |
| MC comment with research summary | Free |
| Update domain files (supplier-intelligence, equipment-criteria) | Free |
| Create new MC task (discovered need) | Show to CEO first |
| Recommend a purchase decision | **STOP — present comparison, wait for CEO decision** |

Key principle: **the agent researches and recommends, never decides to buy.**

## 6. Domain Knowledge Seeds

### 6.1 Equipment Criteria (initial)
- Location: Phuket, Rawai, Thailand
- Power: 220V / 50Hz (Thai standard)
- Climate: tropical humidity, 30-35C ambient — stainless steel preferred, no mild steel
- Kitchen size: compact — countertop/table-top equipment preferred
- Existing key equipment: Merrychef e1s (speed oven), sous vide, blast chiller
- Certifications: CE or equivalent, Thai FDA (อย.) for food-contact

### 6.2 Known Suppliers (initial seed)
- **Makro** (Phuket) — bulk ingredients, some equipment
- **Lazada / Shopee** — equipment, small tools, delivery to Rawai
- **AliExpress** — equipment (longer delivery, check voltage compatibility)
- **Local Phuket suppliers** — fresh produce, seafood (to be discovered)

### 6.3 Procurement Checklist (initial)
1. Price (incl. shipping to Rawai)
2. Delivery time
3. Voltage/power compatibility (220V/50Hz)
4. Physical dimensions (fits kitchen?)
5. Material (stainless steel preferred for tropics)
6. Warranty & service availability in Thailand
7. Reviews / references
8. Alternatives considered (min 2)
9. Total cost of ownership (consumables, maintenance)

## 7. Integration with Other Agents

| Agent | Interaction |
|-------|------------|
| Strategy (orchestrator) | Receives high-level procurement initiatives; reports back research results |
| Chef | Reads kitchen needs (what ingredients/equipment needed); does NOT modify recipes |
| Finance | Reads supplier history and expense data; does NOT write expenses |
| Tech-Lead | Receives tech decomposition for procurement-related features (v2+) |

## 8. Future Phases (out of scope for v1)

- **v2:** Inventory tracking — consumption rates from `production_log`, reorder alerts
- **v3:** Auto-generated purchase plans based on menu schedule and inventory levels
- **v4:** Supplier auto-negotiation / price tracking over time
