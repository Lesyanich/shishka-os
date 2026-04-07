# Spec: Knowledge Hub — Admin Panel Bible UI

> **Initiative**: Knowledge System for Shishka OS
> **Priority**: High
> **Domain**: tech + strategy
> **Created**: 2026-04-05 by COO
> **Depends on**: field_notes table (spec-field-notes.md)

## Vision

Единый хаб знаний в админке Shishka OS, заменяющий Notion и Obsidian. CEO открывает одну страницу и видит всё: контент библии, заметки с полей, историю изменений, связи между знаниями. Агенты читают те же данные через MCP.

## Architecture

### Data Layer: Supabase as SSoT

```
bible_pages (SSoT)          field_notes (input)
     │                           │
     ├─── Admin Panel UI ────────┤
     │    (read/write/search)    │
     │                           │
     ├─── MCP get_bible_page ────┘
     │    (agents read)
     │
     └─── Git export (backup)
          docs/bible/*.md
```

### Why Supabase, not Git files
- RULE-SUPABASE-SSOT: "Supabase is the ONLY source of truth"
- Admin panel already uses Supabase for everything
- Full-text search via PostgreSQL `tsvector`
- field_notes + bible_pages in one DB = natural JOINs
- Versioning via `bible_page_history` table
- WYSIWYG editing directly in browser

### Git files become export
`docs/bible/*.md` continue to exist for:
- Agents working in Claude Code (fast local read)
- Partner access via repo
- Backup / offline access
- Sync: manual (COO runs export) or future scheduled task

---

## Database Schema

### Table: `bible_pages`

```sql
CREATE TABLE bible_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Identity
  slug TEXT UNIQUE NOT NULL,           -- 'identity', 'menu-concept', 'menu-items', etc.
  title TEXT NOT NULL,                 -- 'Brand Identity & Vision'
  icon TEXT,                           -- Emoji or icon name: '🎯', '🍽️', '⚙️'

  -- Content
  content TEXT NOT NULL,               -- Markdown content (body, without YAML frontmatter)

  -- Routing (replaces YAML frontmatter)
  domains TEXT[] NOT NULL DEFAULT '{}', -- ['kitchen', 'marketing']
  agents TEXT[] NOT NULL DEFAULT '{}',  -- ['chef', 'marketing']
  load_when TEXT,                       -- "menu design, CBS application, new dish creation"

  -- Metadata
  updated_by TEXT NOT NULL DEFAULT 'ceo', -- 'ceo', 'coo'
  source TEXT,                          -- 'Notion SHISHKA CORE HUB, Section 1'
  sort_order INT NOT NULL DEFAULT 0,    -- For sidebar ordering

  -- Search
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED
);

CREATE INDEX idx_bible_pages_slug ON bible_pages(slug);
CREATE INDEX idx_bible_pages_search ON bible_pages USING GIN(search_vector);
CREATE INDEX idx_bible_pages_domains ON bible_pages USING GIN(domains);
```

### Table: `bible_page_history` (versioning)

```sql
CREATE TABLE bible_page_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID NOT NULL REFERENCES bible_pages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Snapshot
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  change_summary TEXT               -- "Added matcha latte to beverages section"
);

-- Trigger: auto-snapshot on update
CREATE OR REPLACE FUNCTION fn_bible_page_history()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.content IS DISTINCT FROM NEW.content OR OLD.title IS DISTINCT FROM NEW.title THEN
    INSERT INTO bible_page_history (page_id, title, content, updated_by)
    VALUES (OLD.id, OLD.title, OLD.content, OLD.updated_by);
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bible_page_history
  BEFORE UPDATE ON bible_pages
  FOR EACH ROW EXECUTE FUNCTION fn_bible_page_history();
```

### Table: `field_notes` (from spec-field-notes.md)

Already specified. Key addition for Knowledge Hub:
```sql
-- Add bible_page_id FK (in addition to bible_file text)
ALTER TABLE field_notes ADD COLUMN bible_page_id UUID REFERENCES bible_pages(id);
```

### RLS

```sql
-- bible_pages: read for all authenticated, write for admin only
CREATE POLICY "read_bible" ON bible_pages FOR SELECT USING (true);
CREATE POLICY "write_bible" ON bible_pages FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- bible_page_history: read only
CREATE POLICY "read_history" ON bible_page_history FOR SELECT USING (true);
```

### Seed Data

Insert 9 rows from current `docs/bible/*.md` files:

```sql
INSERT INTO bible_pages (slug, title, icon, content, domains, agents, sort_order, source) VALUES
('identity',     'Brand Identity & Vision',         '🎯', '...content...', '{all}', '{all}', 1, 'Notion Section 1+7'),
('menu-concept', 'Menu Concept & Culinary Architecture', '🧪', '...', '{kitchen,marketing}', '{chef,marketing}', 2, 'Notion Section 2.1+2.3'),
('menu-items',   'Menu Items',                      '🍽️', '...', '{kitchen,procurement,sales}', '{chef,procurement}', 3, 'Notion Section 2.2'),
('operations',   'Operations — Production & Logistics', '⚙️', '...', '{kitchen,ops}', '{chef,ops}', 4, 'Notion Section 3.2'),
('locations',    'Locations & Phased Development',   '📍', '...', '{ops,strategy,finance}', '{ops,finance,strategy}', 5, 'Notion Section 3.1'),
('equipment',    'Equipment Registry',               '🔧', '...', '{kitchen,ops,procurement}', '{chef,ops}', 6, 'Notion Section 3.2'),
('benchmarks',   'Benchmarks — Competitor Analysis', '📊', '...', '{strategy,marketing}', '{marketing,strategy}', 7, 'Notion Section 4'),
('targets',      'Financial Targets & KPIs',         '💰', '...', '{finance,strategy}', '{finance,strategy}', 8, 'Notion extracted'),
('sources',      'External Sources & Resources',     '🔗', '...', '{all}', '{all}', 9, 'Notion Section 5.1');
```

---

## Admin Panel UI

### Navigation

```
Sidebar:
├── Dashboard
├── Kitchen
├── Finance
├── Procurement
├── Mission Control
├── 📖 Knowledge        ← NEW section
│   ├── Bible           ← main wiki view
│   ├── Field Notes     ← field_notes table
│   └── Search          ← full-text search
└── Settings
```

### Page 1: Bible (Wiki View)

**Route**: `/knowledge/bible` and `/knowledge/bible/:slug`

**Layout**: Two-panel (like Notion/Obsidian)

```
┌─────────────────────────────────────────────────────┐
│  📖 Knowledge Hub                        [🔍 Search]│
├──────────────┬──────────────────────────────────────┤
│              │                                      │
│  BIBLE       │  🎯 Brand Identity & Vision          │
│              │  ─────────────────────────────────   │
│  🎯 Identity │  Updated 2 hours ago by CEO          │
│  🧪 Menu     │                                      │
│    Concept   │  ## Project Name                     │
│  🍽️ Menu     │  **Shishka Eat Healthy**              │
│    Items     │                                      │
│  ⚙️ Ops      │  ## Slogan                           │
│  📍 Locations│  "Fresh as creation, alive           │
│  🔧 Equipment│   like the soul"                     │
│  📊 Benchm.  │                                      │
│  💰 Targets  │  ## Location                         │
│  🔗 Sources  │  Rawai, Phuket, Thailand             │
│              │  ...                                 │
│  ─────────── │                                      │
│  FIELD NOTES │  ─────────────────────────────────   │
│  💡 3 new    │  📝 Field Notes for this page (2)    │
│  ⚠️ 1 problem│  ├─ 💡 "Add matcha latte" — CEO     │
│              │  └─ 👁 "Halloumi sells well" — cook  │
│              │                                      │
│              │            [✏️ Edit] [📋 History]     │
└──────────────┴──────────────────────────────────────┘
```

**Left sidebar**:
- List of bible pages (icons + short titles)
- Sorted by `sort_order`
- Active page highlighted
- Field notes counter badge (new notes)
- Collapsible "Field Notes" section with summary

**Main content**:
- Rendered markdown (headers, tables, lists, code blocks, bold/italic)
- Table of Contents (auto-generated from ## headers) — sticky on right side
- Metadata bar: "Updated {relative time} by {author}" + domain badges
- Related field_notes panel at bottom
- Action buttons: Edit, History

### Page 2: Bible Editor

**Route**: `/knowledge/bible/:slug/edit`

**Editor**: Split-pane (markdown source | live preview)

```
┌──────────────────────┬──────────────────────────┐
│  ✏️ Editing: Identity│              [Save] [Cancel]
├──────────────────────┼──────────────────────────┤
│                      │                          │
│  # Brand Identity    │  Brand Identity           │
│                      │  ─────────────────       │
│  ## Project Name     │  Project Name             │
│  **Shishka Eat       │  Shishka Eat Healthy     │
│  Healthy**           │                          │
│                      │  ...                     │
│  ## Slogan           │                          │
│  "Fresh as creation, │                          │
│  alive like the soul"│                          │
│                      │                          │
│  ┌─ Toolbar ────────┐│                          │
│  │ B I # | — [] ""  ││                          │
│  └──────────────────┘│                          │
│                      │                          │
├──────────────────────┴──────────────────────────┤
│  Change summary: [Added matcha latte section   ]│
│  (required for save)                             │
└─────────────────────────────────────────────────┘
```

**Features**:
- Markdown editor with toolbar (bold, italic, headers, links, tables, lists)
- Live preview (right pane)
- Change summary required on save (→ `bible_page_history.change_summary`)
- Auto-save draft to localStorage every 30 seconds
- Keyboard shortcuts: Ctrl+S = save, Ctrl+B = bold, etc.

### Page 3: Field Notes

**Route**: `/knowledge/field-notes`

Already specified in `spec-field-notes.md`. Additions for Knowledge Hub:
- "Link to Bible" action now uses `bible_page_id` FK
- Clicking a bible link opens the page in wiki view

### Page 4: Search

**Route**: `/knowledge/search`

```
┌─────────────────────────────────────────────────────┐
│  🔍 [Search knowledge base...                     ] │
│     Filters: [All domains ▾] [Bible + Notes ▾]      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  📖 Menu Concept — "...Culinary Booster System      │
│     is a strategic Flavor LEGO framework..."        │
│     Score: 0.95 | Domain: kitchen                   │
│                                                     │
│  📖 Equipment — "...Blast Chiller is the            │
│     process bottleneck..."                          │
│     Score: 0.82 | Domain: kitchen, ops              │
│                                                     │
│  📝 Field Note — "Blast chiller overloaded          │
│     during lunch prep" — cook, 2 days ago           │
│     Score: 0.71 | Domain: kitchen                   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Features**:
- Full-text search across `bible_pages` + `field_notes`
- Domain filter
- Source filter (Bible pages / Field notes / Both)
- Highlighted search matches
- Click → opens page/note

---

## MCP Extension

### Tool: `get_bible_page` (for agents)

Add to `shishka-mission-control` or new `shishka-knowledge` MCP:

```typescript
// Input
{ slug: string }  // 'identity', 'menu-concept', etc.

// Output
{
  title: string,
  content: string,   // Full markdown
  domains: string[],
  updated_at: string,
  related_notes: Array<{ title: string, note_type: string, created_at: string }>
}
```

This replaces file reading for agents. Agent workflow becomes:
```
1. Read INDEX.md (still file-based, for routing)
2. get_bible_page('menu-concept') → fresh content from Supabase
```

### Tool: `search_bible` (for agents)

```typescript
// Input
{ query: string, domain?: string, limit?: number }

// Output
Array<{ slug: string, title: string, snippet: string, score: number }>
```

---

## Implementation Phases

### Phase 1: Database + Seed (1 session)
- [ ] Migration 092: `bible_pages` + `bible_page_history` + triggers + RLS + seed data
- [ ] Migration 093: `field_notes` (from spec-field-notes.md)
- [ ] Verify: all 9 pages seeded, search works, history trigger fires

### Phase 2: Read-only Wiki (1-2 sessions)
- [ ] Sidebar: Knowledge section with Bible, Field Notes, Search links
- [ ] Bible page: left sidebar (page list) + main content (markdown renderer)
- [ ] Markdown renderer: headers, tables, lists, code blocks, bold/italic, links
- [ ] Table of Contents (auto from headers)
- [ ] Domain badges, metadata bar (updated_at, updated_by)
- [ ] Route: `/knowledge/bible` → first page, `/knowledge/bible/:slug` → specific page

### Phase 3: Editor (1-2 sessions)
- [ ] Edit button → split-pane editor (source + preview)
- [ ] Markdown toolbar (bold, italic, headers, links, tables, lists)
- [ ] Change summary input (required)
- [ ] Save → update `bible_pages` (triggers history auto-snapshot)
- [ ] Cancel → discard changes
- [ ] History view: list of versions with diff view

### Phase 4: Field Notes + Search (1-2 sessions)
- [ ] Field Notes table page (per spec-field-notes.md)
- [ ] Quick Note input widget (floating + on bible page)
- [ ] Related field_notes panel on each bible page
- [ ] Full-text search page across bible + notes
- [ ] Domain and source filters

### Phase 5: MCP + Agent Integration (1 session)
- [ ] `get_bible_page` MCP tool
- [ ] `search_bible` MCP tool
- [ ] Update agent instructions to use MCP instead of file reads
- [ ] Git export script (optional: scheduled task to sync Supabase → docs/bible/*.md)

---

## Tech Stack (consistent with admin-panel)

- **Frontend**: React + TypeScript + Tailwind (existing stack)
- **Markdown**: `react-markdown` + `remark-gfm` (tables, strikethrough) + `rehype-highlight` (code)
- **Editor**: `@uiw/react-md-editor` or simple textarea + preview (lightweight)
- **Search**: PostgreSQL `tsvector` + `ts_rank` (no external search engine needed)
- **State**: React Query for data fetching (consistent with existing pages)

## UI Components (new)

| Component | Purpose |
|-----------|---------|
| `BibleSidebar` | Left panel: page list with icons, field_notes badge |
| `BiblePageView` | Markdown renderer + metadata + TOC + related notes |
| `BibleEditor` | Split-pane: source + preview + toolbar + change summary |
| `FieldNotesList` | Table with filters, actions, quick review |
| `FieldNoteInput` | Quick note form (floating widget) |
| `KnowledgeSearch` | Search page with filters and results |
| `MarkdownRenderer` | Shared: renders markdown to styled HTML |
| `PageHistory` | Version list with expandable diff |

---

## Migration from File-based Bible

After Knowledge Hub is deployed:
1. `docs/bible/*.md` files remain but marked as "export copies"
2. INDEX.md updated: add note "SSoT is now Supabase. Files are exports."
3. CLAUDE.md LK section: add `get_bible_page` MCP tool as primary method
4. Agent instructions: prefer MCP over file read
5. Git export: manual or scheduled sync from Supabase → files

---

## Success Criteria

- [ ] CEO can browse all 9 bible pages with beautiful markdown rendering
- [ ] CEO can edit any page inline, with mandatory change summary
- [ ] All changes versioned with rollback ability
- [ ] Full-text search finds content across bible and field notes
- [ ] Field notes from staff visible alongside relevant bible pages
- [ ] Agents can read bible via MCP (no file dependency)
- [ ] Search results highlight matching terms
- [ ] Mobile-responsive (CEO uses tablet/phone too)
