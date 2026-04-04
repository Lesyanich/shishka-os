-- Migration 014: Admin Panel RLS for SSoT Control Center
-- Goal: allow full CRUD access from anon/public role for nomenclature and bom_structures
-- Scope: local SSoT Control Center only (do not use in production environments).

-- Ensure RLS is enabled
ALTER TABLE public.nomenclature ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_structures ENABLE ROW LEVEL SECURITY;

-- Optional: drop old policies if they exist and conflict.
-- These DROP commands are written as IF EXISTS to stay SAFE.
DROP POLICY IF EXISTS admin_panel_nomenclature_full_access ON public.nomenclature;
DROP POLICY IF EXISTS admin_panel_bom_structures_full_access ON public.bom_structures;

-- Grant full access for anon/public.
-- In Supabase, anon/service roles are members of the "public" role.

CREATE POLICY admin_panel_nomenclature_full_access
ON public.nomenclature
AS PERMISSIVE
FOR ALL
TO public
USING (true)
WITH CHECK (true);

CREATE POLICY admin_panel_bom_structures_full_access
ON public.bom_structures
AS PERMISSIVE
FOR ALL
TO public
USING (true)
WITH CHECK (true);

