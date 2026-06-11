-- FIX: menu_public must be SECURITY DEFINER (the visitor-site design — anon has
-- no SELECT grant on nomenclature). Mig 253 wrongly set security_invoker=true,
-- so once the brand build deployed (reading menu_public as anon) the site got
-- "permission denied for table nomenclature" and silently fell back to MOCK data
-- (verified live). Reverting to DEFINER restores the real menu + coming-soon.
-- The view exposes only customer-safe columns, consistent with v_public_menu /
-- menu_modifiers which are also DEFINER.
ALTER VIEW public.menu_public SET (security_invoker = false);

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES ('256_menu_public_security_definer_fix.sql', 'claude-code',
        'Revert menu_public to SECURITY DEFINER (undo mig 253 security_invoker=true that broke anon read → mock fallback).')
ON CONFLICT (filename) DO NOTHING;
