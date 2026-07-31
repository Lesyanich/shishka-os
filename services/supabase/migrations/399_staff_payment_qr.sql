-- 399_staff_payment_qr.sql
-- CEO request 2026-07-31: "к каждому сотруднику в админку надо добавить их платежный QR"
--
-- Wages are paid in cash today, but transfers need the payee's PromptPay QR and
-- right now those live in the CEO's photo roll. One missing QR on payday is one
-- person not paid.
--
-- WHY THIS BUCKET IS NOT LIKE THE OTHERS. A PromptPay QR encodes the payee's
-- PromptPay handle — a phone number or a national ID — plus their name. That is
-- personal financial data about a specific person, and it is the payload, not
-- metadata: anyone who can fetch the image can read the identifier out of it.
--
-- Every existing private bucket here (receipts, task-photos, supplier-files)
-- is gated on nothing more than `auth.role() = 'authenticated'`, which would let
-- any cook with a login pull every colleague's payment details. That is fine for
-- a receipt photo and wrong for this. So the policies below are per-row:
--
--   read   — the owner, or the employee the QR belongs to
--   write  — the owner only
--
-- Ownership is derived from the object path, `{staff_id}/{filename}`, so it
-- cannot drift from whatever a column happens to say.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS payment_qr_path TEXT,
  ADD COLUMN IF NOT EXISTS payment_note    TEXT;

COMMENT ON COLUMN public.staff.payment_qr_path IS
  'Bare storage path inside the private `staff-payment-qr` bucket, `{staff_id}/{file}`. '
  'NEVER a URL: the bucket is private, so links are signed per render and expire. '
  'See lib/signedStorage.ts.';

COMMENT ON COLUMN public.staff.payment_note IS
  'Human-readable payee detail shown beside the QR — PromptPay handle, bank and masked account. '
  'Lets a human sanity-check that the QR belongs to the person they are about to pay.';

-- ---------------------------------------------------------------------------
-- 2. Private bucket
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('staff-payment-qr', 'staff-payment-qr', false, 8388608,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public             = false,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 3. Per-row policies
-- ---------------------------------------------------------------------------
-- Audit the qual, not the name: these genuinely restrict, unlike the flat
-- `authenticated` policies on the older buckets.

DROP POLICY IF EXISTS staff_payment_qr_select ON storage.objects;
DROP POLICY IF EXISTS staff_payment_qr_insert ON storage.objects;
DROP POLICY IF EXISTS staff_payment_qr_update ON storage.objects;
DROP POLICY IF EXISTS staff_payment_qr_delete ON storage.objects;

CREATE POLICY staff_payment_qr_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'staff-payment-qr'
    AND (
      (SELECT r.app_role FROM public.fn_get_my_role() r) = 'owner'
      OR (storage.foldername(name))[1] =
         (SELECT r.staff_id FROM public.fn_get_my_role() r)::text
    )
  );

CREATE POLICY staff_payment_qr_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'staff-payment-qr'
    AND (SELECT r.app_role FROM public.fn_get_my_role() r) = 'owner'
  );

CREATE POLICY staff_payment_qr_update ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'staff-payment-qr'
    AND (SELECT r.app_role FROM public.fn_get_my_role() r) = 'owner'
  );

CREATE POLICY staff_payment_qr_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'staff-payment-qr'
    AND (SELECT r.app_role FROM public.fn_get_my_role() r) = 'owner'
  );

-- ---------------------------------------------------------------------------
-- 4. Ledger
-- ---------------------------------------------------------------------------

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('399_staff_payment_qr.sql', 'claude-opus-session-eb56fda0', 'success',
        'staff.payment_qr_path + staff.payment_note, and a PRIVATE staff-payment-qr bucket. '
     || 'Unlike the other private buckets (receipts, task-photos, supplier-files), which are gated '
     || 'only on auth.role()=authenticated, these policies are per-row: read = owner or the employee '
     || 'themselves, write = owner only. A PromptPay QR encodes the payee''s phone or national ID as '
     || 'its payload, so read access is read access to their identifier. Ownership derives from the '
     || 'object path {staff_id}/{file}. Path is stored bare — the bucket is private and URLs are '
     || 'signed per render (lib/signedStorage.ts).')
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- BEGIN;
-- DROP POLICY IF EXISTS staff_payment_qr_select ON storage.objects;
-- DROP POLICY IF EXISTS staff_payment_qr_insert ON storage.objects;
-- DROP POLICY IF EXISTS staff_payment_qr_update ON storage.objects;
-- DROP POLICY IF EXISTS staff_payment_qr_delete ON storage.objects;
-- DELETE FROM storage.objects WHERE bucket_id = 'staff-payment-qr';
-- DELETE FROM storage.buckets WHERE id = 'staff-payment-qr';
-- ALTER TABLE public.staff DROP COLUMN IF EXISTS payment_qr_path, DROP COLUMN IF EXISTS payment_note;
-- DELETE FROM public.migration_log WHERE filename='399_staff_payment_qr.sql';
-- COMMIT;
