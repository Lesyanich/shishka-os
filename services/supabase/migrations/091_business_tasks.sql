-- Migration 091: Business Tasks & Initiatives (Mission Control)
-- Purpose: Cross-domain task management for the entire business,
--          not just tech. Enables Mission Control UI + Dispatcher AI agent.

-- ============================================================
-- 1. Business Initiatives (cross-domain projects)
-- ============================================================
create table if not exists business_initiatives (
  id uuid primary key default gen_random_uuid(),

  title text not null,
  description text,

  status text not null default 'idea'
    check (status in ('idea', 'planning', 'active', 'completed', 'paused')),

  -- Which domains this initiative spans
  domains text[] not null default '{}',

  budget_thb numeric,
  deadline date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table business_initiatives is
  'Cross-domain business projects (e.g. seasonal menu launch, new location). Groups related tasks across departments.';

-- ============================================================
-- 2. Business Tasks (per-domain backlog items)
-- ============================================================
create table if not exists business_tasks (
  id uuid primary key default gen_random_uuid(),

  -- What
  title text not null,
  description text,

  -- Where (domain)
  domain text not null
    check (domain in (
      'kitchen', 'procurement', 'finance', 'marketing',
      'ops', 'sales', 'strategy', 'tech'
    )),

  -- Kanban status
  status text not null default 'inbox'
    check (status in (
      'inbox',        -- just captured, not triaged
      'backlog',      -- triaged, prioritized, waiting
      'in_progress',  -- actively being worked on
      'blocked',      -- waiting on another task/external
      'done',         -- completed
      'cancelled'     -- dropped
    )),

  -- Priority
  priority text not null default 'medium'
    check (priority in ('critical', 'high', 'medium', 'low')),

  -- Cross-domain links
  initiative_id uuid references business_initiatives(id) on delete set null,
  parent_task_id uuid references business_tasks(id) on delete set null,

  -- Context
  source text,         -- 'chef_idea', 'customer_review', 'agent_discovery', 'owner'
  created_by text,     -- 'lesia', 'finance-agent', 'chef-agent', 'dispatcher'
  assigned_to text,    -- 'lesia', 'chef', 'шеф-повар'

  -- Dates
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,

  -- Metadata
  tags text[] default '{}',
  related_ids jsonb default '{}',
  notes text
);

comment on table business_tasks is
  'Per-domain backlog items for Mission Control. Created by humans (UI) or AI agents (MCP). Kanban board in admin panel.';

-- ============================================================
-- 3. Indexes
-- ============================================================

-- Primary query: filter by domain + status (Mission Control page)
create index idx_business_tasks_domain_status
  on business_tasks (domain, status);

-- Kanban view: all tasks by status
create index idx_business_tasks_status
  on business_tasks (status)
  where status not in ('done', 'cancelled');

-- Initiative detail: tasks belonging to an initiative
create index idx_business_tasks_initiative
  on business_tasks (initiative_id)
  where initiative_id is not null;

-- Subtasks: children of a parent task
create index idx_business_tasks_parent
  on business_tasks (parent_task_id)
  where parent_task_id is not null;

-- Priority filter: critical/high tasks
create index idx_business_tasks_priority
  on business_tasks (priority)
  where priority in ('critical', 'high') and status not in ('done', 'cancelled');

-- Active initiatives
create index idx_business_initiatives_status
  on business_initiatives (status)
  where status not in ('completed', 'paused');

-- ============================================================
-- 4. Auto-update updated_at trigger
-- ============================================================
create or replace function fn_update_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Only create triggers if they don't exist
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_business_tasks_updated'
  ) then
    create trigger trg_business_tasks_updated
      before update on business_tasks
      for each row execute function fn_update_timestamp();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_business_initiatives_updated'
  ) then
    create trigger trg_business_initiatives_updated
      before update on business_initiatives
      for each row execute function fn_update_timestamp();
  end if;
end;
$$;

-- ============================================================
-- 5. Auto-set completed_at when status → done
-- ============================================================
create or replace function fn_task_completed_at()
returns trigger as $$
begin
  if new.status = 'done' and old.status != 'done' then
    new.completed_at = now();
  elsif new.status != 'done' then
    new.completed_at = null;
  end if;
  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_business_tasks_completed'
  ) then
    create trigger trg_business_tasks_completed
      before update on business_tasks
      for each row execute function fn_task_completed_at();
  end if;
end;
$$;

-- ============================================================
-- 6. RLS — admin full access (matches existing pattern)
-- ============================================================
alter table business_tasks enable row level security;
alter table business_initiatives enable row level security;

create policy "business_tasks_admin_full"
  on business_tasks for all
  using (current_setting('app.is_admin', true)::boolean = true)
  with check (current_setting('app.is_admin', true)::boolean = true);

create policy "business_initiatives_admin_full"
  on business_initiatives for all
  using (current_setting('app.is_admin', true)::boolean = true)
  with check (current_setting('app.is_admin', true)::boolean = true);
