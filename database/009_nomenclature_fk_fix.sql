-- Migration 009: Nomenclature Foreign Key Fix
-- Goal: Redirect constraints from legacy 'products' to 'nomenclature'.

-- 1. recipes_flow
ALTER TABLE public.recipes_flow DROP CONSTRAINT recipes_flow_product_code_fkey;
ALTER TABLE public.recipes_flow ADD CONSTRAINT recipes_flow_product_code_nomenclature_fkey 
    FOREIGN KEY (product_code) REFERENCES public.nomenclature(product_code);

-- 2. daily_plan
ALTER TABLE public.daily_plan DROP CONSTRAINT daily_plan_product_code_fkey;
ALTER TABLE public.daily_plan ADD CONSTRAINT daily_plan_product_code_nomenclature_fkey 
    FOREIGN KEY (product_code) REFERENCES public.nomenclature(product_code);

-- 3. production_tasks (if any other references exist)
-- [Assuming plan_id and flow_step_id already update to UUID in Migration 006]
