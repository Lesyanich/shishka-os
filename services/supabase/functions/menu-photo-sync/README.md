# menu-photo-sync

Edge function that pulls an approved brand photo from a **public Google Drive
file** into the `nomenclature-photos` storage bucket, optimizes it, and points
the menu item's `image_url` at the result.

## What it does per job
1. Downloads the Drive file (`driveId`).
2. Decodes + downscales the longest edge to **1080px** (ImageScript).
3. Re-encodes to **WebP @ quality 80**, preserving transparency.
4. Uploads to `nomenclature-photos/<nomenclatureId>/menu-<driveId>.webp`.
5. Updates `nomenclature.image_url` (unless `setImageUrl: false`).

Typical reduction: 3–11 MB source PNG → ~30–150 KB WebP.

## Auth secret
The shared secret is read from the `MENU_PHOTO_SYNC_SECRET` function secret and
must **never** be inlined in source — this repository is public.

```bash
supabase secrets set MENU_PHOTO_SYNC_SECRET=<value> --project-ref <project>
```

If the secret is unset the function returns `500` and rejects every request, so
a missing secret fails closed rather than authorizing anonymous callers.

## Invoking (from SQL via pg_net)
```sql
select net.http_post(
  url := 'https://<project>.supabase.co/functions/v1/menu-photo-sync',
  headers := '{"Content-Type":"application/json"}'::jsonb,
  timeout_milliseconds := 180000,
  body := jsonb_build_object(
    'secret', '<shared-secret>',
    'jobs', jsonb_build_array(
      jsonb_build_object('driveId','<driveId>','nomenclatureId','<uuid>')
    )
  )
);
```

Optional per-job flags: `compress: false` (store original bytes),
`setImageUrl: false` (upload only, don't touch the row).

## ⚠️ Concurrency / batching constraint
The WebP encoder is wasm; its linear heap **only grows** within a worker. So:

- **One image per invocation** (`jobs: [singleJob]`). Batching several large
  images into one call eventually trips `WORKER_RESOURCE_LIMIT` (HTTP 546).
- Fan out instead: fire many single-image invocations concurrently. ~8 at a
  time is comfortable on the free tier.

The `menu_photo_map(nomenclature_id, drive_id)` table in the DB records the
brand-photo → item mapping so the whole set can be re-synced at any time by
selecting the pending rows and firing one invocation each.

> Note: Supabase Storage image transformations (CDN-side resize/format) would
> remove the need for this compression step, but that feature is not enabled on
> the current (free) plan — hence in-function WebP.
