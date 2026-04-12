/**
 * archive-receipt-gdrive — Archive receipt photos to GDrive processed folder
 *
 * Downloads photos from Supabase Storage, renames with convention
 * {Supplier}_{YYYY-MM-DD}_{InvoiceNo}_p{N}.{ext}, and saves to
 * 01_Business/Receipts/processed/{YYYY-MM}/ on the GDrive mount.
 * Updates receipt_inbox.gdrive_paths column.
 *
 * No Google Drive API needed — project lives on GDrive Shared Drive mount,
 * plain fs.writeFileSync works.
 */

import { getSupabase } from "../lib/supabase.js";
import { fileURLToPath } from "url";
import * as path from "path";
import * as fs from "fs";

const BUCKET = "receipts";

/** Resolve project root (5 levels up from this file's dist location) */
function getProjectRoot(): string {
  const thisFile = fileURLToPath(import.meta.url);
  // dist/tools/archive-receipt-gdrive.js → services/mcp-finance/ → services/ → project root
  return path.resolve(path.dirname(thisFile), "..", "..", "..", "..");
}

/**
 * Sanitize supplier name for filename:
 * - Replace forbidden chars with _
 * - Trim whitespace
 * - CamelCase
 * - Max 30 chars
 */
function sanitizeSupplier(name: string): string {
  if (!name) return "Unknown";

  let clean = name
    .replace(/[/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  // CamelCase: split on spaces/underscores, capitalize each word
  clean = clean
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");

  return clean.slice(0, 30) || "Unknown";
}

/**
 * Extract relative storage path from URL or path string.
 * Reuses the same logic as download-receipt.ts.
 */
function extractStoragePath(input: string): string {
  const urlPattern = /\/storage\/v1\/object\/public\/receipts\/(.+)$/;
  const match = input.match(urlPattern);
  if (match) return match[1];

  const signedPattern = /\/storage\/v1\/object\/sign\/receipts\/(.+?)(\?|$)/;
  const signedMatch = input.match(signedPattern);
  if (signedMatch) return signedMatch[1];

  if (input.startsWith("receipts/")) return input.slice("receipts/".length);

  return input;
}

/** Derive file extension from storage path or content type */
function deriveExtension(storagePath: string, contentType?: string): string {
  // Try from path first
  const pathExt = path.extname(storagePath).toLowerCase();
  if (pathExt && pathExt.length <= 5) return pathExt; // includes the dot

  // Fallback to content type
  const ctMap: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
  };
  if (contentType && ctMap[contentType]) return ctMap[contentType];

  return ".bin";
}

export interface ArchiveReceiptGdriveArgs {
  inbox_id: string;
}

export async function archiveReceiptGdrive(args: ArchiveReceiptGdriveArgs) {
  if (!args.inbox_id) {
    return { ok: false, error: "inbox_id is required" };
  }

  const sb = getSupabase();

  // 1. Fetch receipt_inbox row
  const { data: inbox, error: inboxErr } = await sb
    .from("receipt_inbox")
    .select("*")
    .eq("id", args.inbox_id)
    .single();

  if (inboxErr || !inbox) {
    return {
      ok: false,
      error: `Receipt inbox not found: ${inboxErr?.message || "no row"}`,
    };
  }

  // 2. Validate status
  if (inbox.status !== "processed") {
    return {
      ok: false,
      error: `Cannot archive: receipt status is '${inbox.status}', expected 'processed'`,
    };
  }

  // 3. Check photo_urls
  const photoUrls: string[] = inbox.photo_urls || [];
  if (photoUrls.length === 0) {
    return {
      ok: false,
      error: "No photo_urls found in receipt inbox — nothing to archive",
    };
  }

  // 4. Extract metadata from parsed_payload
  const payload = inbox.parsed_payload || {};
  const supplierName = sanitizeSupplier(
    payload.supplier_name || inbox.supplier_hint || "Unknown"
  );
  const txnDate: string =
    payload.transaction_date || inbox.receipt_date || "unknown-date";
  const invoiceNumber: string | null = payload.invoice_number || null;

  // Sanitize invoice number for filename
  const invoicePart = invoiceNumber
    ? "_" + invoiceNumber.replace(/[/\\:*?"<>|]/g, "_").trim()
    : "";

  // 5. Determine target folder
  const yearMonth = txnDate.length >= 7 ? txnDate.slice(0, 7) : "unknown";
  const projectRoot = getProjectRoot();
  const targetDir = path.join(
    projectRoot,
    "01_Business",
    "Receipts",
    "processed",
    yearMonth
  );

  // Create folder if not exists
  fs.mkdirSync(targetDir, { recursive: true });

  // 6. Download and save each photo
  const gdrivePaths: string[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < photoUrls.length; i++) {
    const url = photoUrls[i];
    const storagePath = extractStoragePath(url);

    try {
      const result = await sb.storage.from(BUCKET).download(storagePath);

      if (result.error) {
        warnings.push(
          `Photo ${i + 1}: download failed — ${result.error.message}`
        );
        continue;
      }

      const buffer = Buffer.from(await result.data.arrayBuffer());
      const ext = deriveExtension(storagePath, result.data.type);

      // Build filename: {Supplier}_{Date}_{Invoice}_p{N}.{ext}
      const filename = `${supplierName}_${txnDate}${invoicePart}_p${i + 1}${ext}`;
      const fullPath = path.join(targetDir, filename);

      fs.writeFileSync(fullPath, buffer);

      // Store relative path from project root
      const relativePath = path.relative(projectRoot, fullPath);
      gdrivePaths.push(relativePath);
    } catch (err: any) {
      warnings.push(`Photo ${i + 1}: ${err.message}`);
    }
  }

  if (gdrivePaths.length === 0) {
    return {
      ok: false,
      error: "All photo downloads failed",
      warnings,
    };
  }

  // 7. Update receipt_inbox.gdrive_paths
  const { error: updateErr } = await sb
    .from("receipt_inbox")
    .update({ gdrive_paths: gdrivePaths })
    .eq("id", args.inbox_id);

  if (updateErr) {
    return {
      ok: true,
      inbox_id: args.inbox_id,
      gdrive_paths: gdrivePaths,
      files_archived: gdrivePaths.length,
      warnings: [
        ...warnings,
        `DB update failed: ${updateErr.message} (files saved, gdrive_paths not updated)`,
      ],
    };
  }

  return {
    ok: true,
    inbox_id: args.inbox_id,
    gdrive_paths: gdrivePaths,
    files_archived: gdrivePaths.length,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
