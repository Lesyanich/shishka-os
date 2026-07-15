-- 364_receipts_bucket_private.sql
-- SECURITY: flip the `receipts` bucket to private — the last step of T3 (MC 69395970)
--
-- WHAT THIS FINALLY CLOSES: for a public bucket, Supabase serves
-- /storage/v1/object/public/<bucket>/<path> WITHOUT consulting RLS. So even after
-- mig 362 closed anonymous list/upload/delete, anyone still holding an old URL could
-- fetch that receipt forever — no credential, no expiry, no way to revoke it. This is
-- the only thing that shuts that door. Everything up to here was necessary groundwork;
-- this one line is the actual security win.
--
-- DO NOT APPLY THIS BEFORE THE ADMIN PANEL CODE IS LIVE ON main. Ordering matters:
-- the browser mints a short-lived signed URL at render time (lib/receiptUrls.ts). An
-- older bundle that still falls back to the stored public URL would render a broken
-- image on every load the moment this lands.
--
-- WHY NOTHING BREAKS (each one verified, not assumed — see the PR):
--   * admin panel  — every live render site mints a signed URL from the stored ref
--     (InboxReviewPanel, PendingPreview, ReceiptGallery → FinanceLedger +
--     ExpenseEditModal). Signed URLs work on a private bucket; that is their purpose.
--     mig 362 already granted SELECT on storage.objects to `authenticated`, which is
--     the prerequisite for createSignedUrl.
--   * ocr-receipt / receipt-batch-process — download bytes with the service-role
--     client (mig-independent, bypasses RLS) since T3 step 3, deployed as v54/v18.
--     Verified live end-to-end: ok:true, gcv+llm, 2571 ocr_chars.
--   * mcp-finance download-receipt + archive-receipt-gdrive — service-role
--     .download(), and their extractStoragePath already accepted every ref shape.
--   * the 3 legacy Google Drive links in expense_ledger — never lived in this bucket;
--     toReceiptPath returns null for a foreign host, so they are passed through
--     untouched and keep working exactly as before.
--
-- MIXED REFS ARE THE STEADY STATE: 318 older rows hold full public URLs, newer rows
-- hold bare paths (`inbox/x.jpg`) since T3 step 4. Every reader resolves both. The
-- backfill was considered and deliberately SKIPPED — it buys zero security (the door
-- is this flip, not the string shape), it cannot simplify the code away (the
-- tolerance layer must survive for those 3 Google Drive links regardless), and it
-- would mean a mass UPDATE across financial records for cosmetics. CEO decision,
-- 2026-07-15.
--
-- REVERT: `UPDATE storage.buckets SET public = true WHERE id = 'receipts';`
-- Instant, no data touched, no code change needed — the signed-URL path keeps working
-- either way. If receipts stop rendering, revert first and diagnose after.

BEGIN;

UPDATE storage.buckets
SET public = false
WHERE id = 'receipts';

-- Ledger
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '364_receipts_bucket_private.sql',
  'claude-code',
  NULL,
  'SECURITY MC 69395970 T3 final: receipts bucket -> public=false. Closes the last hole — /object/public/ bypasses RLS, so any leaked URL was a permanent credential-free link to a financial document. Admin panel mints signed URLs (T3 step 1), edge fns download via service-role (step 3, v54/v18), write side stores paths (step 4). 318 legacy full URLs still resolve (readers accept both shapes); 3 legacy GDrive links passed through untouched. Backfill deliberately skipped — zero security value, CEO call. Revert: UPDATE storage.buckets SET public=true WHERE id=''receipts''.'
)
ON CONFLICT DO NOTHING;

COMMIT;
