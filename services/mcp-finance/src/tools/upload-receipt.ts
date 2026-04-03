/**
 * upload-receipt — Upload receipt file(s) to Supabase Storage bucket "receipts"
 *
 * Reads a local file from disk, uploads to Supabase Storage,
 * returns the public URL to use in approve_receipt payload.
 *
 * Supports: JPEG, PNG, WebP, PDF (max 5MB per file)
 * Path in bucket: img/{timestamp}_{index}_{random}.{ext}
 *
 * The MCP server runs on user's Mac, so it has full filesystem access.
 */

import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { getSupabase } from "../lib/supabase.js";

const BUCKET = "receipts";
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

interface UploadResult {
  file: string;
  ok: boolean;
  url?: string;
  storage_path?: string;
  error?: string;
  size_kb?: number;
}

async function uploadSingleFile(
  filePath: string,
  index: number,
  docType: string
): Promise<UploadResult> {
  const fileName = basename(filePath);
  const ext = extname(filePath).toLowerCase();
  const mimeType = MIME_MAP[ext];

  if (!mimeType) {
    return {
      file: fileName,
      ok: false,
      error: `Unsupported file type: ${ext}. Allowed: .jpg, .jpeg, .png, .webp, .pdf`,
    };
  }

  // Read file from disk
  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch (err: any) {
    return {
      file: fileName,
      ok: false,
      error: `Cannot read file: ${err.message}`,
    };
  }

  // Check size
  if (buffer.length > MAX_SIZE) {
    return {
      file: fileName,
      ok: false,
      error: `File too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (max 5MB)`,
      size_kb: Math.round(buffer.length / 1024),
    };
  }

  // Generate storage path matching frontend pattern
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const storagePath = `img/${timestamp}_${index}_${random}${ext}`;

  // Upload to Supabase Storage
  const sb = getSupabase();
  const { error: uploadError } = await sb.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    return {
      file: fileName,
      ok: false,
      error: `Upload failed: ${uploadError.message}`,
    };
  }

  // Get public URL
  const { data } = sb.storage.from(BUCKET).getPublicUrl(storagePath);

  return {
    file: fileName,
    ok: true,
    url: data.publicUrl,
    storage_path: storagePath,
    size_kb: Math.round(buffer.length / 1024),
  };
}

export interface UploadReceiptArgs {
  file_path?: string;
  file_paths?: string[];
  doc_type?: string;
}

export async function uploadReceipt(args: UploadReceiptArgs) {
  const paths: string[] = [];

  if (args.file_path) paths.push(args.file_path);
  if (args.file_paths) paths.push(...args.file_paths);

  if (paths.length === 0) {
    return {
      ok: false,
      error: "Provide file_path (single) or file_paths (array) of receipt files to upload",
    };
  }

  if (paths.length > 10) {
    return {
      ok: false,
      error: `Too many files: ${paths.length} (max 10 per call)`,
    };
  }

  const docType = args.doc_type || "supplier";
  const results: UploadResult[] = [];

  for (let i = 0; i < paths.length; i++) {
    const result = await uploadSingleFile(paths[i], i, docType);
    results.push(result);
  }

  const successful = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  // Map URLs to the three expense_ledger fields based on doc_type or position
  const urlMapping: Record<string, string | null> = {
    receipt_supplier_url: null,
    receipt_bank_url: null,
    tax_invoice_url: null,
  };

  if (successful.length > 0) {
    if (docType === "supplier" || docType === "all") {
      urlMapping.receipt_supplier_url = successful[0]?.url ?? null;
    }
    if (docType === "bank" || (docType === "all" && successful.length > 1)) {
      urlMapping.receipt_bank_url =
        docType === "bank"
          ? successful[0]?.url ?? null
          : successful[1]?.url ?? null;
    }
    if (docType === "tax" || (docType === "all" && successful.length > 2)) {
      urlMapping.tax_invoice_url =
        docType === "tax"
          ? successful[0]?.url ?? null
          : successful[2]?.url ?? null;
    }
  }

  return {
    ok: failed.length === 0,
    uploaded: successful.length,
    failed: failed.length,
    total: paths.length,
    url_mapping: urlMapping,
    results,
    hint: "Use url_mapping values in approve_receipt payload fields: receipt_supplier_url, receipt_bank_url, tax_invoice_url",
  };
}
