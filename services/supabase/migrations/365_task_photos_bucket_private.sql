-- 365_task_photos_bucket_private.sql
-- SECURITY: flip the `task-photos` bucket to private — option B (MC 6d860866)
--
-- Completes what mig 363 started. 363 stopped anonymous *enumeration*; a public
-- bucket still serves /storage/v1/object/public/<bucket>/<path> WITHOUT consulting
-- RLS, so anyone holding a link could fetch a staff/kitchen photo forever — no
-- credential, no expiry, nothing to revoke. This shuts that.
--
-- DONE NOW BECAUSE THE BUCKET IS EMPTY: 0 objects, 0 refs in staff_tasks.photo_urls
-- at the time of writing. So there is no backfill and no migration debt — contrast
-- receipts (T3, MC 69395970), which had to be retrofitted onto 318 already-persisted
-- public URLs. Once the Telegram bot starts filling this bucket, that window shuts.
--
-- PRECONDITION — ALREADY SATISFIED, and the reason this was blocked for a while:
-- telegram-webhook v16 is deployed and carries the signed-URL change (PR os#517).
-- The bot's "pics" button hands Telegram a URL and Telegram fetches it
-- ANONYMOUSLY, so on a private bucket a raw stored ref is dead. v16 mints a
-- 5-minute signed URL at send time instead — Telegram downloads the photo once and
-- then re-serves it from its own CDN, so a short TTL is ample and no long-lived
-- link ever leaves the function.
-- Flipping BEFORE that deploy would have silently broken the bot's photo button.
-- The same deploy also shipped the W2 connected-stock work (MC c605e2ca), which had
-- been merged-but-undeployed since 2026-06-30 — CEO-authorised.
--
-- WHY NOTHING ELSE BREAKS (verified, not assumed):
--   * admin panel — TaskRow / TaskDetailModal / TaskFormModal mint signed URLs via
--     lib/taskPhotoUrls.ts (over the shared lib/signedStorage.ts). Live on prod.
--     mig 363 already granted SELECT on storage.objects to `authenticated`, which is
--     the prerequisite for createSignedUrl.
--   * uploads — admin useTaskPhotoUpload and the bot's storePhoto() both write to
--     the bucket with credentials and now persist bare PATHS, not public URLs.
--   * old full URLs, if any ever appear — readers resolve both shapes.
--
-- REVERT: `UPDATE storage.buckets SET public = true WHERE id = 'task-photos';`
-- Instant, no data touched, no redeploy. If task photos stop rendering: revert
-- first, diagnose after.

BEGIN;

UPDATE storage.buckets
SET public = false
WHERE id = 'task-photos';

-- Ledger
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '365_task_photos_bucket_private.sql',
  'claude-code',
  NULL,
  'SECURITY MC 6d860866 option B: task-photos bucket -> public=false. Completes mig 363 (which only stopped anon enumeration) — /object/public/ bypasses RLS, so a leaked link was a permanent credential-free view of staff photos. Done while the bucket was EMPTY (0 objects, 0 refs) = zero backfill, unlike receipts T3. Gated on telegram-webhook v16 (PR os#517) which mints a 5-min signed URL before sendPhoto, since Telegram fetches photo URLs anonymously; that deploy also carried the W2 connected-stock work (MC c605e2ca), CEO-authorised. Revert: UPDATE storage.buckets SET public=true WHERE id=''task-photos''.'
)
ON CONFLICT DO NOTHING;

COMMIT;
