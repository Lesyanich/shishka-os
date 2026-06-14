-- Migration 276 — pg_cron schedule for the loyverse-pull poller
-- Why: «настроить постоянный процесс». pg_net + supabase_vault уже включены; здесь
-- включаем pg_cron и заводим расписание, которое периодически дёргает edge-функцию
-- loyverse-pull. Это страховочная сетка поверх webhook: чеки догоняются каждые 15 мин.
--
-- ВАЖНО: секреты в миграцию НЕ хардкодим. Перед/после применения завести в vault
-- (через execute_sql):
--   SELECT vault.create_secret('<ANON_OR_SERVICE_JWT>', 'loyverse_pull_bearer');
--   SELECT vault.create_secret(
--     'https://qcqgtcsjoacuktcewpvo.supabase.co/functions/v1/loyverse-pull',
--     'loyverse_pull_url');
-- Bearer нужен лишь чтобы пройти verify_jwt — внутри функция работает под своим
-- SERVICE_ROLE_KEY (env). Достаточно anon-ключа (он публичный).
-- Миграция лишь ссылается на vault.decrypted_secrets по имени; cron хранит command как
-- текст и читает секреты в момент запуска, поэтому порядок применения не критичен.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempotent (re)schedule: drop existing jobs with our names, then recreate.
DO $$
DECLARE j TEXT;
BEGIN
  FOREACH j IN ARRAY ARRAY['loyverse-pull-receipts','loyverse-pull-shifts','loyverse-pull-dim'] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;
END $$;

-- Receipts — the primary safety-net, every 15 minutes.
SELECT cron.schedule('loyverse-pull-receipts', '*/15 * * * *', $cron$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'loyverse_pull_url') || '?action=receipts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'loyverse_pull_bearer')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cron$);

-- Shifts — every 30 minutes.
SELECT cron.schedule('loyverse-pull-shifts', '*/30 * * * *', $cron$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'loyverse_pull_url') || '?action=shifts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'loyverse_pull_bearer')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cron$);

-- Dimensions (employees/customers/reference) + receipts/shifts catch-up — daily 03:00 Bangkok (20:00 UTC).
SELECT cron.schedule('loyverse-pull-dim', '0 20 * * *', $cron$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'loyverse_pull_url') || '?action=all',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'loyverse_pull_bearer')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cron$);

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '276_loyverse_pull_cron.sql',
  'claude-code',
  'Enable pg_cron; schedule loyverse-pull (receipts */15, shifts */30, all daily 20:00 UTC) via net.http_post reading vault secrets loyverse_pull_url + service_role_key. Secrets inserted out-of-band.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
