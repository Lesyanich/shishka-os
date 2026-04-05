# Spec: field_notes Table & UI

> **MC Task**: `11fd307b-f550-44e3-8c66-d5e1ad071ba2`
> **Priority**: Medium
> **Domain**: tech
> **Created**: 2026-04-05 by COO

## Purpose

Слой 2 Knowledge System — динамический вход для полевых наблюдений от поваров, администраторов, CEO и агентов. Данные проходят триаж COO и при необходимости попадают в библию (docs/bible/).

## Database Schema

### Table: `field_notes`

```sql
CREATE TABLE field_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Author
  author TEXT NOT NULL,               -- 'ceo', 'cook', 'admin', 'agent', 'partner'
  author_name TEXT,                    -- Human-readable: 'Леся', 'An', 'Chef Agent'

  -- Classification
  domain TEXT NOT NULL,                -- 'kitchen', 'procurement', 'finance', 'marketing', 'ops', 'sales', 'strategy'
  note_type TEXT NOT NULL DEFAULT 'observation',  -- 'idea', 'problem', 'observation', 'decision'

  -- Content
  title TEXT NOT NULL,                 -- Short summary (max 200 chars)
  content TEXT,                        -- Full details (optional for quick notes)

  -- Processing
  status TEXT NOT NULL DEFAULT 'new',  -- 'new', 'reviewed', 'applied', 'dismissed'
  reviewed_by TEXT,                    -- 'coo', 'ceo'
  reviewed_at TIMESTAMPTZ,

  -- Links (nullable)
  bible_file TEXT,                     -- Which docs/bible/*.md was updated (if applied)
  task_id UUID REFERENCES business_tasks(id),  -- MC task created from this note

  -- Metadata
  tags TEXT[] DEFAULT '{}',
  source TEXT DEFAULT 'manual'         -- 'manual', 'cowork', 'admin-panel', 'agent'
);

-- Indexes
CREATE INDEX idx_field_notes_status ON field_notes(status);
CREATE INDEX idx_field_notes_domain ON field_notes(domain);
CREATE INDEX idx_field_notes_created ON field_notes(created_at DESC);
```

### RLS Policies

```sql
-- Admins: full access
CREATE POLICY "admin_full_access" ON field_notes
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Authenticated users: insert only (cooks, admins via app)
CREATE POLICY "authenticated_insert" ON field_notes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Authenticated users: read own notes
CREATE POLICY "read_own_notes" ON field_notes
  FOR SELECT USING (author_name = auth.jwt() ->> 'name');

-- Service role: full access (for agents via MCP)
-- (service_role bypasses RLS by default)
```

## MCP Extension

Add to `shishka-mission-control` MCP server (or new `shishka-knowledge` MCP):

### Tool: `create_field_note`
```typescript
{
  title: string,          // required
  domain: string,         // required
  note_type: 'idea' | 'problem' | 'observation' | 'decision',
  content?: string,
  author: string,         // 'ceo', 'cook', 'admin', 'agent', 'partner'
  author_name?: string,
  tags?: string[]
}
```

### Tool: `list_field_notes`
```typescript
{
  status?: 'new' | 'reviewed' | 'applied' | 'dismissed',
  domain?: string,
  limit?: number          // default: 20
}
```

### Tool: `update_field_note`
```typescript
{
  note_id: string,        // UUID
  status?: string,
  reviewed_by?: string,
  bible_file?: string,
  task_id?: string
}
```

## Admin Panel UI

### Page: Knowledge > Field Notes

**Location**: `/knowledge/field-notes` (new section in sidebar)

**View**: Table with filters

| Column | Type | Filter |
|--------|------|--------|
| Status | Badge (new=blue, reviewed=yellow, applied=green, dismissed=gray) | Dropdown |
| Domain | Badge | Dropdown |
| Type | Icon (💡idea, ⚠️problem, 👁observation, ✅decision) | Dropdown |
| Title | Text (clickable → detail) | Search |
| Author | Text | Dropdown |
| Created | Relative time | Date range |
| Links | Icons (📖 bible, 📋 task) | - |

**Actions**:
- Click title → slide-over panel with full content
- Quick actions: Review → Applied/Dismissed
- "Link to Bible" → dropdown of docs/bible/*.md files
- "Create Task" → open MC task creation pre-filled from note

### Quick Input Widget

Small floating "+" button on any admin page → opens quick note form:
- Title (required)
- Domain (auto-suggest from current page context)
- Type (4 icon buttons)
- Content (optional, expandable textarea)
- Submit → creates field_note with author from session

## Integration with Morning Triage

COO morning-triage skill adds step:
```
4. list_field_notes(status: "new") → N новых заметок
   ├─ Group by domain → "Kitchen: 3 заметки, Finance: 1"
   ├─ Highlight problems (note_type: "problem")
   └─ Propose actions for CEO review
```

## Migration Number

Next available: **092** (after 091 business_tasks)

## Dependencies

- `business_tasks` table (FK for task_id)
- MCP Mission Control server (or new Knowledge MCP)
- Admin Panel sidebar navigation update

## Testing Checklist

- [ ] Create field_note via MCP
- [ ] List with filters (status, domain)
- [ ] Update status (new → reviewed → applied)
- [ ] Link to bible_file
- [ ] Link to business_task
- [ ] RLS: cook can insert, admin can read all, service_role full access
- [ ] Admin UI: table renders, filters work, quick actions work
- [ ] Quick input widget works from any page
