#!/usr/bin/env node

/**
 * Shishka Finance Agent — MCP Server
 *
 * Connects Claude Desktop to Shishka OS Supabase backend.
 * Provides tools for receipt processing, expense tracking,
 * supplier management, and financial reporting.
 *
 * Table access (Finance domain):
 *   READ+WRITE: expense_ledger, purchase_logs, capex_transactions,
 *               opex_items, suppliers, receiving_records,
 *               supplier_catalog (learning loop), sku (barcode backfill),
 *               receipt_inbox, capex_assets, equipment
 *   READ ONLY:  nomenclature, fin_categories, fin_sub_categories
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Tool handlers
import { approveReceipt } from "./tools/approve-receipt.js";
import { verifyExpense } from "./tools/verify-expense.js";
import { searchNomenclature } from "./tools/search-nomenclature.js";
import { searchSuppliers } from "./tools/search-suppliers.js";
import { searchCategories } from "./tools/search-categories.js";
import { checkDuplicate } from "./tools/check-duplicate.js";
import { searchExpenses } from "./tools/search-expenses.js";
import { expenseSummary } from "./tools/expense-summary.js";
import { manageSuppliers } from "./tools/manage-suppliers.js";
// makro_lookup removed — Lesia verifies barcodes manually when needed
import { uploadReceipt } from "./tools/upload-receipt.js";
import { downloadReceipt } from "./tools/download-receipt.js";
import { checkInbox } from "./tools/check-inbox.js";
import { createInbox } from "./tools/create-inbox.js";
import { updateInbox } from "./tools/update-inbox.js";
import { updateExpense } from "./tools/update-expense.js";
import { readGuideline } from "./tools/read-guideline.js";
import { manageCapexAssets } from "./tools/manage-capex-assets.js";
import { archiveReceiptGdrive } from "./tools/archive-receipt-gdrive.js";

// ─── Server Setup ────────────────────────────────────────────────

const server = new McpServer({
  name: "shishka-finance-agent",
  version: "1.0.0",
});

// ─── Helper ──────────────────────────────────────────────────────

function jsonResult(data: any) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

// ─── Core Write Tools ────────────────────────────────────────────

server.tool(
  "approve_receipt",
  "Atomic insert of a receipt into expense_ledger (Hub) + purchase_logs / capex_transactions / opex_items (Spokes) via fn_approve_receipt RPC. Handles supplier resolution and nomenclature auto-create.",
  {
    transaction_date: z.string().describe("YYYY-MM-DD"),
    flow_type: z.enum(["COGS", "OpEx", "CapEx"]).describe("COGS = food only, OpEx = operational/mixed, CapEx = equipment"),
    category_code: z.number().optional().describe("Financial category code (e.g., 2100 for F&B COGS)"),
    sub_category_code: z.number().optional().describe("Sub-category code"),
    supplier_id: z.string().optional().describe("UUID of known supplier (null for auto-resolve by name)"),
    supplier_name: z.string().optional().describe("Supplier name for auto-resolve if supplier_id is null"),
    details: z.string().describe("Receipt description (e.g., 'Makro Rawai — weekly grocery')"),
    comments: z.string().optional().describe("Additional notes"),
    invoice_number: z.string().optional().describe("Receipt/invoice reference number"),
    amount_original: z.number().describe("Grand total amount paid"),
    currency: z.string().optional().describe("Currency code (default: THB)"),
    exchange_rate: z.number().optional().describe("Exchange rate to THB (default: 1)"),
    discount_total: z.number().optional().describe("Discount amount — MUST be negative or 0 (e.g., -500)"),
    vat_amount: z.number().optional().describe("VAT amount (0 if VAT-inclusive pricing)"),
    delivery_fee: z.number().optional().describe("Delivery/shipping fee (default: 0)"),
    paid_by: z.string().describe("Who paid (e.g., 'Bas', 'Lesia')"),
    payment_method: z.enum(["cash", "transfer", "card", "other"]).optional().describe("Payment method (default: cash). DB values: cash, transfer, card, other"),
    status: z.enum(["paid", "pending", "cancelled"]).optional().describe("Payment status (default: paid)"),
    has_tax_invoice: z.boolean().optional().describe("Whether this is a tax invoice (default: false)"),
    receipt_supplier_url: z.string().optional(),
    receipt_bank_url: z.string().optional(),
    tax_invoice_url: z.string().optional(),
    food_items: z
      .array(
        z.object({
          name: z.string(),
          quantity: z.number(),
          unit: z.string(),
          unit_price: z.number(),
          total_price: z.number(),
          nomenclature_id: z.string().optional(),
          supplier_sku: z.string().optional(),
          original_name: z.string().optional(),
          brand: z.string().optional(),
          package_weight: z.string().optional(),
          barcode: z.string().optional(),
        })
      )
      .optional()
      .describe("Food items → purchase_logs spoke"),
    capex_items: z
      .array(
        z.object({
          name: z.string(),
          quantity: z.number(),
          unit_price: z.number(),
          total_price: z.number(),
          asset_id: z.string().optional().describe("UUID of capex_asset to link (create via manage_capex_assets first)"),
        })
      )
      .optional()
      .describe("Equipment items → capex_transactions spoke"),
    opex_items: z
      .array(
        z.object({
          description: z.string(),
          quantity: z.number(),
          unit: z.string(),
          unit_price: z.number(),
          total_price: z.number(),
        })
      )
      .optional()
      .describe("Operational items → opex_items spoke"),
    raw_parse: z
      .record(z.string(), z.any())
      .optional()
      .describe("Full parsed receipt data as JSON — stored for future data mining. Include ALL extracted fields: barcodes, addresses, phone numbers, article numbers, etc."),
  },
  async (args) => jsonResult(await approveReceipt(args))
);

// ─── Verification Tools ──────────────────────────────────────────

server.tool(
  "verify_expense",
  "Verify a processed receipt by querying Hub (expense_ledger) + all 3 Spokes + receiving_records. Use after approve_receipt to confirm data integrity.",
  {
    expense_id: z.string().describe("UUID of the expense_ledger record to verify"),
  },
  async (args) => jsonResult(await verifyExpense(args))
);

server.tool(
  "check_duplicate",
  "Check if a receipt with same supplier + date + amount already exists in expense_ledger. Use before approve_receipt to prevent double-entry.",
  {
    supplier_name: z.string().optional().describe("Supplier name to search in details"),
    supplier_id: z.string().optional().describe("UUID of supplier"),
    date: z.string().describe("Transaction date YYYY-MM-DD"),
    amount: z.number().optional().describe("Expected total amount for exact match"),
  },
  async (args) => jsonResult(await checkDuplicate(args))
);

// ─── Read-only Query Tools ───────────────────────────────────────

server.tool(
  "search_nomenclature",
  "Search product catalog (nomenclature) for receipt matching. READ-ONLY — Finance cannot create/modify products (use Chef agent for that).",
  {
    query: z.string().describe("Search term (matches product_code or name)"),
    type: z.enum(["RAW", "PF", "MOD", "SALE"]).optional().describe("Filter by product type"),
    limit: z.number().optional().describe("Max results (default: 20)"),
  },
  async (args) => jsonResult(await searchNomenclature(args))
);

server.tool(
  "search_suppliers",
  "Search active suppliers by name or category. Returns supplier details for receipt matching.",
  {
    query: z.string().optional().describe("Search term (matches supplier name or contact)"),
    category_code: z.number().optional().describe("Filter by category code"),
    limit: z.number().optional().describe("Max results (default: 30)"),
  },
  async (args) => jsonResult(await searchSuppliers(args))
);

server.tool(
  "search_categories",
  "List financial categories and sub-categories for expense classification. Returns full category tree.",
  {
    flow_type: z.enum(["COGS", "OpEx", "CapEx"]).optional().describe("Filter by flow type"),
  },
  async (args) => jsonResult(await searchCategories(args))
);

server.tool(
  "search_expenses",
  "Query expense_ledger with filters. Search by date range, supplier, flow_type, status.",
  {
    date_from: z.string().optional().describe("Start date YYYY-MM-DD"),
    date_to: z.string().optional().describe("End date YYYY-MM-DD"),
    supplier_id: z.string().optional().describe("Filter by supplier UUID"),
    flow_type: z.enum(["COGS", "OpEx", "CapEx"]).optional().describe("Filter by flow type"),
    status: z.enum(["paid", "pending", "cancelled"]).optional().describe("Filter by status"),
    limit: z.number().optional().describe("Max results (default: 50)"),
  },
  async (args) => jsonResult(await searchExpenses(args))
);

// ─── Reporting Tools ─────────────────────────────────────────────

server.tool(
  "expense_summary",
  "Aggregated financial summary for a period. Groups expenses by flow_type (COGS/OpEx/CapEx) and optionally by category.",
  {
    date_from: z.string().describe("Start date YYYY-MM-DD"),
    date_to: z.string().describe("End date YYYY-MM-DD"),
    group_by: z.enum(["flow_type", "category"]).optional().describe("Additional grouping (default: flow_type only)"),
  },
  async (args) => jsonResult(await expenseSummary(args))
);

// ─── Supplier Management Tools ───────────────────────────────────

server.tool(
  "manage_suppliers",
  "Create or update suppliers. Checks for duplicates on create. Finance agent owns the supplier lifecycle.",
  {
    action: z.enum(["create", "update"]).describe("Action: create or update"),
    supplier_id: z.string().optional().describe("UUID of supplier (required for update)"),
    name: z.string().optional().describe("Supplier name (required for create)"),
    category_code: z.number().optional().describe("Category code (default: 2000)"),
    contact_info: z.string().optional().describe("Contact info (freeform text: phone, email, etc.)"),
    is_active: z.boolean().optional().describe("Active status (for update). Maps to is_deleted=!is_active in DB"),
  },
  async (args) => jsonResult(await manageSuppliers(args))
);

// ─── File Upload Tools ───────────────────────────────────────────

server.tool(
  "upload_receipt",
  "Upload receipt photo or PDF from local disk to Supabase Storage (bucket: receipts). Returns public URL(s) to use in approve_receipt payload. Supports JPEG, PNG, WebP, PDF (max 5MB). Use doc_type to specify which URL field to populate.",
  {
    file_path: z.string().optional().describe("Absolute path to a single receipt file on disk"),
    file_paths: z.array(z.string()).optional().describe("Array of absolute paths for multi-page receipts (max 10)"),
    doc_type: z
      .enum(["supplier", "bank", "tax", "all"])
      .optional()
      .describe("Document type: 'supplier' (default) → receipt_supplier_url, 'bank' → receipt_bank_url, 'tax' → tax_invoice_url, 'all' → map by position (1st=supplier, 2nd=bank, 3rd=tax)"),
  },
  async (args) => jsonResult(await uploadReceipt(args))
);

// ─── Receipt Download Tool ───────────────────────────────────────

server.tool(
  "download_receipt",
  "Download receipt image from Supabase Storage by storage path or public URL. Returns base64-encoded content for agent to read/parse. Use after check_inbox to read receipt photos.",
  {
    storage_path: z
      .string()
      .describe(
        "Storage path (e.g. 'receipts/inbox/1775302732437_0_rrdarx.jpg' or 'img/...'). Also accepts full public URL — path will be extracted automatically."
      ),
  },
  async (args) => jsonResult(await downloadReceipt(args))
);

// ─── Expense Update Tool ────────────────────────────────────────

server.tool(
  "update_expense",
  "Partial update of an expense_ledger record. Allowed: receipt URLs, details, status, payment_method, comments, invoice_number, has_tax_invoice. Forbidden: amount, flow_type, supplier_id.",
  {
    expense_id: z.string().describe("UUID of the expense_ledger record"),
    receipt_supplier_url: z.string().optional().describe("Supplier receipt image URL"),
    receipt_bank_url: z.string().optional().describe("Bank slip image URL"),
    tax_invoice_url: z.string().optional().describe("Tax invoice image URL"),
    details: z.string().optional().describe("Updated description"),
    status: z.enum(["paid", "pending", "cancelled"]).optional().describe("Payment status"),
    payment_method: z.enum(["cash", "transfer", "card", "other"]).optional().describe("Payment method"),
    comments: z.string().optional().describe("Additional notes"),
    invoice_number: z.string().optional().describe("Receipt/invoice reference number"),
    has_tax_invoice: z.boolean().optional().describe("Whether tax invoice is available"),
    raw_parse: z.record(z.string(), z.any()).optional().describe("Full parsed receipt data as JSON — stored for future data mining. Include ALL extracted fields."),
  },
  async (args) => jsonResult(await updateExpense(args))
);

// ─── Receipt Inbox Tools ────────────────────────────────────────

server.tool(
  "check_inbox",
  "Query receipt_inbox for uploaded receipts by status. Use to see what receipts are waiting to be processed.",
  {
    status: z.enum(["pending", "processing", "processed", "error", "skipped"]).optional().describe("Filter by status (default: pending)"),
    limit: z.number().optional().describe("Max results (default: 10)"),
  },
  async (args) => jsonResult(await checkInbox(args))
);

server.tool(
  "update_inbox",
  "Update receipt_inbox item status after processing. Use to mark a receipt as processed (with expense_id link) or errored.",
  {
    inbox_id: z.string().describe("UUID of the receipt_inbox record"),
    status: z.enum(["pending", "processing", "parsed", "processed", "error", "skipped"]).describe("New status. Use 'parsed' when agent finishes parsing (saves JSON for UI review)"),
    expense_id: z.string().optional().describe("UUID of linked expense_ledger record (when status=processed)"),
    error_message: z.string().optional().describe("Error description (when status=error)"),
    parsed_payload: z.record(z.string(), z.any()).optional().describe("Full approve_receipt payload JSON — saved when status=parsed for human review in Admin UI"),
  },
  async (args) => jsonResult(await updateInbox(args))
);

server.tool(
  "create_inbox",
  "Create a receipt_inbox entry when starting to process a new receipt. Returns inbox_id for tracking through the processing lifecycle.",
  {
    uploaded_by: z.string().optional().describe("Who uploaded (e.g., 'Bas', 'Lesia')"),
    receipt_date: z.string().optional().describe("Receipt date YYYY-MM-DD if known"),
    supplier_hint: z.string().optional().describe("Supplier name hint from filename or user comment"),
    amount_hint: z.number().optional().describe("Approximate total if known"),
    photo_urls: z.array(z.string()).optional().describe("Supabase Storage URLs of receipt images"),
    file_paths: z.array(z.string()).optional().describe("Local file paths of receipt files"),
    notes: z.string().optional().describe("User comments about this receipt"),
  },
  async (args) => jsonResult(await createInbox(args))
);

// ─── Guideline Tools ────────────────────────────────────────

server.tool(
  "read_guideline",
  "Load a receipt processing guideline or payload example on demand. Use to dynamically fetch parsing instructions for a supplier type (e.g., 'makro', 'market-small') or payload format examples. Part of the Stateless Agent v2 architecture — load only what you need.",
  {
    guideline_id: z
      .enum([
        "image-reading-protocol",
        "makro",
        "market-small",
        "delivery",
        "tax-invoice",
        "capex",
        "classification",
        "arithmetic-check",
        "payload-cogs",
        "payload-capex",
      ])
      .describe(
        "ID of guideline to load. Supplier-specific: makro, market-small, delivery. Protocols: image-reading-protocol, arithmetic-check, classification, capex, tax-invoice. Examples: payload-cogs, payload-capex"
      ),
  },
  async (args) => jsonResult(await readGuideline(args))
);

// ─── CapEx Asset Management ─────────────────────────────────

server.tool(
  "manage_capex_assets",
  "Create, update, or list CapEx assets. Use after approve_receipt for equipment purchases to register on balance sheet. Can auto-create equipment entries.",
  {
    action: z.enum(["create", "update", "list"]).describe("Action: create new asset, update existing, or list/search"),
    asset_name: z.string().optional().describe("Asset name (required for create)"),
    vendor: z.string().optional().describe("Vendor/supplier name"),
    initial_value: z.number().optional().describe("Purchase price in THB (required for create)"),
    residual_value: z.number().optional().describe("Residual value after depreciation (default: 0)"),
    useful_life_months: z.number().optional().describe("Useful life in months (default: 60 = 5 years)"),
    purchase_date: z.string().optional().describe("Purchase date YYYY-MM-DD"),
    category_code: z.number().optional().describe("Financial category code"),
    equipment_id: z.string().optional().describe("UUID of existing equipment to link"),
    equipment_name: z.string().optional().describe("Name for auto-creating equipment entry (if equipment_id not provided)"),
    equipment_category: z.string().optional().describe("Equipment category: oven, refrigeration, cooking, prep, beverage, fermentation, storage, service, infrastructure"),
    asset_id: z.string().optional().describe("UUID of asset (required for update)"),
    date_from: z.string().optional().describe("Filter: purchase date from YYYY-MM-DD (for list)"),
    date_to: z.string().optional().describe("Filter: purchase date to YYYY-MM-DD (for list)"),
    limit: z.number().optional().describe("Max results for list (default: 20)"),
  },
  async (args) => jsonResult(await manageCapexAssets(args))
);

// ─── GDrive Archive Tool ───────────────────────────────────────

server.tool(
  "archive_receipt_gdrive",
  "Download receipt photos from Supabase Storage, rename with convention {Supplier}_{Date}_{Invoice}_p{N}.{ext}, save to GDrive processed folder, update gdrive_paths in inbox. Call after receipt is approved (status=processed).",
  {
    inbox_id: z.string().describe("UUID of the receipt_inbox record to archive"),
  },
  async (args) => jsonResult(await archiveReceiptGdrive(args))
);

// ─── Start ───────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Shishka Finance Agent MCP server running on stdio`);
  console.error(`   Tools: 19 | Resources: 0 | Prompts: 0`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
