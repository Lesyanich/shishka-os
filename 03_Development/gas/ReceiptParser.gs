// ═══════════════════════════════════════════════════════════
// Google Apps Script: ReceiptParser
// Phase 5.0c: Unkillable Logging Edition
// ═══════════════════════════════════════════════════════════
// Debug strategy: ALL logs → debugLog[] array → written to
// receipt_jobs.error column on ANY failure. This bypasses
// the broken GAS Executions UI entirely.
// ═══════════════════════════════════════════════════════════
// SETUP:
//   1. Script Properties (Settings → Script Properties):
//      - GEMINI_API_KEY
//      - DRIVE_FOLDER_ID = 1KUDflDuCkJL3rG0ldNGUqJW_rOErNGZi
//      - SUPABASE_URL
//      - SUPABASE_SERVICE_ROLE_KEY
//   2. Deploy as Web App: Execute as "Me", Access "Anyone"
// ═══════════════════════════════════════════════════════════

var GEMINI_MODEL = "gemini-2.0-flash";

// ── Debug log accumulator — the "black box" ──
var debugLog = [];

function log_(msg) {
  var ts = new Date().toISOString().substring(11, 23);
  var line = "[" + ts + "] " + msg;
  debugLog.push(line);
  console.log(line);
}

function logError_(msg) {
  var ts = new Date().toISOString().substring(11, 23);
  var line = "[" + ts + "] ERROR: " + msg;
  debugLog.push(line);
  console.error(line);
}

// ── Config from Script Properties ──
function getConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    geminiApiKey: props.getProperty("GEMINI_API_KEY"),
    driveFolderId: props.getProperty("DRIVE_FOLDER_ID") || "1KUDflDuCkJL3rG0ldNGUqJW_rOErNGZi",
    supabaseUrl: props.getProperty("SUPABASE_URL") || "",
    supabaseKey: props.getProperty("SUPABASE_SERVICE_ROLE_KEY") || "",
  };
}

// ═══════════════════════════════════════════════════════════
// doGet — placeholder to stop red "Failed" noise in GAS logs
// ═══════════════════════════════════════════════════════════
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "alive",
    model: GEMINI_MODEL,
    timestamp: new Date().toISOString(),
  })).setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════
// WEB APP ENTRY POINT
// ═══════════════════════════════════════════════════════════

function doPost(e) {
  var startMs = Date.now();
  var jobId = null;
  var supabaseUrl = null;
  var supabaseKey = null;

  try {
    log_("═══ doPost ENTRY ═══");

    // ── Parse input ──
    var raw = e.postData.contents;
    log_("Raw payload length: " + raw.length);

    var json = JSON.parse(raw);
    jobId = (json.job_id || "").trim();   // ← .trim() to sanitize
    var imageUrls = json.image_urls;

    // ── Credential resolution: payload → Script Properties fallback ──
    var config = getConfig_();
    supabaseUrl = (json.supabase_url || config.supabaseUrl || "").trim();
    supabaseKey = (json.supabase_key || config.supabaseKey || "").trim();

    log_("job_id: " + jobId);
    log_("job_id length: " + jobId.length);
    log_("images: " + (imageUrls ? imageUrls.length : "MISSING"));
    log_("supabase_url: " + (supabaseUrl ? supabaseUrl.substring(0, 50) : "MISSING"));
    log_("supabase_key: " + (supabaseKey ? "present (" + supabaseKey.length + " chars)" : "MISSING"));
    log_("credential source: url=" + (json.supabase_url ? "payload" : "script_props") +
         ", key=" + (json.supabase_key ? "payload" : "script_props"));

    if (!jobId) throw new Error("job_id is empty or missing");
    if (!imageUrls || !imageUrls.length) throw new Error("image_urls is empty or missing");
    if (!supabaseUrl) throw new Error("supabase_url is empty — check payload AND Script Properties");
    if (!supabaseKey) throw new Error("supabase_key is empty — check payload AND Script Properties");

    // ── 1. Download images & convert to Base64 ──
    var imageParts = [];
    for (var i = 0; i < imageUrls.length; i++) {
      log_("Downloading image " + (i + 1) + ": " + imageUrls[i].substring(0, 80) + "...");
      var img = downloadImageAsBase64_(imageUrls[i]);
      imageParts.push(img);
      log_("Downloaded image " + (i + 1) + ": " + img.sizeKb + " KB, " + img.mimeType);
    }

    // ── 2. Save copies to Google Drive (archive) ──
    log_("Saving to Drive folder: " + config.driveFolderId);
    var folder = DriveApp.getFolderById(config.driveFolderId);
    for (var j = 0; j < imageParts.length; j++) {
      var bytes = Utilities.base64Decode(imageParts[j].base64);
      var blob = Utilities.newBlob(bytes, imageParts[j].mimeType, jobId + "_" + j + ".webp");
      folder.createFile(blob);
    }
    log_("Saved " + imageParts.length + " image(s) to Drive");

    // ── 3. Call Gemini 2.0 Flash ──
    log_("Calling Gemini " + GEMINI_MODEL + "...");
    var geminiResult = callGemini_(imageParts, config.geminiApiKey);
    log_("Gemini OK, response JSON length: " + JSON.stringify(geminiResult).length);

    // ── 4. Post-process ──
    log_("Post-processing...");
    var processed = validateAndPostProcess_(geminiResult);
    log_("Post-processing done: " + processed.line_items.length + " items");

    // ── 5. Write result to Supabase ──
    var durationMs = Date.now() - startMs;
    log_("Writing result to Supabase...");
    updateSupabaseJob_(supabaseUrl, supabaseKey, jobId, {
      status: "completed",
      result: processed,
      model: GEMINI_MODEL,
      ocr_text: null,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
    });

    log_("═══ JOB COMPLETED: " + jobId + " in " + durationMs + "ms ═══");

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      job_id: jobId,
      duration_ms: durationMs,
      line_items: processed.line_items.length,
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    var errMsg = err.toString();
    var errStack = err.stack || "no stack";
    logError_(errMsg);
    logError_("Stack: " + errStack);
    logError_("Duration: " + (Date.now() - startMs) + "ms");

    // ── LOG-TO-DB: Write debugLog to receipt_jobs.error column ──
    // This is our ONLY reliable way to see what happened
    if (jobId && supabaseUrl && supabaseKey) {
      var debugDump = debugLog.join("\n");
      try {
        rawPatchSupabase_(supabaseUrl, supabaseKey, jobId, {
          status: "failed",
          error: debugDump,
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startMs,
        });
        log_("Debug dump written to Supabase OK");
      } catch (patchErr) {
        logError_("DOUBLE FAULT — cannot write to Supabase: " + patchErr.toString());
      }
    } else {
      logError_("Cannot write to DB — missing: jobId=" + !!jobId +
                ", url=" + !!supabaseUrl + ", key=" + !!supabaseKey);
    }

    // ── HARDCORE THROW: Force GAS to show error text in Executions list ──
    // Google shows throw message on hover even when logs are broken
    throw new Error("DEBUG_DATA:" + debugLog.join("|"));
  }
}

// ═══════════════════════════════════════════════════════════
// IMAGE DOWNLOAD
// ═══════════════════════════════════════════════════════════

function downloadImageAsBase64_(url) {
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    throw new Error("Image download failed (" + response.getResponseCode() + "): " + url.substring(0, 80));
  }
  var blob = response.getBlob();
  var base64 = Utilities.base64Encode(blob.getBytes());
  var mimeType = blob.getContentType() || "image/jpeg";
  return {
    base64: base64,
    mimeType: mimeType,
    sizeKb: Math.round(blob.getBytes().length / 1024),
  };
}

// ═══════════════════════════════════════════════════════════
// GEMINI 2.0 FLASH — VISION API
// ═══════════════════════════════════════════════════════════

function callGemini_(imageParts, apiKey) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + apiKey;

  var parts = [
    { text: SYSTEM_PROMPT },
    { text: "This is a very long receipt. Process it step-by-step but fast. Accuracy of sums is top priority. First identify the 3 zones (Header, Item Grid, Footer). For EACH product row: read the Thai text first (original_name), then translate (translated_name). STOP at the Footer. Return structured JSON." },
  ];

  for (var i = 0; i < imageParts.length; i++) {
    parts.push({
      inlineData: {
        mimeType: imageParts[i].mimeType,
        data: imageParts[i].base64,
      }
    });
  }

  var payload = {
    contents: [{ parts: parts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: 4096,
    },
  };

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  log_("Gemini HTTP " + code);

  if (code !== 200) {
    throw new Error("Gemini API error " + code + ": " + response.getContentText().substring(0, 500));
  }

  var geminiResponse = JSON.parse(response.getContentText());
  var content = "";
  try {
    content = geminiResponse.candidates[0].content.parts[0].text;
  } catch (ex) {
    throw new Error("Bad Gemini response structure: " + JSON.stringify(geminiResponse).substring(0, 500));
  }

  if (!content) throw new Error("Empty Gemini response");
  log_("Gemini text length: " + content.length);

  return JSON.parse(content);
}

// ═══════════════════════════════════════════════════════════
// SUPABASE REST API — PATCH receipt_jobs (with full verification)
// ═══════════════════════════════════════════════════════════

function updateSupabaseJob_(supabaseUrl, supabaseKey, jobId, data) {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("FATAL: Missing Supabase credentials! url=" + !!supabaseUrl + ", key=" + !!supabaseKey);
  }

  var url = supabaseUrl + "/rest/v1/receipt_jobs?id=eq." + jobId;

  log_("PATCH URL: " + url);
  log_("PATCH payload keys: " + Object.keys(data).join(", "));

  var options = {
    method: "post",
    headers: {
      "Authorization": "Bearer " + supabaseKey,
      "apikey": supabaseKey,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      "X-HTTP-Method-Override": "PATCH",
    },
    payload: JSON.stringify(data),
    muteHttpExceptions: true,
  };

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var body = response.getContentText();

  log_("PATCH response code: " + code);
  log_("PATCH response body (first 500): " + body.substring(0, 500));

  // ── 204 = PostgREST ignored return=representation ──
  if (code === 204) {
    throw new Error(
      "PATCH 204 No Content — return=representation IGNORED. " +
      "Likely X-HTTP-Method-Override not working. job_id=" + jobId
    );
  }

  // ── 200 = verify rows were actually returned ──
  if (code === 200) {
    var rows;
    try { rows = JSON.parse(body); } catch (pe) {
      throw new Error("PATCH 200 but body not JSON: " + body.substring(0, 300));
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(
        "PATCH 200 but EMPTY [] — job_id=" + jobId + " not found in receipt_jobs!"
      );
    }
    log_("PATCH VERIFIED: " + rows.length + " row(s), status=" + rows[0].status);
    return;
  }

  // ── Any other code ──
  throw new Error("Supabase PATCH HTTP " + code + ": " + body.substring(0, 500));
}

// ═══════════════════════════════════════════════════════════
// RAW PATCH — minimal, no verification, for writing debugLog
// Uses standard PATCH method (not POST+override) as fallback
// ═══════════════════════════════════════════════════════════

function rawPatchSupabase_(supabaseUrl, supabaseKey, jobId, data) {
  var url = supabaseUrl + "/rest/v1/receipt_jobs?id=eq." + jobId;

  // Attempt 1: POST + X-HTTP-Method-Override
  var options1 = {
    method: "post",
    headers: {
      "Authorization": "Bearer " + supabaseKey,
      "apikey": supabaseKey,
      "Content-Type": "application/json",
      "Prefer": "return=minimal",
      "X-HTTP-Method-Override": "PATCH",
    },
    payload: JSON.stringify(data),
    muteHttpExceptions: true,
  };

  var r1 = UrlFetchApp.fetch(url, options1);
  var c1 = r1.getResponseCode();
  log_("rawPatch attempt1 (POST+override): HTTP " + c1);

  if (c1 >= 200 && c1 < 300) return;

  // Attempt 2: native PATCH method
  var options2 = {
    method: "patch",
    headers: {
      "Authorization": "Bearer " + supabaseKey,
      "apikey": supabaseKey,
      "Content-Type": "application/json",
      "Prefer": "return=minimal",
    },
    payload: JSON.stringify(data),
    muteHttpExceptions: true,
  };

  var r2 = UrlFetchApp.fetch(url, options2);
  var c2 = r2.getResponseCode();
  log_("rawPatch attempt2 (native PATCH): HTTP " + c2);

  if (c2 >= 200 && c2 < 300) return;

  throw new Error("rawPatch BOTH methods failed: attempt1=" + c1 + ", attempt2=" + c2 +
                  ", body1=" + r1.getContentText().substring(0, 200) +
                  ", body2=" + r2.getContentText().substring(0, 200));
}

// ═══════════════════════════════════════════════════════════
// POST-PROCESSING PIPELINE
// Ported from parse-receipts/index.ts (Phase 4.13+)
// ═══════════════════════════════════════════════════════════

var FOOTER_RE = /^(total|subtotal|grand\s*total|net|net\s*total|vat|tax|discount|change|cash|card|credit|debit|points|member|bag\s*fee|rounding|round|ส่วนลด|ภาษี|ภาษีมูลค่าเพิ่ม|เงินทอน|เงินสด|รวม|ยอดรวม|ยอดสุทธิ|สุทธิ|บัตร|แต้ม|คูปอง|ทอน|เศษสตางค์)$/i;

var VALID_UNITS = { "kg": true, "L": true, "pcs": true };
var VALID_CATEGORIES = { "food": true, "capex": true, "opex": true, "uncategorized": true };

function validateAndPostProcess_(parsed) {
  var warnings = [];

  if (typeof parsed.supplier_name !== "string") {
    parsed.supplier_name = String(parsed.supplier_name || "Unknown");
    warnings.push("supplier_name coerced");
  }
  if (parsed.invoice_number !== null && typeof parsed.invoice_number !== "string") {
    parsed.invoice_number = parsed.invoice_number ? String(parsed.invoice_number) : null;
  }
  if (typeof parsed.total_amount !== "number") {
    parsed.total_amount = Number(parsed.total_amount) || 0;
    warnings.push("total_amount coerced");
  }
  if (typeof parsed.currency !== "string") {
    parsed.currency = "THB";
  }
  if (typeof parsed.transaction_date !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(parsed.transaction_date)) {
    warnings.push("transaction_date invalid: " + parsed.transaction_date);
  }

  if (!Array.isArray(parsed.line_items)) {
    parsed.line_items = [];
    warnings.push("line_items was not an array");
  }

  for (var i = 0; i < parsed.line_items.length; i++) {
    var li = parsed.line_items[i];
    if (typeof li.line_number !== "number") li.line_number = i + 1;
    if (li.supplier_sku !== null && typeof li.supplier_sku !== "string") {
      li.supplier_sku = li.supplier_sku ? String(li.supplier_sku) : null;
    }
    if (typeof li.original_name !== "string" || !li.original_name.trim()) {
      li.original_name = li.translated_name || "[ITEM " + (i + 1) + "]";
      warnings.push("line_items[" + i + "].original_name missing");
    }
    if (typeof li.translated_name !== "string" || !li.translated_name.trim()) {
      li.translated_name = li.original_name || "[ITEM " + (i + 1) + "]";
      warnings.push("line_items[" + i + "].translated_name missing");
    }
    if (typeof li.quantity !== "number") li.quantity = Number(li.quantity) || 1;
    if (typeof li.unit_price !== "number") li.unit_price = Number(li.unit_price) || 0;
    if (typeof li.total_price !== "number") li.total_price = Number(li.total_price) || 0;
    if (!VALID_UNITS[li.unit]) {
      warnings.push("line_items[" + i + "].unit " + li.unit + " → pcs");
      li.unit = "pcs";
    }
    if (!VALID_CATEGORIES[li.category]) {
      warnings.push("line_items[" + i + "].category " + li.category + " → uncategorized");
      li.category = "uncategorized";
    }
  }

  if (!parsed.documents || typeof parsed.documents !== "object") {
    parsed.documents = { tax_invoice_index: null, supplier_receipt_index: null, bank_slip_index: null };
    warnings.push("documents missing");
  } else {
    var docKeys = ["tax_invoice_index", "supplier_receipt_index", "bank_slip_index"];
    for (var d = 0; d < docKeys.length; d++) {
      if (parsed.documents[docKeys[d]] !== null && typeof parsed.documents[docKeys[d]] !== "number") {
        parsed.documents[docKeys[d]] = null;
      }
    }
  }

  // ── Strip footer items ──
  var preFilterCount = parsed.line_items.length;
  parsed.line_items = parsed.line_items.filter(function(li) {
    var name = (li.translated_name || "").trim();
    return name.length > 0 && !FOOTER_RE.test(name);
  });
  var stripped = preFilterCount - parsed.line_items.length;
  if (stripped > 0) {
    log_("FOOTER_RE stripped " + stripped + " non-product items");
  }

  // ── Repetition loop detection ──
  if (parsed.line_items.length > 3) {
    var nameCounts = {};
    for (var r = 0; r < parsed.line_items.length; r++) {
      var name = (parsed.line_items[r].original_name || "").trim();
      nameCounts[name] = (nameCounts[name] || 0) + 1;
    }
    var maxCount = 0;
    var maxName = "";
    for (var key in nameCounts) {
      if (nameCounts[key] > maxCount) {
        maxCount = nameCounts[key];
        maxName = key;
      }
    }
    if (maxCount > parsed.line_items.length * 0.5) {
      log_("REPETITION LOOP: '" + maxName + "' repeated " + maxCount + "/" + parsed.line_items.length);
      var seen = {};
      parsed.line_items = parsed.line_items.filter(function(li) {
        var n = (li.original_name || "").trim();
        if (seen[n]) return false;
        seen[n] = true;
        return true;
      });
      parsed._repetition_loop = {
        detected: true,
        duplicates_removed: preFilterCount - stripped - parsed.line_items.length,
        warning: "AI model entered a repetition loop. Duplicates were removed.",
      };
    }
  }

  // ── Sum validation ──
  var lineSum = 0;
  for (var s = 0; s < parsed.line_items.length; s++) {
    lineSum += (parsed.line_items[s].total_price || 0);
  }
  var declared = parsed.total_amount || 0;
  if (Math.abs(lineSum - declared) > 1) {
    parsed._sum_mismatch = {
      line_items_sum: Math.round(lineSum * 100) / 100,
      declared_total: declared,
      difference: Math.round((declared - lineSum) * 100) / 100,
    };
  }

  parsed._pipeline = {
    engine: GEMINI_MODEL,
    runtime: "google-apps-script",
  };

  if (warnings.length > 0) {
    parsed._schema_warnings = warnings;
  }

  // ── Legacy 3-array format (backward compat) ──
  parsed.food_items = parsed.line_items
    .filter(function(li) { return li.category === "food"; })
    .map(function(li) {
      return {
        name: li.translated_name || li.original_name || "",
        quantity: li.quantity || 0,
        unit: li.unit || "pcs",
        unit_price: li.unit_price || 0,
        total_price: li.total_price || 0,
        supplier_sku: li.supplier_sku || null,
        original_name: li.original_name || null,
      };
    });

  parsed.capex_items = parsed.line_items
    .filter(function(li) { return li.category === "capex"; })
    .map(function(li) {
      return {
        name: li.translated_name || li.original_name || "",
        quantity: li.quantity || 0,
        unit_price: li.unit_price || 0,
        total_price: li.total_price || 0,
      };
    });

  parsed.opex_items = parsed.line_items
    .filter(function(li) { return li.category === "opex" || li.category === "uncategorized"; })
    .map(function(li) {
      return {
        description: li.translated_name || li.original_name || "",
        quantity: li.quantity || 0,
        unit: li.unit || "pcs",
        unit_price: li.unit_price || 0,
        total_price: li.total_price || 0,
      };
    });

  log_(
    "OK: " + parsed.supplier_name +
    ", lines=" + parsed.line_items.length +
    ", food=" + parsed.food_items.length +
    ", capex=" + parsed.capex_items.length +
    ", opex=" + parsed.opex_items.length +
    ", sum=" + lineSum + ", declared=" + declared +
    (parsed._sum_mismatch ? " MISMATCH:" + parsed._sum_mismatch.difference : " MATCH")
  );

  return parsed;
}

// ═══════════════════════════════════════════════════════════
// SYSTEM PROMPT — Thai receipt parsing rules (Phase 4.13+)
// ═══════════════════════════════════════════════════════════

var SYSTEM_PROMPT = 'You are a receipt digitizer for Shishka Healthy Kitchen (restaurant in Thailand).\n\
\n\
YOUR #1 RULE: Extract ONLY real purchased products from the ITEM GRID zone. NEVER include receipt metadata (totals, taxes, discounts, change). NEVER invent products you cannot clearly read.\n\
\n\
## RECEIPT ANATOMY — 3 ZONES\n\
Every receipt has exactly 3 zones. Identify them BEFORE extracting:\n\
\n\
ZONE 1 — HEADER (metadata only):\n\
  Store name, address, Tax ID, date, receipt number\n\
  → Extract: supplier_name, transaction_date, invoice_number\n\
\n\
ZONE 2 — ITEM GRID (extract products ONLY from here):\n\
  SKU | Product Name (Thai) | Qty | Unit Price | Total Price\n\
  → Extract: each row as a line_item\n\
\n\
ZONE 3 — FOOTER (total only):\n\
  Starts at first line containing: รวม, ยอดรวม, Subtotal, Total, ส่วนลด, Discount, VAT, ภาษี, สุทธิ, Net\n\
  Everything at and below = NOT products.\n\
  → Extract: total_amount (final amount paid)\n\
\n\
## BLACKLIST — NEVER add as line_items\n\
Total, Subtotal, Grand Total, Net, VAT, Tax, Discount, Change, Cash, Card, Credit, Debit, Points, Member, Bag fee, Rounding,\n\
รวม, ยอดรวม, ยอดสุทธิ, สุทธิ, ภาษี, ภาษีมูลค่าเพิ่ม, ส่วนลด, เงินสด, เงินทอน, ทอน, บัตร, แต้ม, คูปอง, เศษสตางค์\n\
\n\
## ANCHORING RULE (CRITICAL — prevents repetition loops)\n\
For EACH item row, you MUST:\n\
1. FIRST read the EXACT Thai text from the receipt image → put into original_name\n\
2. THEN translate that Thai text into English → put into translated_name\n\
3. Each item\'s original_name MUST be UNIQUE — real receipts never have 2+ identical product names\n\
4. If you notice you are writing the same original_name twice → STOP, re-read the image carefully\n\
5. If you cannot read the text clearly → set translated_name to "[UNREADABLE]", do NOT copy a previous item\n\
\n\
## MANDATORY SKU EXTRACTION\n\
Makro items have a 6-13 digit item code. Extract into supplier_sku.\n\
If no SKU found → set supplier_sku to null.\n\
\n\
## TRANSLATION RULES (CEO cannot read Thai)\n\
Translate Thai → English with MAXIMUM specificity:\n\
- น้ำมันดอกทานตะวัน → "Sunflower oil" (NOT "Vegetable oil")\n\
- น้ำมันรำข้าว → "Rice bran oil" (NOT "Vegetable oil")\n\
- น้ำมันปาล์ม → "Palm oil" (NOT "Vegetable oil")\n\
- น้ำมันมะกอก → "Olive oil" (NOT "Vegetable oil")\n\
- น้ำมันพืช → "Vegetable oil" (only THIS one is generic)\n\
- น้ำมันถั่วเหลือง → "Soybean oil" (NOT "Vegetable oil")\n\
- หมูสับ → "Minced pork" (NOT "Pork")\n\
- อกไก่ → "Chicken breast" (NOT "Chicken")\n\
- กุ้งขาว → "White shrimp" (NOT "Shrimp")\n\
- ไข่ไก่ → "Chicken eggs" (NOT "Eggs")\n\
- ไข่เป็ด → "Duck eggs" (NOT "Eggs")\n\
- แป้งข้าวเจ้า → "Rice flour" (NOT "Flour")\n\
- แป้งสาลี → "Wheat flour" (NOT "Flour")\n\
- น้ำตาลทราย → "Granulated sugar" (NOT "Sugar")\n\
- น้ำตาลมะพร้าว → "Coconut sugar" (NOT "Sugar")\n\
- เต้าหู้ → "Tofu"\n\
- วุ้นเส้น → "Glass noodles"\n\
- เส้นหมี่ → "Rice vermicelli"\n\
- กะเพรา → "Holy basil" (NOT "Basil")\n\
- โหระพา → "Sweet basil" (NOT "Basil")\n\
- Keep translated_name CLEAN — no weight, quantity, or packaging info in the name\n\
Do NOT transliterate Thai to Latin characters. TRANSLATE the meaning.\n\
Brand names: describe the product (e.g., "Chicken eggs (ARO)").\n\
\n\
## CATEGORY RULES — AUTO-DETECT FROM SUPPLIER\n\
First, identify the supplier from the header:\n\
- Makro, Lotus\'s, Big C, ตลาด (market), Fresh mart → default category = "food"\n\
- HomePro, Thai Watsadu, Global House, Do Home → default category = "capex"\n\
- Office Mate, B2S, 7-Eleven, convenience stores → default category = "opex"\n\
\n\
Then override per-item using these rules:\n\
- "food": raw ingredients, produce, proteins, grains, dairy, spices, sauces, oils, eggs, flour, sugar, noodles\n\
- "capex": equipment, machinery, furniture, hardware — assets with life > 1 year\n\
- "opex": cleaning, packaging, disposables, office supplies, plastic bags, delivery fees\n\
- "uncategorized": items you cannot confidently classify\n\
\n\
## UNIT NORMALIZATION (only 3 valid values)\n\
- "kg" (g÷1000, กก.=kg, กรัม÷1000)\n\
- "L" (ml÷1000, ลิตร=L, ซีซี÷1000)\n\
- "pcs" (ชิ้น, อัน, ลูก, ขวด, กล่อง, ถุง, แพ็ค)\n\
- "1 bag 500g" → quantity=0.5, unit="kg"\n\
\n\
## OUTPUT SCHEMA\n\
Return ONLY valid JSON with this structure:\n\
{\n\
  "supplier_name": "string",\n\
  "invoice_number": "string or null",\n\
  "total_amount": number,\n\
  "currency": "THB",\n\
  "transaction_date": "YYYY-MM-DD",\n\
  "line_items": [\n\
    {\n\
      "line_number": 1,\n\
      "supplier_sku": "string or null",\n\
      "original_name": "exact Thai text from receipt",\n\
      "translated_name": "English translation",\n\
      "quantity": number,\n\
      "unit": "kg" | "L" | "pcs",\n\
      "unit_price": number,\n\
      "total_price": number,\n\
      "category": "food" | "capex" | "opex" | "uncategorized"\n\
    }\n\
  ],\n\
  "documents": {\n\
    "tax_invoice_index": number or null,\n\
    "supplier_receipt_index": number or null,\n\
    "bank_slip_index": number or null\n\
  }\n\
}\n\
\n\
## DOCUMENT CLASSIFICATION\n\
- tax_invoice_index: image with Tax ID, VAT breakdown\n\
- supplier_receipt_index: POS receipt or itemized receipt\n\
- bank_slip_index: bank transfer slip\n\
- One document can be BOTH receipt AND tax invoice — set SAME index\n\
- If a type is absent, set to null\n\
\n\
## MULTI-IMAGE RULES\n\
- If exactly 2 images are provided, they are likely the SAME receipt (front/back). Combine all items into one list.\n\
- If more images are provided, they may be consecutive parts of one long receipt. Combine into one unified item list.\n\
- Track item continuity across images — do NOT duplicate items that appear in overlap zones.\n\
\n\
transaction_date must come from the receipt — NEVER use today\'s date.';
