-- Migration 306 — Telegram alert on new website order
-- Why: staff must learn about a new website order even when no admin screen is
-- open. An AFTER INSERT trigger on `orders` fires net.http_post to the
-- telegram-push edge function (action=new_order), which posts one message to the
-- kitchen group chat. The in-app toast/sound (useNewOrderAlerts) covers the
-- open-screen case; this covers everyone's phone.
--
-- Auth: reuses the existing vault secret 'loyverse_pull_bearer' (any valid JWT
-- that passes the edge function's verify_jwt — the function itself runs under its
-- own SERVICE_ROLE_KEY). The function URL is public (not a secret) and inlined.
-- If that secret is renamed/rotated, update the SELECT below.
--
-- Safety: notification is fire-and-forget inside a nested block; a failure here
-- must never roll back the order insert.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.fn_notify_new_website_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bearer text;
BEGIN
  SELECT decrypted_secret INTO v_bearer
  FROM vault.decrypted_secrets
  WHERE name = 'loyverse_pull_bearer'
  LIMIT 1;

  BEGIN
    PERFORM net.http_post(
      url := 'https://qcqgtcsjoacuktcewpvo.supabase.co/functions/v1/telegram-push'
             || '?action=new_order&order_id=' || NEW.id::text,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(v_bearer, '')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 8000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_notify_new_website_order: notify failed for order %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Only customer-facing website orders, only at creation time (status='new').
DROP TRIGGER IF EXISTS trg_notify_new_website_order ON public.orders;
CREATE TRIGGER trg_notify_new_website_order
  AFTER INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'new' AND NEW.source = 'website')
  EXECUTE FUNCTION public.fn_notify_new_website_order();

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '306_notify_new_website_order.sql',
  'claude-code',
  'AFTER INSERT trigger on orders (source=website, status=new) → net.http_post telegram-push?action=new_order. Reuses vault secret loyverse_pull_bearer; function URL inlined (public). Fire-and-forget; never blocks the insert.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
