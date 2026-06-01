-- 223: Salad bar — fix RLS so the admin panel can actually write
-- MC: ecb1eb05 (follow-up)
--
-- BUG: migration 218 gated INSERT/UPDATE/DELETE on salad_bar_slots behind
--   EXISTS (staff WHERE auth_user_id = auth.uid() AND role = 'owner')
-- but there is NO 'owner' role in staff (roles are admin/cashier/cook/…), so the
-- check could never pass — every write from the UI was silently dropped (0 rows,
-- no error). That's why deleting/moving/assigning pans "did nothing" in the app.
-- (We never noticed because migrations are applied via the CLI = service role,
-- which bypasses RLS.)
--
-- FIX: use the same convention as nomenclature et al. — any authenticated user
-- (the page is admin-gated) gets full access via fn_is_authenticated().

DROP POLICY IF EXISTS "Owner can update slots" ON public.salad_bar_slots;
DROP POLICY IF EXISTS "Owner can insert slots" ON public.salad_bar_slots;
DROP POLICY IF EXISTS "Owner can delete slots" ON public.salad_bar_slots;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'salad_bar_slots' AND policyname = 'salad_bar_slots_auth_full_access'
  ) THEN
    CREATE POLICY "salad_bar_slots_auth_full_access"
      ON public.salad_bar_slots
      FOR ALL
      TO authenticated
      USING (fn_is_authenticated())
      WITH CHECK (fn_is_authenticated());
  END IF;
END $$;

-- ─── Self-register ───────────────────────────────────────
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '223_salad_bar_rls_fix.sql',
  'claude-code',
  NULL,
  'Fix salad_bar_slots RLS: replace impossible role=owner write checks with fn_is_authenticated() full access (MC ecb1eb05)'
)
ON CONFLICT DO NOTHING;
