-- 314_lock_staff_writes_and_set_pin_rpc.sql
-- Admin-login security hardening — Fix A (part 1) + Fix B.
--
-- WHY: the `staff` table allowed ANY authenticated user to write it
-- (staff_write_auth USING auth.role() = 'authenticated'). Combined with the
-- client writing staff directly, a cook could run
--   UPDATE staff SET app_role = 'owner' WHERE auth_user_id = auth.uid()
-- via the public API and silently become an owner. RBAC was UI-only.
-- Separately, staff PINs were stored in cleartext (staff.pin_code) AND that
-- value WAS the Supabase Auth password — so any logged-in staffer could read
-- every colleague's PIN, and the StaffForm "PIN" field wrote pin_code WITHOUT
-- updating the real Auth password (the Mint/2222 drift).
--
-- THIS MIGRATION:
--   1) Locks staff WRITES to owners only (reads stay open so task_manager /
--      cook name-pickers keep working — useStaffList selects only id,name,role).
--   2) Adds fn_set_staff_pin(staff_id, pin): owner-only, SECURITY DEFINER RPC
--      that sets the real Supabase Auth password (bcrypt) and provisions the
--      auth user + identity if missing. This is the single, correct way to set
--      a staff PIN — replaces the broken plaintext StaffForm write and the
--      manual SQL. pin_code (plaintext) is dropped in a later migration after
--      the frontend stops referencing it.
--
-- SAFE: staff does NOT force row security (relforcerowsecurity = false), so
-- SECURITY DEFINER functions (fn_get_my_role, fn_set_staff_pin) and the
-- service_role / edge functions bypass RLS and keep working. The only app
-- writers to staff are owner-gated pages (SchedulePage / HR StaffPage).
--
-- MC task: 79f3e983-656a-48f9-8291-d9bc99754b6d

-- 1) Owner-only WRITES on staff (reads unchanged) -----------------------------
-- Drop the catch-all "any authenticated can do ALL" policy. The remaining
-- SELECT policies (staff_read_auth / staff_read_owner / staff_read_self_*) keep
-- read access for authenticated callers; the new FOR ALL owner policy only adds
-- a write path for owners (and, being permissive, never narrows SELECT).
DROP POLICY IF EXISTS staff_write_auth ON public.staff;

CREATE POLICY staff_write_owner_only
  ON public.staff
  FOR ALL
  TO public
  USING (public.fn_is_owner())
  WITH CHECK (public.fn_is_owner());

-- 2) Owner-only set-PIN RPC ---------------------------------------------------
-- Sets the Supabase Auth password (the actual login credential) to a 4-digit
-- PIN, provisioning the auth user + identity on first use. Mirrors the
-- client-side synthetic email rule: staffNameToEmail(name) ->
--   lower(strip non-alphanumerics) || '@staff.shishka.local'
CREATE OR REPLACE FUNCTION public.fn_set_staff_pin(
  p_staff_id uuid,
  p_pin text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text;
  v_app_role text;
  v_auth_uid uuid;
  v_email text;
  v_new_uid uuid;
BEGIN
  -- owner-only
  IF NOT public.fn_is_owner() THEN
    RAISE EXCEPTION 'Only owners can set staff PINs';
  END IF;

  -- PIN must be exactly 4 digits
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 4 digits';
  END IF;

  SELECT name, app_role, auth_user_id
    INTO v_name, v_app_role, v_auth_uid
  FROM public.staff
  WHERE id = p_staff_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff % not found', p_staff_id;
  END IF;

  v_email := lower(regexp_replace(v_name, '[^a-zA-Z0-9]', '', 'g')) || '@staff.shishka.local';

  -- NOTE: pgcrypto lives in the `extensions` schema, so crypt()/gen_salt() are
  -- schema-qualified — search_path is pinned to 'public' for safety and would
  -- not otherwise resolve them inside this SECURITY DEFINER function.
  IF v_auth_uid IS NULL THEN
    -- Provision a fresh Supabase Auth user + email identity, then link it.
    v_new_uid := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) VALUES (
      v_new_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_email, extensions.crypt(p_pin, extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('role_hint', v_app_role),
      '', '', '', ''
    );

    INSERT INTO auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_new_uid::text, v_new_uid,
      jsonb_build_object('sub', v_new_uid::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now()
    );

    UPDATE public.staff
      SET auth_user_id = v_new_uid,
          email = COALESCE(email, v_email),
          pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf'))
      WHERE id = p_staff_id;
  ELSE
    -- Update the existing Auth password (the real login gate).
    UPDATE auth.users
      SET encrypted_password = extensions.crypt(p_pin, extensions.gen_salt('bf')),
          updated_at = now()
      WHERE id = v_auth_uid;

    UPDATE public.staff
      SET pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf'))
      WHERE id = p_staff_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_set_staff_pin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_staff_pin(uuid, text) TO authenticated;

-- 3) Self-register in the migration ledger (NULL checksum by convention). -----
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '314_lock_staff_writes_and_set_pin_rpc.sql',
  'claude-code',
  NULL,
  'Lock staff writes to fn_is_owner() (kills cook->owner self-escalation); add owner-only fn_set_staff_pin RPC that sets the real Supabase Auth password + provisions auth user (task 79f3e983)'
)
ON CONFLICT DO NOTHING;
