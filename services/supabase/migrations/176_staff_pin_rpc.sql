-- ============================================================
-- Migration 176: fn_set_staff_pin_hash — owner-only PIN hashing RPC
--
-- Spec:   MC 6e4b56bf comment #2 (deliverable #4)
-- MC:     6e4b56bf-3a9a-4125-b03a-0b7b1a7107a4
--
-- Required because PostgREST does not expose pgcrypto.crypt()/gen_salt()
-- directly. Edge Function staff-set-pin invokes this RPC with the caller's
-- JWT context, the function gates on fn_is_owner(), then stores the
-- bcrypt hash so plaintext PIN never crosses an Edge → DB boundary as
-- a UPDATE column value.
--
-- The actual auth credential lives in auth.users (managed by the
-- Supabase Auth admin API); staff.pin_hash is the audit copy that lets
-- /hr/staff render "🔢 PIN-only / last rotated 3d ago".
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_set_staff_pin_hash(
  p_staff_id UUID,
  p_pin      TEXT
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_target  public.staff;
  v_now     TIMESTAMPTZ := now();
BEGIN
  IF NOT public.fn_is_owner() THEN
    RAISE EXCEPTION 'permission denied: owner role required'
      USING ERRCODE = '42501';
  END IF;

  IF p_pin IS NULL OR length(p_pin) < 6 THEN
    RAISE EXCEPTION 'pin must be at least 6 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target
  FROM public.staff
  WHERE id = p_staff_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'staff % not found', p_staff_id
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_target.is_active THEN
    RAISE EXCEPTION 'staff is inactive'
      USING ERRCODE = '22023';
  END IF;
  IF v_target.app_role <> 'cook' THEN
    RAISE EXCEPTION 'PIN is for cook-tier staff only'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.staff
  SET pin_hash   = crypt(p_pin, gen_salt('bf')),
      pin_set_at = v_now
  WHERE id = p_staff_id;

  RETURN v_now;
END;
$$;

COMMENT ON FUNCTION public.fn_set_staff_pin_hash(UUID, TEXT) IS
  'Owner-only RPC that hashes a cook PIN with pgcrypto bcrypt and stamps staff.pin_set_at. Plaintext PIN is consumed here and never returned.';

REVOKE ALL ON FUNCTION public.fn_set_staff_pin_hash(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_set_staff_pin_hash(UUID, TEXT) TO authenticated;

-- ── Self-register ───────────────────────────────────────────────────

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '176_staff_pin_rpc.sql',
  'claude-opus-session-ec24d346',
  'fn_set_staff_pin_hash RPC (owner-only, bcrypt via pgcrypto). MC 6e4b56bf.'
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
