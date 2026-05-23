# Spec: Shared Agent Memory — Supabase SSoT

> **Status:** draft (awaiting MC task creation)
> **Parent:** `8ee586b9` Brain initiative
> **Supersedes:** spec-brain-system.md §2 L0 + §5.3 + §6 (MemPalace deprecation was premature)
> **Priority:** critical
> **Author:** Tech-Lead, from CEO decision 2026-05-22

## 1. Problem

Agent knowledge is stored in three disconnected, lossy places:

| Layer | Problem |
|-------|---------|
| `~/.claude/projects/.../memory/` (Auto Memory) | Per-machine, per-user. Partner gets empty agent. |
| `agents/chef/kitchen-journal.md` (git) | Manual write. Agent forgets → knowledge lost (proven: frozen avocado incident). |
| Claude Projects memory (claude.ai) | Locked inside Anthropic's platform. Not exportable. Lost on migration. |

**Result:** CEO discussed frozen avocado sourcing with Chef. Chef didn't record it. Migration from Google Drive + Claude Projects to local repo + Claude Code lost the conversation. Partner connecting to Chef via admin panel would get zero context.

## 2. Requirement (CEO, verbatim)

> When a partner connects to Chef through the admin panel, Chef must be THE SAME Chef that lives here in CLI.

This means:
- **Shared** — all users see the same agent knowledge
- **Persistent** — survives session ends, machine switches, platform migrations  
- **Automatic** — agent MUST write, not "can if it remembers"
- **Queryable** — filtered recall, not "read entire file"

## 3. Solution: `agent_memory` table in Supabase

### 3.1 Schema

```sql
create table agent_memory (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,                    -- 'chef', 'finance', 'procurement', 'lawyer'
  memory_type text not null check (memory_type in (
    'decision',              -- CEO or agent ratified a choice
    'test_result',           -- kitchen test outcome
    'conversation_summary',  -- key points from a session
    'preference',            -- taste profile, process preference
    'idea',                  -- R&D idea, future exploration
    'correction'             -- CEO corrected agent behavior
  )),
  title text not null,                       -- short, searchable (e.g. "Frozen avocado for smoothies")
  content text not null,                     -- full text, markdown ok
  metadata jsonb default '{}',              -- structured data (ingredients, prices, test params)
  tags text[] default '{}',                 -- for filtered recall
  source text not null default 'agent',     -- 'ceo_conversation', 'kitchen_test', 'agent_inference'
  session_id text,                          -- which Claude session wrote this
  created_by text not null,                 -- 'lesya', 'partner_name', 'chef_agent'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for recall queries
create index idx_agent_memory_agent on agent_memory(agent_id);
create index idx_agent_memory_type on agent_memory(agent_id, memory_type);
create index idx_agent_memory_tags on agent_memory using gin(tags);
create index idx_agent_memory_search on agent_memory using gin(to_tsvector('english', title || ' ' || content));

-- RLS: authenticated users with admin role can read/write
alter table agent_memory enable row level security;
create policy "admin_full_access" on agent_memory
  for all using (auth.jwt() ->> 'role' = 'admin');
```

### 3.2 MCP Tools (add to each agent's MCP server)

| Tool | Input | Output | When |
|------|-------|--------|------|
| `store_memory` | agent_id, memory_type, title, content, tags[], metadata{} | id | After any decision, test, or significant discussion |
| `recall_memories` | agent_id, topic?, memory_type?, tags?, limit=10 | memory[] | Session start + any time agent needs context |
| `update_memory` | id, content?, tags?, metadata? | ok | When a decision is revised |

**`recall_memories` query strategy:**
```sql
-- Topic search uses full-text search
SELECT * FROM agent_memory
WHERE agent_id = $1
  AND ($2 IS NULL OR to_tsvector('english', title || ' ' || content) @@ plainto_tsquery($2))
  AND ($3 IS NULL OR memory_type = $3)
  AND ($4 IS NULL OR tags && $4)
ORDER BY created_at DESC
LIMIT $5;
```

### 3.3 Agent Startup Protocol (replaces file reads)

**Before (kitchen-journal.md):**
```
1. Read agents/chef/domain/chef-preferences.md     -- 2K tokens (static, git = ok)
2. Read last 30 lines of kitchen-journal.md         -- 1-3K tokens (growing, lossy)
```

**After (Supabase):**
```
1. Read agents/chef/domain/chef-preferences.md     -- 2K tokens (static, git = ok)
2. recall_memories(agent_id='chef', limit=15)       -- ~1.5K tokens (filtered, stable)
```

### 3.4 Mandatory Write Protocol

Agent workflows that MUST call `store_memory` before session end:

| Trigger | memory_type | Example |
|---------|------------|---------|
| CEO makes a decision | `decision` | "Use cane sugar instead of coconut sugar for porridge" |
| Kitchen test completed | `test_result` | "Hummus A/B test: version A (160g tahini) won on texture" |
| New R&D idea discussed | `idea` | "Frozen avocado for smoothie base — research sourcing" |
| CEO corrects agent | `correction` | "Shelf life max 48h not 5 days for rice — B. cereus risk" |
| Significant session context | `conversation_summary` | "Discussed porridge pudding concept — cold serving, RS3 marketing angle" |

**Enforcement:** Add to AGENT.md session-end checklist. Future: hook that blocks session close without at least one `store_memory` call if session had write operations.

## 4. Migration Plan

### 4.1 Kitchen Journal → agent_memory

Parse `agents/chef/kitchen-journal.md` (6 dated blocks) into INSERT statements:

| Date | Title | Type |
|------|-------|------|
| 2026-04-03 | Chef Agent launch + menu dev list | conversation_summary |
| 2026-04-05 | Hummus A/B test plan — tahini proportions debate | test_result |
| 2026-04-05 | Shish Tawook spice matrix — Fresh Edition blueprint | decision |
| 2026-04-05 | Yogurt: switch to homemade production | decision |
| 2026-05-18 | Porridge R&D: coconut rice + overnight oats + CEO food science corrections | test_result |
| 2026-05-18 | Manakeesh recipe flows + porridge pudding concept | decision |

### 4.2 Claude Projects extraction (CEO action required)

CEO must go to claude.ai → Shishka project → export conversation history before project dies. At minimum, search for:
- Frozen avocado discussion
- Any R&D sessions between 2026-05-18 and 2026-05-22
- Any decisions not reflected in kitchen-journal.md

### 4.3 Deprecation

After migration verified:
- `kitchen-journal.md` → add header: `<!-- DEPRECATED: agent memory now lives in Supabase agent_memory table. This file is archived. -->`
- `session-log.md` files → same treatment
- Update AGENT.md startup protocol to use `recall_memories`

## 5. Admin Panel Integration

```
/api/agent-memory
  GET  /api/agent-memory?agent=chef&topic=avocado    → recall
  POST /api/agent-memory                             → store (from admin chat)
  
Future: /chat page with agent selector
  → Chat with Chef in browser
  → Chef reads from same agent_memory
  → Chef writes to same agent_memory
  → Same agent, any client
```

## 6. Token Economics

| Metric | Git journal (6 months) | Supabase recall |
|--------|----------------------|-----------------|
| Session start cost | ~15-20K tokens (full file) | ~1.5K tokens (top 15 memories) |
| Topic lookup | Read all + search | SQL WHERE, ~500 tokens |
| Write cost | Edit file + git commit (~500 tok) | MCP call (~200 tok) |
| Annual scaling | Linear growth (unbounded) | Constant (limit parameter) |

**Estimated savings:** ~80% fewer tokens per session start after 6 months of use.

## 7. Relationship to spec-brain-system.md

This spec **amends** spec-brain-system.md:

| Section | Old | New |
|---------|-----|-----|
| §2 L0 | "Auto Memory — per-machine, Claude-private" | **L0 = Supabase `agent_memory`** — shared, queryable, persistent |
| §5.3 | "Auto Memory — Unchanged" | **Changed:** recall_memories replaces file reads |
| §6 | "MemPalace deprecated, session-diary covers need" | **Wrong.** session-diary is unreliable. agent_memory replaces both. |

## 8. Acceptance Criteria

- [ ] `agent_memory` table created via migration
- [ ] `store_memory` + `recall_memories` MCP tools work in Chef MCP
- [ ] Kitchen journal migrated (6 records)
- [ ] Chef AGENT.md startup uses `recall_memories` instead of journal read
- [ ] Admin panel can GET /api/agent-memory
- [ ] Partner connecting via admin sees Chef's full memory
- [ ] Claude Projects data extracted and imported (CEO-dependent)

## 9. Out of scope

- Vector/embedding search (v2 — when memory exceeds ~500 records)
- Auto-summarization of old memories
- Memory importance ranking
- Cross-agent memory sharing (each agent has own namespace for now)
