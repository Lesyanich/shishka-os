-- Migration 006: UUID Compliance for Daily Plan and Recipes Flow
-- Goal: Convert integer IDs to UUID and update all Foreign Keys.

-- 1. Add temporary UUID columns
ALTER TABLE public.daily_plan ADD COLUMN id_uuid UUID DEFAULT gen_random_uuid();
ALTER TABLE public.recipes_flow ADD COLUMN id_uuid UUID DEFAULT gen_random_uuid();

-- 2. Add temporary columns to child table (production_tasks)
ALTER TABLE public.production_tasks ADD COLUMN plan_id_uuid UUID;
ALTER TABLE public.production_tasks ADD COLUMN flow_step_id_uuid UUID;

-- 3. Map existing integer references to new UUIDs
UPDATE public.production_tasks pt
SET plan_id_uuid = dp.id_uuid
FROM public.daily_plan dp
WHERE pt.plan_id = dp.id;

UPDATE public.production_tasks pt
SET flow_step_id_uuid = rf.id_uuid
FROM public.recipes_flow rf
WHERE pt.flow_step_id = rf.id;

-- 4. Rebuild Primary Keys and Foreign Keys
-- Drop old constraints
ALTER TABLE public.production_tasks DROP CONSTRAINT production_tasks_plan_id_fkey;
ALTER TABLE public.production_tasks DROP CONSTRAINT production_tasks_flow_step_id_fkey;

ALTER TABLE public.daily_plan DROP CONSTRAINT daily_plan_pkey CASCADE;
ALTER TABLE public.recipes_flow DROP CONSTRAINT recipes_flow_pkey CASCADE;

-- Set new Primary Keys
ALTER TABLE public.daily_plan ADD PRIMARY KEY (id_uuid);
ALTER TABLE public.recipes_flow ADD PRIMARY KEY (id_uuid);

-- Set new Foreign Keys in production_tasks
ALTER TABLE public.production_tasks ADD CONSTRAINT production_tasks_plan_uuid_fkey 
    FOREIGN KEY (plan_id_uuid) REFERENCES public.daily_plan(id_uuid);
ALTER TABLE public.production_tasks ADD CONSTRAINT production_tasks_flow_step_uuid_fkey 
    FOREIGN KEY (flow_step_id_uuid) REFERENCES public.recipes_flow(id_uuid);

-- 5. Cleanup
ALTER TABLE public.daily_plan DROP COLUMN id;
ALTER TABLE public.recipes_flow DROP COLUMN id;
ALTER TABLE public.production_tasks DROP COLUMN plan_id;
ALTER TABLE public.production_tasks DROP COLUMN flow_step_id;

-- Rename to final names
ALTER TABLE public.daily_plan RENAME COLUMN id_uuid TO id;
ALTER TABLE public.recipes_flow RENAME COLUMN id_uuid TO id;
ALTER TABLE public.production_tasks RENAME COLUMN plan_id_uuid TO plan_id;
ALTER TABLE public.production_tasks RENAME COLUMN flow_step_id_uuid TO flow_step_id;
