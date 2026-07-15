-- 362_receipts_bucket_auth_guard.sql
-- SECURITY: close anonymous list / upload / delete on the `receipts` storage bucket — MC 3e44358d
--
-- WHY THIS EXISTS: the three RLS policies on storage.objects for bucket `receipts` carried
-- NO authentication predicate. Their USING / WITH CHECK was only `bucket_id = 'receipts'`,
-- granted to role `public` — which in Postgres includes `anon`. Two of them are even *named*
-- "Authenticated ..." while never checking auth:
--     "Public read receipts"          SELECT  USING      (bucket_id = 'receipts')
--     "Authenticated upload receipts" INSERT  WITH CHECK (bucket_id = 'receipts')
--     "Authenticated delete receipts" DELETE  USING      (bucket_id = 'receipts')
--
-- Confirmed live against prod with the anon key — which ships inside the admin-panel JS
-- bundle, so it is public knowledge:
--     POST /storage/v1/object/list/receipts  ->  200 + every filename
-- Anyone could therefore enumerate all 403 receipt files, download each (bucket is public),
-- upload arbitrary files into the bucket, and DELETE any receipt. The "unguessable filename"
-- defence was void: you do not have to guess what you can list.
--
-- Sibling buckets guard their WRITE side correctly — task-photos and nomenclature-photos check
-- auth.role() = 'authenticated' on INSERT/UPDATE/DELETE; kb-images checks fn_is_owner(). On the
-- write side `receipts` was the ONLY bucket with no predicate, which is why it reads as an
-- oversight rather than a decision.
--
-- The SELECT side is a different story and worth stating plainly: `bucket_id`-only SELECT is
-- the norm here — task-photos, nomenclature-photos and kb-images are ALL still anon-listable.
-- After this migration `receipts` is the only bucket with a guarded SELECT. For
-- nomenclature-photos and kb-images that is defensible (menu + handbook images are public
-- content on the website anyway); task-photos holds internal kitchen/staff photos and deserves
-- its own look — NOT done here to keep this migration to the live hole. Tracked on MC 3e44358d.
--
-- BEHAVIOUR AFTER THIS MIGRATION:
--   * anon list / upload / delete             -> blocked
--   * authenticated list / upload             -> allowed (admin panel: upload-helpers.ts,
--                                                MagicDropzone, ExpenseEditModal, ExpenseHistory)
--   * delete                                  -> owner only, via public.fn_is_owner()
--   * service_role (edge fns, mcp-finance)    -> unaffected, bypasses RLS
--   * download by exact public URL            -> STILL WORKS, deliberately (see below)
--
-- WHY THE BUCKET STAYS public=true: 454 *full* public URLs are persisted in the DB —
-- receipt_inbox.photo_urls (186), expense_ledger.receipt_supplier_url (111),
-- expense_ledger.receipt_bank_url (21), receipt_jobs.image_urls (136). For a public bucket
-- Supabase serves /object/public/<bucket>/<path> without consulting RLS, so those keep
-- resolving. Flipping the bucket to private would break all 454 at once: signed URLs expire
-- and therefore cannot be persisted, so the DB would have to store PATHS and mint signed URLs
-- at read time — a ~20-file change across admin-panel, mcp-finance, ocr-receipt and
-- receipt-batch-process. That cutover is tracked separately as T3 on MC 3e44358d. This
-- migration is deliberately the non-breaking half: it closes enumeration and destruction now.
--
-- WHY DELETE IS OWNER-ONLY, NOT `authenticated`: nothing in the codebase calls .remove() on
-- this bucket at all (grep: only nomenclature-photos and dish photos do), so tightening past
-- `authenticated` costs nothing. Receipts are the source documents behind expense_ledger,
-- which is itself owner-only for ALL commands via `expense_ledger_owner_only` (mig 313).
-- Staff sign in with a PIN and get a real `authenticated` session, so leaving DELETE at
-- `authenticated` would let a cook's session destroy accounting evidence.

BEGIN;

DROP POLICY IF EXISTS "Public read receipts"          ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete receipts" ON storage.objects;

CREATE POLICY "receipts_select_authenticated"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'receipts' AND auth.role() = 'authenticated');

CREATE POLICY "receipts_insert_authenticated"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'receipts' AND auth.role() = 'authenticated');

CREATE POLICY "receipts_delete_owner_only"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'receipts' AND public.fn_is_owner());

-- Ledger
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '362_receipts_bucket_auth_guard.sql',
  'claude-code',
  NULL,
  'SECURITY MC 3e44358d T1+T2: receipts bucket policies had no auth predicate — anon could list/upload/delete (anon list confirmed 200 on prod). Now SELECT+INSERT = authenticated, DELETE = fn_is_owner(). Bucket stays public=true so 454 persisted public URLs keep resolving; private+signed-URL cutover = T3.'
)
ON CONFLICT DO NOTHING;

COMMIT;
