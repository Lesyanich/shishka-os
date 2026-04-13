-- Migration 126: Add role-based access to staff table (ERP-1)
-- Adds auth_user_id (FK to auth.users) and app_role (owner/cook) columns.
-- Cleans fake seed data (Noi/Som/Lek), deactivates fired Pa.
-- Inserts real staff: Lesia (owner), Alex (cook), Hein (cook).
-- Creates fn_get_my_role() RPC for login-time role resolution.

BEGIN;

-- 1. Add auth linkage column
ALTER TABLE staff ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id);

-- 2. Add app_role for ERP access control
--    'owner' = full ERP access (Lesia, Bas)
--    'cook'  = kitchen-only view (Alex, Hein, shared kitchen tablet)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'app_role'
  ) THEN
    ALTER TABLE staff ADD COLUMN app_role TEXT NOT NULL DEFAULT 'cook';
    ALTER TABLE staff ADD CONSTRAINT staff_app_role_check CHECK (app_role IN ('owner', 'cook'));
  END IF;
END $$;

-- 3. Delete fake seed data (Noi, Som, Lek — never existed, AI hallucination)
--    ON DELETE CASCADE in shifts FK will clean up related shift/task rows
DELETE FROM staff WHERE name IN ('Noi', 'Som', 'Lek');

-- 4. Deactivate fired staff member Pa (real person, fired 2026-04-06)
UPDATE staff SET is_active = false WHERE name = 'Pa';

-- 5. Set Bas as owner
UPDATE staff SET app_role = 'owner' WHERE name = 'Bas' AND role = 'sous_chef';

-- 6. Insert Lesia as owner
INSERT INTO staff (name, role, app_role, is_active)
VALUES ('Lesia', 'admin', 'owner', true)
ON CONFLICT DO NOTHING;

-- 7. Insert real kitchen staff (Alex, Hein)
--    auth_user_id will be linked AFTER Supabase Auth accounts are created via Dashboard
INSERT INTO staff (name, role, app_role, is_active)
VALUES
  ('Alex', 'cook', 'cook', true),
  ('Hein', 'cook', 'cook', true)
ON CONFLICT DO NOTHING;

-- 8. RPC for role resolution (called on login by RoleContext)
CREATE OR REPLACE FUNCTION fn_get_my_role()
RETURNS TABLE(staff_id UUID, staff_name TEXT, app_role TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT id, name, app_role
  FROM staff
  WHERE auth_user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

-- 9. Self-register
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '126_staff_auth_role.sql',
  'claude-code',
  NULL,
  'Add auth_user_id + app_role to staff. Clean fake Noi/Som/Lek. Deactivate Pa. Insert Lesia/Alex/Hein. RPC fn_get_my_role. (ERP-1, MC dfe939a4)'
)
ON CONFLICT DO NOTHING;

COMMIT;
