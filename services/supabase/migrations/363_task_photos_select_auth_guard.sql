-- 363_task_photos_select_auth_guard.sql
-- SECURITY (preventive): close anonymous enumeration of the `task-photos` bucket — MC a365e2a4
--
-- WHY THIS EXISTS: `task_photos_select` was SELECT USING (bucket_id = 'task-photos') — no auth
-- predicate, granted to role `public`, which in Postgres includes `anon`. So the bucket was
-- anon-listable: anyone with the anon key (it ships in the admin-panel JS bundle) could
-- enumerate every staff/kitchen task photo and then fetch each one, since the bucket is public.
-- Same shape as the `receipts` hole closed by mig 362 (MC 3e44358d).
--
-- MUCH LOWER STAKES THAN receipts, for two reasons:
--   1. The write side was already guarded — task_photos_insert / _update / _delete all check
--      auth.role() = 'authenticated'. There was never a destructive exposure here, only discovery.
--   2. The bucket is EMPTY. Verified before writing this: 0 objects in storage.objects for
--      bucket_id='task-photos', and 0 urls across staff_tasks.photo_urls. Nothing was exposed,
--      because there was nothing in it.
--
-- SO WHY BOTHER NOW: because this is the cheapest it will ever be. Zero objects and zero
-- persisted URLs means zero migration debt. telegram-webhook's storePhoto() uploads into this
-- bucket and stores getPublicUrl() output, and that webhook deploy is pending (MC c605e2ca). Once
-- it ships, this bucket fills with public URLs persisted in staff_tasks.photo_urls — and closing
-- it later becomes exactly the 454-URL migration we now owe for receipts (MC 69395970). Fix it
-- before it fills, not after.
--
-- PRE-CHECKS (the same ones that made mig 362 safe):
--   * nothing calls .list() on this bucket   -> only .upload() + .getPublicUrl()
--   * public site does not embed it          -> grepped shishka-health @ main, zero hits
--   * consumers: admin-panel hooks/useStaffTasks.ts + hooks/useTaskPhotoUpload.ts (authenticated),
--     services/supabase/functions/telegram-webhook/index.ts (service_role -> bypasses RLS)
--
-- BEHAVIOUR AFTER THIS MIGRATION:
--   * anon list / enumerate                  -> blocked
--   * authenticated list                     -> allowed (admin panel)
--   * service_role (telegram-webhook)        -> unaffected, bypasses RLS
--   * download by exact public URL           -> STILL WORKS — bucket stays public=true, and
--     /object/public/<bucket>/<path> bypasses RLS by design. This matters specifically for the
--     Telegram bot: staff open photo links in their Telegram client, which fetches them
--     ANONYMOUSLY. Restricting SELECT does not touch that path, so bot links keep working.
--     Making the bucket private (option B) WOULD break them and needs a long-TTL signed URL or a
--     different delivery path — a separate CEO decision, deliberately not taken here.
--
-- Only SELECT is touched: INSERT/UPDATE/DELETE are already correct and are left alone.

BEGIN;

DROP POLICY IF EXISTS "task_photos_select" ON storage.objects;

CREATE POLICY "task_photos_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'task-photos' AND auth.role() = 'authenticated');

-- Ledger
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '363_task_photos_select_auth_guard.sql',
  'claude-code',
  NULL,
  'SECURITY (preventive) MC a365e2a4: task_photos_select had no auth predicate -> bucket was anon-listable. Now requires auth.role()=authenticated. Write side was already guarded; bucket was empty (0 objects, 0 urls) so nothing was exposed and nothing breaks. Done now because it is free while empty — telegram-webhook (MC c605e2ca) will start filling it with persisted public URLs. Bucket stays public=true so Telegram-delivered links keep resolving.'
)
ON CONFLICT DO NOTHING;

COMMIT;
