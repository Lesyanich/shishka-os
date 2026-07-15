import {
  signStorageUrls,
  toStoragePath,
  useSignedStorageUrls,
  type SignedUrls,
} from './signedStorage'

/* ═══════════════════════════════════════════════════════════════════════════
   Task-photos binding for the private-bucket signing helper (MC 6d860866).

   Same mechanism as receipts (./receiptUrls), same bucket-pinning shim. Done
   while the bucket was still EMPTY — zero objects, zero stored refs — so there
   was no backfill and no migration debt. Receipts had to be retrofitted onto
   318 already-persisted public URLs; this one never accumulates any.

   staff_tasks.photo_urls therefore holds bare paths (`{taskId}/{ts}.jpg`) from
   the start. The tolerance for full URLs comes free with the shared helper and
   is worth keeping — the Telegram bot writes here too.
   ═══════════════════════════════════════════════════════════════════════════ */

export const TASK_PHOTOS_BUCKET = 'task-photos'

export const toTaskPhotoPath = (value: string): string | null =>
  toStoragePath(TASK_PHOTOS_BUCKET, value)

export const signTaskPhotoUrls = (
  values: readonly string[],
): Promise<Record<string, string>> => signStorageUrls(TASK_PHOTOS_BUCKET, values)

export const useSignedTaskPhotoUrls = (
  values: readonly (string | null | undefined)[],
): SignedUrls => useSignedStorageUrls(TASK_PHOTOS_BUCKET, values)
