-- Migration 265 — Telegram account linking (Phase 2).
--
-- One-time codes let the owner connect a staff member's Telegram. The owner
-- generates a code in /staff-tasks → shares the deep link t.me/<bot>?start=<code>
-- → the staff member opens it → bot receives "/start <code>" and calls
-- fn_link_telegram() to bind their chat_id to staff_telegram.
--
-- fn_link_telegram is SECURITY DEFINER so the edge function (service role) can
-- atomically validate + consume the code and upsert the link in one round-trip.

BEGIN;

CREATE TABLE IF NOT EXISTS public.telegram_link_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  staff_id    UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tg_link_codes_code ON public.telegram_link_codes(code) WHERE used_at IS NULL;

ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tg_link_codes_auth ON public.telegram_link_codes;
CREATE POLICY tg_link_codes_auth ON public.telegram_link_codes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Consume a code: validate (unused + unexpired), (re)link the chat to the staff
-- member, mark the code used. Returns the staff identity for the confirmation
-- message, or no rows if the code is invalid.
CREATE OR REPLACE FUNCTION public.fn_link_telegram(
  p_code     TEXT,
  p_chat_id  TEXT,
  p_username TEXT DEFAULT NULL
)
RETURNS TABLE(staff_id UUID, staff_name TEXT, staff_name_th TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff_id UUID;
BEGIN
  SELECT c.staff_id INTO v_staff_id
  FROM public.telegram_link_codes c
  WHERE c.code = p_code
    AND c.used_at IS NULL
    AND c.expires_at > now()
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RETURN;  -- invalid / expired / used code → no rows
  END IF;

  -- This chat may have been linked to someone else before (shared device).
  DELETE FROM public.staff_telegram WHERE telegram_chat_id = p_chat_id;

  INSERT INTO public.staff_telegram (staff_id, telegram_chat_id, telegram_username, linked_at)
  VALUES (v_staff_id, p_chat_id, p_username, now())
  ON CONFLICT (staff_id) DO UPDATE
    SET telegram_chat_id  = EXCLUDED.telegram_chat_id,
        telegram_username = EXCLUDED.telegram_username,
        linked_at         = now();

  UPDATE public.telegram_link_codes SET used_at = now() WHERE code = p_code;

  RETURN QUERY
    SELECT s.id, s.name, s.name_th FROM public.staff s WHERE s.id = v_staff_id;
END;
$$;

COMMENT ON TABLE public.telegram_link_codes IS
  'One-time codes binding a staff member to their Telegram chat via the bot deep link. Consumed by fn_link_telegram. MC staff-task-tracker Phase 2.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '264b_telegram_link_codes.sql',
  'claude-code',
  'Telegram linking Phase 2: telegram_link_codes table + fn_link_telegram() SECURITY DEFINER (validate code, upsert staff_telegram, mark used).'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
