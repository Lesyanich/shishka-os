-- 455_staff_pin_owner_only_vault.sql
-- MC 8ee6783a. Spec: docs/plans/spec-staff-access-offboarding.md § 9
-- CEO 2026-10-09: "PIN в открытом виде быть не должен — он должен быть виден
-- только мне и Басу, никому другому".
--
-- THE LEAK. public.staff is SELECT-able by every logged-in user
-- (staff_read_auth = fn_is_authenticated). Two columns on it carried the PIN:
--   * pin_code — the PIN in plain text (Bas, Alex, Hein, Noe Noe);
--   * pin_hash — bcrypt of a 4-digit PIN. Only 10 000 candidates exist, so any
--     cook could brute-force it in seconds: it was the PIN in all but name.
-- fn_set_staff_pin (mig 454) still wrote pin_hash for every new login.
--
-- AFTER THIS MIGRATION
--   * The PIN lives only in Supabase Vault (encrypted at rest), as the secret
--     'staff_pin:<staff_id>', written by fn_set_staff_pin.
--   * fn_staff_pin_reveal(staff_id) returns it to an owner (Lesia, Bas) and
--     raises for anyone else. There is no other client path to it.
--   * pin_code / pin_hash are emptied and a CHECK keeps them empty; the columns
--     are dropped in a follow-up once the admin build that stops selecting
--     pin_code is live (dropping now would break useStaff on main).
--   * staff_role_credential_check required pin_hash for a cook with a login;
--     it becomes "a row with a login carries its login address".
--   * A deactivated or deleted row's PIN secret is deleted with its login.
--   * fn_set_staff_pin_hash (≥6-char, cook-only, wrote pin_hash; no callers) is
--     dropped — fn_set_staff_pin is the one way to set a PIN.
--
-- Service-role access (agents, cron) can still read Vault; that is the floor
-- for any secret an owner must be able to see again.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Empty the readable copies, then keep them empty.
--    Order: the old constraint demands pin_hash on cook logins, so it goes
--    first.
-- ---------------------------------------------------------------------------

ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_role_credential_check;

UPDATE public.staff
   SET pin_code = NULL,
       pin_hash = NULL
 WHERE pin_code IS NOT NULL OR pin_hash IS NOT NULL;

ALTER TABLE public.staff
  ADD CONSTRAINT staff_login_has_email
  CHECK (auth_user_id IS NULL OR email IS NOT NULL);

ALTER TABLE public.staff
  ADD CONSTRAINT staff_no_readable_pin
  CHECK (pin_code IS NULL AND pin_hash IS NULL);

DROP FUNCTION IF EXISTS public.fn_set_staff_pin_hash(uuid, text);

-- ---------------------------------------------------------------------------
-- 2. Vault storage. Internal: called only from fn_set_staff_pin.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_staff_pin_store(p_staff_id uuid, p_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := 'staff_pin:' || p_staff_id;
  v_id   uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = v_name;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_pin, v_name, 'Staff login PIN; owners read it via fn_staff_pin_reveal');
  ELSE
    PERFORM vault.update_secret(v_id, p_pin, v_name, 'Staff login PIN; owners read it via fn_staff_pin_reveal');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_staff_pin_store(uuid, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The only client path to a PIN: owners.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_staff_pin_reveal(p_staff_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pin text;
BEGIN
  IF NOT public.fn_is_owner() THEN
    RAISE EXCEPTION 'Only owners can see staff PINs'
      USING ERRCODE = '42501';
  END IF;

  SELECT decrypted_secret INTO v_pin
    FROM vault.decrypted_secrets
   WHERE name = 'staff_pin:' || p_staff_id;

  RETURN v_pin;  -- NULL: no PIN stored (no login yet, or set before mig 455)
END;
$$;

REVOKE ALL ON FUNCTION public.fn_staff_pin_reveal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_staff_pin_reveal(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. fn_set_staff_pin (mig 454): the PIN goes to Vault, not to staff.
--    Body otherwise unchanged.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_set_staff_pin(p_staff_id uuid, p_pin text, p_login text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name      text;
  v_app_role  text;
  v_is_active boolean;
  v_auth_uid  uuid;
  v_cur_email text;
  v_login     text;
  v_email     text;
  v_new_uid   uuid;
BEGIN
  IF NOT public.fn_is_owner() THEN
    RAISE EXCEPTION 'Only owners can set staff logins';
  END IF;

  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 4 digits';
  END IF;

  SELECT s.name, s.app_role, s.is_active, s.auth_user_id, u.email
    INTO v_name, v_app_role, v_is_active, v_auth_uid, v_cur_email
  FROM public.staff s
  LEFT JOIN auth.users u ON u.id = s.auth_user_id
  WHERE s.id = p_staff_id
  FOR UPDATE OF s;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff % not found', p_staff_id;
  END IF;

  IF NOT v_is_active THEN
    RAISE EXCEPTION '% is not active — a login would not let them in', v_name;
  END IF;

  IF v_app_role = 'owner' THEN
    RAISE EXCEPTION 'Owners sign in with email and password, not a PIN';
  END IF;

  -- Login = what the person types in the "Login" field; staffNameToEmail()
  -- (apps/admin-panel/src/lib/staffAuth.ts) turns it into this address.
  v_login := lower(coalesce(
    nullif(trim(p_login), ''),
    CASE WHEN v_cur_email LIKE '%@staff.shishka.local' THEN split_part(v_cur_email, '@', 1) END,
    regexp_replace(v_name, '[^a-zA-Z0-9]', '', 'g')
  ));

  IF v_login !~ '^[a-z0-9]{3,20}$' THEN
    RAISE EXCEPTION 'Login must be 3-20 Latin letters or digits, got "%"', v_login;
  END IF;
  v_email := v_login || '@staff.shishka.local';

  IF EXISTS (SELECT 1 FROM auth.users
              WHERE lower(email) = v_email AND id IS DISTINCT FROM v_auth_uid)
     OR EXISTS (SELECT 1 FROM public.staff
                 WHERE lower(email) = v_email AND id <> p_staff_id) THEN
    RAISE EXCEPTION 'Login "%" is already taken', v_login;
  END IF;

  IF v_auth_uid IS NULL THEN
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
          email        = v_email,
          pin_set_at   = now()
      WHERE id = p_staff_id;
  ELSE
    UPDATE auth.users
      SET email              = v_email,
          encrypted_password = extensions.crypt(p_pin, extensions.gen_salt('bf')),
          updated_at         = now()
      WHERE id = v_auth_uid;

    UPDATE auth.identities
      SET identity_data = identity_data || jsonb_build_object('email', v_email),
          updated_at    = now()
      WHERE user_id = v_auth_uid AND provider = 'email';

    UPDATE public.staff
      SET email      = v_email,
          pin_set_at = now()
      WHERE id = p_staff_id;

    -- A new PIN is usually set because the old one leaked: whoever holds a
    -- session on it must sign in again.
    PERFORM public.fn_staff_login_revoke_sessions(v_auth_uid);
  END IF;

  PERFORM public.fn_staff_pin_store(p_staff_id, p_pin);

  RETURN v_login;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. fn_staff_sync_login_access (mig 454): a deactivated or deleted row's PIN
--    secret goes with its login. Body otherwise unchanged.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_staff_sync_login_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A login no row points at any more belongs to nobody: ban it.
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND OLD.auth_user_id IS NOT NULL
     AND (TG_OP = 'DELETE' OR OLD.auth_user_id IS DISTINCT FROM NEW.auth_user_id)
     AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.auth_user_id = OLD.auth_user_id) THEN
    PERFORM public.fn_staff_login_set_allowed(OLD.auth_user_id, false);
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM vault.secrets WHERE name = 'staff_pin:' || OLD.id;
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT'
     OR OLD.is_active IS DISTINCT FROM NEW.is_active
     OR OLD.auth_user_id IS DISTINCT FROM NEW.auth_user_id THEN
    PERFORM public.fn_staff_login_set_allowed(NEW.auth_user_id, NEW.is_active);
  END IF;

  -- Runs on deactivation AND whenever fire_date moves on an inactive row, so a
  -- date recorded after the fact still clears the shifts it should.
  IF NOT NEW.is_active THEN
    UPDATE public.staff_schedule_templates
       SET is_active = false, updated_at = now()
     WHERE staff_id = NEW.id AND is_active;

    DELETE FROM public.shifts
     WHERE staff_id = NEW.id
       AND status = 'scheduled'
       AND shift_date > COALESCE(NEW.fire_date, public.fn_bkk_today());

    DELETE FROM vault.secrets WHERE name = 'staff_pin:' || NEW.id;
  END IF;

  RETURN NULL;
END;
$$;

-- The DELETE trigger used to fire only for rows with a login; a PIN secret can
-- only exist for those, so the WHEN clause stays.

-- ---------------------------------------------------------------------------
-- 6. fn_staff_login_status (mig 454) gains has_pin, so the UI knows whether
--    there is anything to reveal. Return type changes → drop + create.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fn_staff_login_status();

CREATE FUNCTION public.fn_staff_login_status()
RETURNS TABLE (staff_id uuid, login_email text, last_sign_in_at timestamptz, is_blocked boolean, has_pin boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id,
         u.email::text,
         u.last_sign_in_at,
         COALESCE(u.banned_until > now(), false),
         EXISTS (SELECT 1 FROM vault.secrets v WHERE v.name = 'staff_pin:' || s.id)
    FROM public.staff s
    JOIN auth.users u ON u.id = s.auth_user_id
   WHERE public.fn_is_owner();
$$;

REVOKE ALL ON FUNCTION public.fn_staff_login_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_staff_login_status() TO authenticated;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('455_staff_pin_owner_only_vault.sql', 'claude-opus-session-6d690fa1', 'success',
        'Staff PINs readable only by owners: pin_code (plain) and pin_hash (bcrypt of a 4-digit '
     || 'PIN = brute-forceable) emptied on staff, which every logged-in user can read; CHECK '
     || 'staff_no_readable_pin keeps them empty (columns dropped in a follow-up after the admin '
     || 'build stops selecting pin_code). PIN now stored in Supabase Vault as staff_pin:<id> by '
     || 'fn_set_staff_pin; owner-only fn_staff_pin_reveal(staff_id); secret deleted with the '
     || 'login on deactivation/delete; fn_staff_login_status gains has_pin. '
     || 'staff_role_credential_check → staff_login_has_email. fn_set_staff_pin_hash dropped. MC 8ee6783a.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- BEGIN;
-- ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_no_readable_pin;
-- ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_login_has_email;
-- -- staff_role_credential_check cannot come back as it was: cook logins no
-- -- longer carry pin_hash. Restore fn_set_staff_pin / fn_staff_sync_login_access
-- -- / fn_staff_login_status from migration 454.
-- DROP FUNCTION IF EXISTS public.fn_staff_pin_reveal(uuid);
-- DROP FUNCTION IF EXISTS public.fn_staff_pin_store(uuid, text);
-- DELETE FROM vault.secrets WHERE name LIKE 'staff_pin:%';
-- DELETE FROM public.migration_log WHERE filename='455_staff_pin_owner_only_vault.sql';
-- COMMIT;
