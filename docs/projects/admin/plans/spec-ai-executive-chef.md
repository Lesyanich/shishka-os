---
title: AI Executive Chef — Architecture Design
date: 2026-04-14
status: draft
owner: tech-lead
initiative_mc: 0ee76594-c7d6-4790-bbe7-cafe3eea938d
source_commit: 22e0ffe
context: Exploration session with CEO. Defines how Chef Agent gets a UI in ERP (chat + smart actions + staff feedback).
---

> Recovered from exploration session commit 22e0ffe (14.04.2026). Canonical location.

# AI Executive Chef — Architecture

## Vision

Embed the existing Chef Agent (14 MCP tools, 8 workflows) into the Shishka ERP as an interactive AI assistant. Three interaction surfaces, one brain, all writes gated by owner approval.

## Architecture Overview

```
                         +------------------+
                         |   Claude API     |
                         |  (Anthropic)     |
                         +--------+---------+
                                  |
                          stream / tool_use
                                  |
                    +-------------+-------------+
                    |   Shishka API Layer        |
                    |   (Vercel Functions)       |
                    |                            |
                    |  POST /api/chef/chat       |  <-- chat messages
                    |  POST /api/chef/action     |  <-- smart button actions
                    |  POST /api/chef/feedback   |  <-- staff feedback
                    |  GET  /api/chef/queue      |  <-- pending approvals
                    |  POST /api/chef/approve    |  <-- owner approve/reject
                    |                            |
                    |  Middleware:               |
                    |  - Auth (role check)       |
                    |  - Token counter → api-costs|
                    |  - Rate limiter            |
                    +------+----------+---------+
                           |          |
              +------------+    +-----+--------+
              |                 |               |
        +-----+------+   +-----+------+  +----+-------+
        |  Supabase  |   | MCP Tools  |  | api-costs  |
        |  (DB/Auth) |   | (Chef 14)  |  | (token log)|
        +------------+   +------------+  +------------+
```

## Three Surfaces, One Brain

| Surface | Users | Entry Point | Features |
|---------|-------|-------------|----------|
| **ERP Chat** (Menu Control) | Lesia, Bas | Slide-out panel on /menu page | Full chat, smart actions, approval queue |
| **KDS Widget** (Kitchen) | Alex, Hein | Floating button on KDS page | Quick feedback, ask questions, report issues |
| **Claude Desktop** (existing) | Lesia | Terminal / Desktop app | Full power, dev/R&D mode — unchanged |

All surfaces hit the same `/api/chef/*` endpoints. Claude Desktop continues using MCP directly (no change needed).

## Interaction Protocols

### 1. Owner (Lesia / Bas) via ERP Chat

```
Owner types: "Create a new poke bowl with salmon and avocado"
     |
     v
API /api/chef/chat
     |
     v
Claude API (with system prompt = Chef Agent AGENT.md + tool definitions)
     |
     v
Agent asks: "What base? Rice, quinoa, or mixed greens?"
     |
     v  (conversation continues)
     |
Agent proposes: "Ready to create SALE-POKE_SALMON_AVOCADO with these ingredients..."
     |
     v
Shows CONFIRM button in chat UI
     |
     v
Owner clicks CONFIRM → API executes write tools → DB updated
```

### 2. Kitchen Staff (Alex / Hein) via KDS Widget

```
Cook presses "Chef AI" button on KDS
     |
     v
Opens mini-chat overlay (simplified UI)
     |
     v
Types in Thai/Burmese/Russian: "เกลือยี่ห้อนี้เค็มมาก ต้องลดลง 10%"
     |
     v
API /api/chef/feedback
     |
     v
Agent translates → classifies → creates feedback_queue entry:
  {
    original_text: "เกลือยี่ห้อนี้เค็มมาก ต้องลดลง 10%",
    translated: "This brand of salt is too strong, need to reduce by 10%",
    category: "ingredient_adjustment",
    affected_products: ["RAW-SALT_SEA_FINE"],
    proposed_change: "Reduce salt quantity by 10% in affected BOMs",
    impact: ["PF-BORSCH_BASE", "PF-HUMMUS_CLASSIC", ...],
    status: "pending_approval",
    submitted_by: "alex",
    submitted_at: "2026-04-14T14:30:00Z"
  }
     |
     v
Lesia sees in approval queue → approves/rejects with optional note
     |
     v
If approved → Agent executes BOM updates
```

### 3. Smart Action Buttons (Menu Control)

Located in OwnerTable dish rows and DishExpandedCard:

| Button | Action | Gate |
|--------|--------|------|
| "Generate Tech Card" | Calls agent to create recipes_flow for empty dish | Owner confirm |
| "Fill Nutrition" | Calculates KBJU cascade from BOM | Owner confirm |
| "Audit Dish" | Runs validate_bom + cost check | Read-only, no gate |
| "Suggest Price" | Runs suggest_price with target margin | Read-only, no gate |
| "Complete BOM" | Agent analyzes dish name and proposes full BOM | Owner confirm |

Smart actions send a structured prompt to `/api/chef/action`:
```json
{
  "action": "generate_tech_card",
  "dish_id": "uuid-...",
  "context": { "dish_name": "Borsch Bio-Active", "product_code": "SALE-BORSCH_BIOACTIVE" }
}
```

## Data Structures

### New Table: `chef_feedback_queue`

Stores staff feedback awaiting owner approval.

```sql
CREATE TABLE chef_feedback_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Source
  submitted_by TEXT NOT NULL,          -- staff name or user_id
  original_text TEXT NOT NULL,         -- raw input in any language
  original_lang TEXT,                  -- detected language code (th/my/ru/en/ar)
  translated_text TEXT NOT NULL,       -- English translation by agent
  -- Classification
  category TEXT NOT NULL,              -- ingredient_adjustment | process_change | equipment_issue | quality_report | general_question
  affected_product_ids UUID[],         -- nomenclature IDs affected
  proposed_change JSONB,               -- structured change proposal from agent
  impact_summary TEXT,                 -- human-readable impact description
  -- Approval
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | executed
  reviewed_by TEXT,                    -- lesia / bas
  reviewer_note TEXT,                  -- optional comment on approval/rejection
  reviewed_at TIMESTAMPTZ,
  -- Execution
  executed_at TIMESTAMPTZ,
  execution_log JSONB,                 -- what agent actually did after approval
  -- Meta
  source_surface TEXT NOT NULL,        -- kds | erp_chat | claude_desktop
  session_id TEXT,                     -- chat session for context
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: staff can INSERT, owners can SELECT/UPDATE, service_role bypasses
```

### New Table: `chef_chat_sessions`

Stores conversation history for context continuity.

```sql
CREATE TABLE chef_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,               -- who started the session
  surface TEXT NOT NULL,               -- erp_chat | kds_widget
  messages JSONB[] NOT NULL DEFAULT '{}',  -- [{role, content, tool_calls, timestamp}]
  context JSONB,                       -- {dish_id, page, active_filters...}
  status TEXT DEFAULT 'active',        -- active | closed
  token_count_in INT DEFAULT 0,
  token_count_out INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Token Tracking (api-costs integration)

Every API call logs to the existing api-costs endpoint:

```typescript
// Middleware in /api/chef/* routes
async function trackTokens(response: AnthropicResponse, session: ChatSession) {
  const usage = {
    model: response.model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
    surface: session.surface,       // erp_chat | kds_widget | action
    user_id: session.user_id,
    session_id: session.id,
    timestamp: new Date().toISOString()
  };
  
  // Log to api-costs endpoint
  await fetch('https://shishka-os.vercel.app/api-costs', {
    method: 'POST',
    body: JSON.stringify(usage)
  });
  
  // Update session totals
  await supabase.from('chef_chat_sessions')
    .update({
      token_count_in: session.token_count_in + usage.input_tokens,
      token_count_out: session.token_count_out + usage.output_tokens
    })
    .eq('id', session.id);
}
```

## System Prompt Architecture

The API layer constructs the Claude system prompt dynamically:

```
[Base] Chef AGENT.md (role, rules, workflows)
  +
[Context] Current page context (dish being viewed, active filters)
  +
[Tools] MCP tool definitions (14 chef tools as function schemas)
  +
[Memory] Recent MemPalace entries from wing_kitchen
  +
[Surface-specific]
  - ERP: full capabilities, write tools available
  - KDS: feedback-only mode, no direct write tools, simplified responses
```

### Role-Based Tool Access

| Role | Read Tools | Write Tools | Approve |
|------|-----------|-------------|---------|
| Owner (Lesia/Bas) | All 9 | All 5 (after confirm) | Yes |
| Staff (Alex/Hein) | search, get_bom_tree, check_inventory | None (feedback only) | No |

## Multilingual Strategy

```
Input (any language) → Claude detects language → processes in English
                                                      |
                                          +-----------+-----------+
                                          |                       |
                                    DB writes (EN)          UI response
                                                        (user's language)
```

- Claude natively handles Thai, Burmese, Russian, English, Arabic
- All DB fields: English only (RULE-LANGUAGE-CONTRACT)
- Chat responses: in the user's detected language
- Feedback queue: stores both original_text and translated_text

## Security Model

1. **Auth**: Supabase Auth — user must be authenticated
2. **Role check**: Middleware verifies role (owner vs staff) before routing
3. **Write gate**: All mutations require explicit CONFIRM action from owner role
4. **Rate limit**: Staff KDS widget limited to 20 messages/hour (prevent abuse)
5. **Content filter**: Agent system prompt includes instruction to flag inappropriate content
6. **Token budget**: Per-session and per-day limits configurable per role

## Tech Stack (no new frameworks)

| Component | Technology | Notes |
|-----------|-----------|-------|
| Chat UI | React 19 + Tailwind | Slide-out panel component |
| Streaming | Vercel AI SDK `useChat` | SSE streaming from API route |
| API routes | Vercel Functions (Node.js) | `/api/chef/*` endpoints |
| LLM | Claude API (Anthropic SDK) | With tool_use for MCP tools |
| Auth | Supabase Auth | Existing, role-based |
| DB | Supabase (PostgreSQL) | 2 new tables |
| Token tracking | shishka-os.vercel.app/api-costs | Existing endpoint |

## What This Is NOT

- **Not a separate deployed service** — lives inside existing Vercel app
- **Not a replacement for Claude Desktop** — CLI/Desktop remains for deep R&D
- **Not analytics** — no forecasting, trend analysis, or demand prediction (separate initiative)
- **Not autonomous** — never writes without owner approval
