-- Migration 273 — fix fn_link_telegram column ambiguity (staff task tracker).
--
-- The RETURNS TABLE OUT parameter `staff_id` (defined in 264b_telegram_link_codes)
-- collided with the staff_telegram column `staff_id` referenced in
-- `INSERT ... ON CONFLICT (staff_id)`, raising 42702 "column reference staff_id
-- is ambiguous" at runtime — so every /start link attempt failed with "invalid
-- or expired". Rename the OUT param to linked_staff_id (the webhook only reads
-- staff_name) to disambiguate.

BEGIN;

DROP FUNCTION IF EXISTS public.fn_link_telegram(text, text, text);

CREATE FUNCTION public.fn_link_telegram(
  p_code     TEXT,
  p_chat_id  TEXT,
  p_username TEXT DEFAULT NULL
)
RETURNS TABLE(linked_staff_id UUID, staff_name TEXT, staff_name_th TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff_id UUID;
BEGIN
  SELECT c.staff_id INTO v_staff_id
  FROM public.telegram_link_codes c
  WHERE c.code = p_code AND c.used_at IS NULL AND c.expires_at > now()
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.staff_telegram WHERE telegram_chat_id = p_chat_id;

  INSERT INTO public.staff_telegram (staff_id, telegram_chat_id, telegram_username, linked_at)
  VALUES (v_staff_id, p_chat_id, p_username, now())
  ON CONFLICT (staff_id) DO UPDATE
    SET telegram_chat_id  = EXCLUDED.telegram_chat_id,
        telegram_username = EXCLUDED.telegram_username,
        linked_at         = now();

  UPDATE public.telegram_link_codes SET used_at = now() WHERE code = p_code;

  RETURN QUERY SELECT s.id, s.name, s.name_th FROM public.staff s WHERE s.id = v_staff_id;
END;
$$;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '273_fix_fn_link_telegram_ambiguous.sql',
  'claude-code',
  'Hotfix: rename fn_link_telegram OUT param staff_id -> linked_staff_id to fix 42702 ambiguity that broke Telegram linking.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
