-- 454_staff_access_follows_employment.sql
-- MC 8ee6783a. Spec: docs/plans/spec-staff-access-offboarding.md
-- CEO 2026-10-02: "оставить запись со статусом уволена и при получении такого
-- статуса лишать её всех доступов". CEO 2026-10-09: rehire = a new staff record;
-- owners choose a login + PIN themselves; Noe Noe left on 2026-09-08.
--
-- THE GAP. Deactivating a staff row only hid the person from pickers. Their
-- Supabase Auth login kept working, and ~89 public tables still accept writes
-- from any authenticated user (fn_is_authenticated), so a departed employee
-- kept broad DB access through the API. Their schedule template also kept
-- generating shifts.
--
-- THE INCIDENT. Mint left 2026-09-04 (mig 445). On 2026-10-02 her row af85ba68
-- was renamed "Nook", reactivated and pointed at a new login
-- nook@shishka.health, so Mint's payroll, attendance and shifts read as Nook's.
-- Mint's own login was orphaned but still signed in on 2026-09-29.
--
-- AFTER THIS MIGRATION
--   1. A login works only while its staff row is active. Deactivating a row
--      bans its auth user, deletes its sessions, turns off its schedule template
--      and removes planned shifts after the last working day. Reactivating
--      lifts the ban. A login detached from its row is banned.
--   2. A row whose fire_date has passed cannot be reactivated (rehire = new
--      row); the last active owner cannot be removed; a daily cron deactivates
--      rows whose fire_date has passed.
--   3. fn_set_staff_pin(staff, pin, login) lets an owner choose the login name;
--      it refuses inactive rows and owners.
--   4. fn_staff_login_status(): owner-only login overview for /hr/staff.
--   5. Data: row af85ba68 is Mint's again; Nuk + NeNe -> task_manager (no login
--      yet, the owner creates it in the UI); Noe Noe fired as of 2026-09-08;
--      logins of every inactive row banned.
--
-- An access token already issued stays valid until it expires (1 h); deleting
-- the sessions stops it from being refreshed.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Ban / unban one login. Internal: called only from the triggers below.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_staff_login_set_allowed(p_auth_user_id uuid, p_allowed boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_auth_user_id IS NULL THEN
    RETURN;
  END IF;

  IF p_allowed THEN
    UPDATE auth.users
       SET banned_until = NULL,
           updated_at   = now()
     WHERE id = p_auth_user_id
       AND banned_until IS NOT NULL;
  ELSE
    UPDATE auth.users
       SET banned_until = now() + interval '100 years',
           updated_at   = now()
     WHERE id = p_auth_user_id;
    -- refresh_tokens cascade from sessions; the second delete catches tokens
    -- issued before sessions existed.
    DELETE FROM auth.sessions       WHERE user_id = p_auth_user_id;
    DELETE FROM auth.refresh_tokens WHERE user_id = p_auth_user_id::text;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_staff_login_set_allowed(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. BEFORE trigger: a passed fire_date is final.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_staff_employment_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  v_left  date;
BEGIN
  -- fire_date is the last working day: access ends the day after. OLD counts
  -- too, so clearing the date in the same edit does not bring the row back.
  v_left := CASE
              WHEN NEW.fire_date < v_today THEN NEW.fire_date
              WHEN TG_OP = 'UPDATE' AND OLD.fire_date < v_today THEN OLD.fire_date
            END;

  IF NEW.is_active AND v_left IS NOT NULL THEN
    IF TG_OP = 'INSERT' OR NOT OLD.is_active THEN
      RAISE EXCEPTION '% left on % — a rehire gets a new staff record', NEW.name, v_left
        USING ERRCODE = '22023';
    END IF;
    NEW.is_active := false;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.app_role = 'owner' AND OLD.is_active
     AND (NOT NEW.is_active OR NEW.app_role <> 'owner')
     AND NOT EXISTS (
       SELECT 1 FROM public.staff s
        WHERE s.id <> NEW.id AND s.app_role = 'owner' AND s.is_active
     ) THEN
    RAISE EXCEPTION 'Cannot remove the last active owner'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_employment_guard ON public.staff;
CREATE TRIGGER trg_staff_employment_guard
  BEFORE INSERT OR UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.fn_staff_employment_guard();

-- ---------------------------------------------------------------------------
-- 3. AFTER triggers: login, schedule template and planned shifts follow the row.
--    Not `UPDATE OF is_active`: a column list ignores changes made by BEFORE
--    triggers, and the guard above flips is_active on its own.
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
    RETURN NULL;
  END IF;

  PERFORM public.fn_staff_login_set_allowed(NEW.auth_user_id, NEW.is_active);

  IF NOT NEW.is_active THEN
    UPDATE public.staff_schedule_templates
       SET is_active = false, updated_at = now()
     WHERE staff_id = NEW.id AND is_active;

    DELETE FROM public.shifts
     WHERE staff_id = NEW.id
       AND status = 'scheduled'
       AND shift_date > COALESCE(NEW.fire_date, (now() AT TIME ZONE 'Asia/Bangkok')::date);
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_staff_sync_login_access() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_staff_sync_login_access_ins ON public.staff;
CREATE TRIGGER trg_staff_sync_login_access_ins
  AFTER INSERT ON public.staff
  FOR EACH ROW WHEN (NEW.auth_user_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_staff_sync_login_access();

DROP TRIGGER IF EXISTS trg_staff_sync_login_access_upd ON public.staff;
CREATE TRIGGER trg_staff_sync_login_access_upd
  AFTER UPDATE ON public.staff
  FOR EACH ROW
  WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active
        OR OLD.auth_user_id IS DISTINCT FROM NEW.auth_user_id)
  EXECUTE FUNCTION public.fn_staff_sync_login_access();

DROP TRIGGER IF EXISTS trg_staff_sync_login_access_del ON public.staff;
CREATE TRIGGER trg_staff_sync_login_access_del
  AFTER DELETE ON public.staff
  FOR EACH ROW WHEN (OLD.auth_user_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_staff_sync_login_access();

-- ---------------------------------------------------------------------------
-- 4. fn_set_staff_pin (mig 314) gains a login name chosen by the owner.
--    No caller in code passes two args by position; PostgREST resolves by name.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fn_set_staff_pin(uuid, text);

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
  -- No login given: keep the current staff login, else derive it from the name.
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
              WHERE lower(email) = v_email AND id IS DISTINCT FROM v_auth_uid) THEN
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
          pin_hash     = extensions.crypt(p_pin, extensions.gen_salt('bf')),
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
          pin_hash   = extensions.crypt(p_pin, extensions.gen_salt('bf')),
          pin_set_at = now()
      WHERE id = p_staff_id;
  END IF;

  RETURN v_login;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_set_staff_pin(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_staff_pin(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Owner-only login overview for the /hr/staff access block.
--    auth.users is not readable from the client; non-owners get zero rows.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_staff_login_status()
RETURNS TABLE (staff_id uuid, login_email text, last_sign_in_at timestamptz, is_blocked boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id,
         u.email::text,
         u.last_sign_in_at,
         COALESCE(u.banned_until > now(), false)
    FROM public.staff s
    JOIN auth.users u ON u.id = s.auth_user_id
   WHERE public.fn_is_owner();
$$;

REVOKE ALL ON FUNCTION public.fn_staff_login_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_staff_login_status() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Data repair. Each statement is guarded so a replay is a no-op.
-- ---------------------------------------------------------------------------

-- 6a. The row is Mint's: her name, inactive, her own login re-linked. Clearing
--     the plaintext pin_code matters: staff is readable by every logged-in user.
--     nook@shishka.health (made by hand on 2026-10-02, never used, given to no
--     one) is detached here and the trigger bans it.
UPDATE public.staff
   SET name         = 'Mint',
       is_active    = false,
       auth_user_id = (SELECT id FROM auth.users WHERE email = 'mint@staff.shishka.local'),
       email        = 'mint@staff.shishka.local',
       pin_code     = NULL,
       pin_hash     = NULL,
       pin_set_at   = NULL
 WHERE id = 'af85ba68-763c-448f-8342-3a8a308dbfdb'
   AND name = 'Nook'
   AND fire_date = '2026-09-04';

-- 6b. Nuk and NeNe do receipts. No login yet: the owner creates one in /hr/staff.
UPDATE public.staff
   SET app_role = 'task_manager'
 WHERE id IN ('b4d9512d-c037-4a2a-98c6-97b79b3d72a3',   -- Nuk, hired 2026-09-03
              '15f13b0b-9b13-45e6-9c91-c9d39d72a0eb')   -- NeNe, hired 2026-08-07
   AND app_role = 'cook'
   AND is_active;

-- 6c. Noe Noe left on 2026-09-08 (CEO 2026-10-09). The trigger bans her login
--     and turns off her schedule template.
UPDATE public.staff
   SET fire_date = '2026-09-08',
       is_active = false
 WHERE id = 'b1fb72db-55b6-4afd-be85-be598a7c19ac'
   AND name = 'Noe Noe'
   AND fire_date IS NULL;

-- 6d. Backfill for rows that were already inactive (Alex, Hein): ban their
--     logins, turn off their templates.
SELECT public.fn_staff_login_set_allowed(auth_user_id, false)
  FROM public.staff
 WHERE NOT is_active
   AND auth_user_id IS NOT NULL;

UPDATE public.staff_schedule_templates t
   SET is_active = false, updated_at = now()
  FROM public.staff s
 WHERE s.id = t.staff_id AND NOT s.is_active AND t.is_active;

-- ---------------------------------------------------------------------------
-- 7. Daily at 00:05 Bangkok: rows whose last working day has passed go inactive.
-- ---------------------------------------------------------------------------

SELECT cron.unschedule('staff-fire-date-expiry')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'staff-fire-date-expiry');

SELECT cron.schedule(
  'staff-fire-date-expiry',
  '5 17 * * *',
  $cron$UPDATE public.staff SET is_active = false
         WHERE is_active AND fire_date < (now() AT TIME ZONE 'Asia/Bangkok')::date$cron$
);

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('454_staff_access_follows_employment.sql', 'claude-opus-session-6d690fa1', 'success',
        'A login works only while its staff row is active: deactivation (or a passed fire_date) '
     || 'bans the auth user, deletes its sessions, turns off its schedule template and removes '
     || 'planned shifts after the last working day; reactivation lifts the ban; a detached login is '
     || 'banned; a row with a passed fire_date cannot be reactivated (rehire = new row); last owner '
     || 'protected; daily cron staff-fire-date-expiry. fn_set_staff_pin(staff, pin, login) lets the '
     || 'owner choose the login. New owner-only fn_staff_login_status(). Data: row af85ba68 restored '
     || 'to Mint, Nuk + NeNe -> task_manager, Noe Noe fired 2026-09-08, logins of inactive rows '
     || 'banned. MC 8ee6783a.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- BEGIN;
-- SELECT cron.unschedule('staff-fire-date-expiry');
-- DROP TRIGGER IF EXISTS trg_staff_sync_login_access_ins ON public.staff;
-- DROP TRIGGER IF EXISTS trg_staff_sync_login_access_upd ON public.staff;
-- DROP TRIGGER IF EXISTS trg_staff_sync_login_access_del ON public.staff;
-- DROP TRIGGER IF EXISTS trg_staff_employment_guard ON public.staff;
-- DROP FUNCTION IF EXISTS public.fn_staff_sync_login_access();
-- DROP FUNCTION IF EXISTS public.fn_staff_employment_guard();
-- DROP FUNCTION IF EXISTS public.fn_staff_login_status();
-- DROP FUNCTION IF EXISTS public.fn_staff_login_set_allowed(uuid, boolean);
-- DROP FUNCTION IF EXISTS public.fn_set_staff_pin(uuid, text, text);
-- -- then restore fn_set_staff_pin(uuid, text) from migration 314.
-- -- Bans stay in auth.users.banned_until; lift one with UPDATE auth.users SET banned_until = NULL.
-- DELETE FROM public.migration_log WHERE filename='454_staff_access_follows_employment.sql';
-- COMMIT;
