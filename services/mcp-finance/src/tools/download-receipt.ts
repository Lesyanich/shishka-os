/**
 * download-receipt — Download receipt file from Supabase Storage
 *
 * Reads a file from Supabase Storage bucket "receipts" using the
 * server-side API (Service Role Key), bypassing egress restrictions.
 * Returns base64-encoded content so the agent can read/parse the image.
 *
 * Accepts both storage paths and full public URLs.
 */

import { getSupabase } from "../lib/supabase.js";

const BUCKET = "receipts";
const MAX_DOWNLOAD_SIZE = 10 * 1024 * 1024; // 10MB safety limit

/**
 * Extract relative storage path from various input formats:
 * - Full URL: https://xxx.supabase.co/storage/v1/object/public/receipts/img/...
 * - Bucket-prefixed: receipts/inbox/1775302732437_0_rrdarx.jpg
 * - Relative: img/1775302732437_0_rrdarx.jpg
 * - Inbox path: inbox/1775302732437_0_rrdarx.jpg
 */
function extractStoragePath(input: string): string {
  // Full public URL → extract path after /receipts/
  const urlPattern = /\/storage\/v1\/object\/public\/receipts\/(.+)$/;
  const match = input.match(urlPattern);
  if (match) return match[1];

  // Signed URL variant
  const signedPattern = /\/storage\/v1\/object\/sign\/receipts\/(.+?)(\?|$)/;
  const signedMatch = input.match(signedPattern);
  if (signedMatch) return signedMatch[1];

  // Bucket-prefixed path → strip bucket name
  if (input.startsWith("receipts/")) return input.slice("receipts/".length);

  // Already a relative path within the bucket
  return input;
}

export interface DownloadReceiptArgs {
  storage_path: string;
}

export async function downloadReceipt(args: DownloadReceiptArgs) {
  if (!args.storage_path || args.storage_path.trim() === "") {
    return {
      ok: false,
      error: "storage_path is required",
    };
  }

  const storagePath = extractStoragePath(args.storage_path.trim());

  const sb = getSupabase();

  let data: Blob;
  try {
    const result = await sb.storage.from(BUCKET).download(storagePath);

    if (result.error) {
      return {
        ok: false,
        storage_path: storagePath,
        error: `Download failed: ${result.error.message}`,
      };
    }

    data = result.data;
  } catch (err: any) {
    return {
      ok: false,
      storage_path: storagePath,
      error: `Storage error: ${err.message}`,
    };
  }

  // Convert Blob to Buffer
  const buffer = Buffer.from(await data.arrayBuffer());

  // Size check
  if (buffer.length > MAX_DOWNLOAD_SIZE) {
    return {
      ok: false,
      storage_path: storagePath,
      error: `File too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (max ${MAX_DOWNLOAD_SIZE / 1024 / 1024}MB)`,
    };
  }

  // Content type from blob or fallback
  const contentType = data.type || "application/octet-stream";

  return {
    ok: true,
    storage_path: storagePath,
    content_type: contentType,
    size_kb: Math.round(buffer.length / 1024),
    base64: buffer.toString("base64"),
  };
}
