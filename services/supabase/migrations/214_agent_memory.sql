-- Agent Memory: shared persistent memory for all Shishka agents
-- Spec: docs/plans/spec-shared-agent-memory.md

create table agent_memory (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  memory_type text not null check (memory_type in (
    'decision',
    'test_result',
    'conversation_summary',
    'preference',
    'idea',
    'correction'
  )),
  title text not null,
  content text not null,
  metadata jsonb default '{}',
  tags text[] default '{}',
  source text not null default 'agent',
  session_id text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for recall queries
create index idx_agent_memory_agent on agent_memory(agent_id);
create index idx_agent_memory_type on agent_memory(agent_id, memory_type);
create index idx_agent_memory_tags on agent_memory using gin(tags);
create index idx_agent_memory_search on agent_memory using gin(
  to_tsvector('english', title || ' ' || content)
);

-- RLS: service_role (MCP servers) has full access; authenticated admins can read/write
alter table agent_memory enable row level security;

create policy "service_role_full_access" on agent_memory
  for all using (auth.role() = 'service_role');

create policy "admin_full_access" on agent_memory
  for all using (auth.jwt() ->> 'role' = 'admin');

-- Auto-update updated_at on modification
create or replace function update_agent_memory_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_agent_memory_updated_at
  before update on agent_memory
  for each row execute function update_agent_memory_timestamp();

-- Self-register in migration log
INSERT INTO migration_log (filename, applied_by, description)
VALUES (
    '214_agent_memory.sql',
    'claude-code',
    'Shared agent memory table with FTS index, GIN tags, RLS, and updated_at trigger. Spec: spec-shared-agent-memory.md'
) ON CONFLICT (filename) DO NOTHING;
