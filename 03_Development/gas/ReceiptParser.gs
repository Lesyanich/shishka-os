// ═══════════════════════════════════════════════════════════
// Google Apps Script: ReceiptParser
// Phase 5.0f: Edge Function Callback Edition
// ═══════════════════════════════════════════════════════════
// ROOT CAUSE FOUND: GAS raw HTTP PATCH to PostgREST returns
// 200 [] (empty) because RLS blocks writes. The service role
// key is NOT recognized as a JWT by PostgREST in newer
// Supabase projects (sb_publishable_ key format).
//
// FIX: ALL DB writes now go through update-receipt-job Edge
// Function which uses createClient() admin — properly
// bypasses RLS. No more raw PostgREST calls from GAS.
//
// Every step phones home via Edge Function. If the script
// dies at any point, we see exactly where in the DB.
// ═══════════════════════════════════════════════════════════
// SETUP:
//   1. Script Properties (Settings → Script Properties):
//      - GEMINI_API_KEY
//      - DRIVE_FOLDER_ID = 1KUDflDuCkJL3rG0ldNGUqJW_rOErNGZi
//   2. Deploy as Web App: Execute as "Me", Access "Anyone"
//   3. Edge Function update-receipt-job must be deployed
//      with --no-verify-jwt
// ═══════════════════════════════════════════════════════════

var GEMINI_MODEL = "gemini-2.5-flash";

// ── Debug log accumulator ──
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
  };
}

// ═══════════════════════════════════════════════════════════
// UPDATE JOB — via Edge Function (bypasses RLS)
// Replaces all raw PostgREST PATCH calls.
// Uses POST to update-receipt-job Edge Function which has
// --no-verify-jwt and uses admin client internally.
// ═══════════════════════════════════════════════════════════
function updateJob_(supabaseUrl, jobId, data) {
  var url = supabaseUrl + "/functions/v1/update-receipt-job?job_id=" + encodeURIComponent(jobId);
  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(data),
    muteHttpExceptions: true,
  });
  var code = response.getResponseCode();
  var body = response.getContentText();
  log_("updateJob_ HTTP " + code + ": " + body.substring(0, 300));

  if (code === 200) {
    var result = JSON.parse(body);
    if (result.ok && result.rows_updated > 0) {
      log_("updateJob_ VERIFIED: " + result.rows_updated + " row(s)");
      return result;
    }
    // 200 but 0 rows — job_id not found
    throw new Error("updateJob_ 200 but 0 rows updated. job_id=" + jobId + ", response=" + body.substring(0, 300));
  }

  throw new Error("updateJob_ HTTP " + code + ": " + body.substring(0, 500));
}

// ── Phone Home — quick status write via Edge Function ──
function phoneHome_(supabaseUrl, jobId, message) {
  try {
    var url = supabaseUrl + "/functions/v1/update-receipt-job?job_id=" + encodeURIComponent(jobId);
    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ error: message }),
      muteHttpExceptions: true,
    });
    return response.getResponseCode();
  } catch (e) {
    logError_("phoneHome_ crash: " + e.toString());
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════
// doGet — placeholder to stop red "Failed" noise
// ═══════════════════════════════════════════════════════════
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "alive",
    model: GEMINI_MODEL,
    timestamp: new Date().toISOString(),
  })).setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════
// WEB APP ENTRY POINT — EDGE FUNCTION CALLBACK EDITION
// Every step independently phones home to DB via Edge Function
// ═══════════════════════════════════════════════════════════
function doPost(e) {
  var startMs = Date.now();
  var jobId = null;
  var supabaseUrl = null;
  var imageUrls = null;
  var config = null;

  // ═══════════════════════════════════════════════════════
  // STEP 0: Parse payload
  // ═══════════════════════════════════════════════════════
  try {
    log_("═══ doPost ENTRY ═══");
    var raw = e.postData.contents;
    log_("Raw payload length: " + raw.length);

    var json = JSON.parse(raw);
    jobId = (json.job_id || "").trim();
    imageUrls = json.image_urls;
    supabaseUrl = (json.supabase_url || "").trim();

    config = getConfig_();

    log_("job_id: " + jobId + " (len=" + jobId.length + ")");
    log_("images: " + (imageUrls ? imageUrls.length : "MISSING"));
    log_("supabase_url: " + (supabaseUrl ? supabaseUrl.substring(0, 50) : "MISSING"));

    if (!jobId) throw new Error("job_id is empty or missing");
    if (!imageUrls || !imageUrls.length) throw new Error("image_urls is empty or missing");
    if (!supabaseUrl) throw new Error("supabase_url is empty");
  } catch (parseErr) {
    logError_("STEP_0 PARSE FAIL: " + parseErr.toString());
    if (jobId && supabaseUrl) {
      try { phoneHome_(supabaseUrl, jobId, "STEP_0 PARSE FAIL: " + parseErr.toString()); } catch(x) {}
    }
    return ContentService.createTextOutput(JSON.stringify({
      error: "STEP_0: " + parseErr.toString(),
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ═══════════════════════════════════════════════════════
  // STEP 1: AUTH TEST — phone home via Edge Function
  // If this fails, Edge Function callback is broken
  // ═══════════════════════════════════════════════════════
  try {
    var authMsg = "STEP_1: GAS alive. images=" + imageUrls.length +
                  ", ts=" + new Date().toISOString();
    var authCode = phoneHome_(supabaseUrl, jobId, authMsg);
    log_("STEP_1 phone home HTTP " + authCode);

    if (authCode !== 200) {
      var failMsg = "STEP_1 AUTH FAIL: Edge Function callback returned HTTP " + authCode +
                    ". supabase_url=" + supabaseUrl;
      logError_(failMsg);
      return ContentService.createTextOutput(JSON.stringify({
        error: failMsg,
      })).setMimeType(ContentService.MimeType.JSON);
    }
    log_("STEP_1 phone home OK — Edge Function callback works!");
  } catch (authErr) {
    logError_("STEP_1 CRASH: " + authErr.toString());
    return ContentService.createTextOutput(JSON.stringify({
      error: "STEP_1 CRASH: " + authErr.toString(),
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ═══════════════════════════════════════════════════════
  // STEP 2: Download images
  // ═══════════════════════════════════════════════════════
  var imageParts = [];
  try {
    for (var i = 0; i < imageUrls.length; i++) {
      log_("Downloading image " + (i + 1) + ": " + imageUrls[i].substring(0, 80) + "...");
      var img = downloadImageAsBase64_(imageUrls[i]);
      imageParts.push(img);
      log_("Downloaded image " + (i + 1) + ": " + img.sizeKb + " KB, " + img.mimeType);
    }
    phoneHome_(supabaseUrl, jobId,
      "STEP_2: Images OK. count=" + imageParts.length +
      ", sizes=" + imageParts.map(function(p) { return p.sizeKb + "KB"; }).join("+"));
  } catch (dlErr) {
    var dlMsg = "STEP_2 IMAGE FAIL: " + dlErr.toString() +
                " | downloaded=" + imageParts.length + "/" + imageUrls.length;
    logError_(dlMsg);
    try {
      updateJob_(supabaseUrl, jobId, {
        status: "failed", error: dlMsg + "\n\nDEBUG:\n" + debugLog.join("\n"),
        completed_at: new Date().toISOString(), duration_ms: Date.now() - startMs,
      });
    } catch(x) {
      try { phoneHome_(supabaseUrl, jobId, dlMsg); } catch(y) {}
    }
    return ContentService.createTextOutput(JSON.stringify({ error: dlMsg })).setMimeType(ContentService.MimeType.JSON);
  }

  // ═══════════════════════════════════════════════════════
  // STEP 3: Save to Google Drive (archive) — non-fatal
  // ═══════════════════════════════════════════════════════
  try {
    log_("Saving to Drive folder: " + config.driveFolderId);
    var folder = DriveApp.getFolderById(config.driveFolderId);
    for (var j = 0; j < imageParts.length; j++) {
      var bytes = Utilities.base64Decode(imageParts[j].base64);
      var blob = Utilities.newBlob(bytes, imageParts[j].mimeType, jobId + "_" + j + ".webp");
      folder.createFile(blob);
    }
    log_("Saved " + imageParts.length + " image(s) to Drive");
    phoneHome_(supabaseUrl, jobId, "STEP_3: Drive OK. " + imageParts.length + " files");
  } catch (driveErr) {
    logError_("STEP_3 DRIVE FAIL (non-fatal): " + driveErr.toString());
    try { phoneHome_(supabaseUrl, jobId, "STEP_3: Drive FAIL (continuing): " + driveErr.toString().substring(0, 200)); } catch(x) {}
  }

  // ═══════════════════════════════════════════════════════
  // STEP 4: Call Gemini 2.0 Flash
  // ═══════════════════════════════════════════════════════
  var geminiResult = null;
  try {
    log_("Calling Gemini " + GEMINI_MODEL + "...");
    phoneHome_(supabaseUrl, jobId, "STEP_4: Calling Gemini " + GEMINI_MODEL + "...");
    geminiResult = callGemini_(imageParts, config.geminiApiKey);
    var geminiJson = JSON.stringify(geminiResult);
    log_("Gemini OK, response length: " + geminiJson.length);
    phoneHome_(supabaseUrl, jobId, "STEP_4: Gemini OK. response_len=" + geminiJson.length);
  } catch (gemErr) {
    var gemMsg = "STEP_4 GEMINI FAIL: " + gemErr.toString();
    logError_(gemMsg);
    try {
      updateJob_(supabaseUrl, jobId, {
        status: "failed", error: gemMsg + "\n\nDEBUG:\n" + debugLog.join("\n"),
        completed_at: new Date().toISOString(), duration_ms: Date.now() - startMs,
      });
    } catch(x) {
      try { phoneHome_(supabaseUrl, jobId, gemMsg); } catch(y) {}
    }
    return ContentService.createTextOutput(JSON.stringify({ error: gemMsg })).setMimeType(ContentService.MimeType.JSON);
  }

  // ═══════════════════════════════════════════════════════
  // STEP 5: Post-process
  // ═══════════════════════════════════════════════════════
  var processed = null;
  try {
    log_("Post-processing...");
    processed = validateAndPostProcess_(geminiResult);
    log_("Post-processing done: " + processed.line_items.length + " items");
    phoneHome_(supabaseUrl, jobId, "STEP_5: PostProcess OK. items=" + processed.line_items.length);
  } catch (ppErr) {
    var ppMsg = "STEP_5 POSTPROCESS FAIL: " + ppErr.toString();
    logError_(ppMsg);
    try {
      updateJob_(supabaseUrl, jobId, {
        status: "failed", error: ppMsg + "\n\nDEBUG:\n" + debugLog.join("\n"),
        completed_at: new Date().toISOString(), duration_ms: Date.now() - startMs,
      });
    } catch(x) {
      try { phoneHome_(supabaseUrl, jobId, ppMsg); } catch(y) {}
    }
    return ContentService.createTextOutput(JSON.stringify({ error: ppMsg })).setMimeType(ContentService.MimeType.JSON);
  }

  // ═══════════════════════════════════════════════════════
  // STEP 6: Write final result via Edge Function callback
  // ═══════════════════════════════════════════════════════
  try {
    var durationMs = Date.now() - startMs;
    log_("STEP_6: Writing final result...");
    updateJob_(supabaseUrl, jobId, {
      status: "completed",
      result: processed,
      model: GEMINI_MODEL,
      ocr_text: null,
      error: null,
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

  } catch (finalErr) {
    var finalMsg = "STEP_6 FINAL WRITE FAIL: " + finalErr.toString();
    logError_(finalMsg);
    try { phoneHome_(supabaseUrl, jobId, finalMsg + " | items=" + processed.line_items.length + " | result_size=" + JSON.stringify(processed).length); } catch(x) {}
    // Try simpler write without result
    try {
      updateJob_(supabaseUrl, jobId, {
        status: "failed",
        error: finalMsg + "\n\nDEBUG:\n" + debugLog.join("\n"),
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startMs,
      });
    } catch(x2) {}
    return ContentService.createTextOutput(JSON.stringify({ error: finalMsg })).setMimeType(ContentService.MimeType.JSON);
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
      maxOutputTokens: 65536,
      // Gemini 2.5 Flash: disable "thinking" for clean JSON output
      thinkingConfig: { thinkingBudget: 0 },
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

  try {
    return JSON.parse(content);
  } catch (parseErr) {
    // Log raw text for debugging malformed JSON
    log_("RAW GEMINI TEXT (first 500): " + content.substring(0, 500));
    log_("RAW GEMINI TEXT (last 200): " + content.substring(Math.max(0, content.length - 200)));
    throw parseErr;
  }
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

  // ── Footer validation & reconciliation ──
  if (!parsed.footer || typeof parsed.footer !== "object") {
    parsed.footer = {
      subtotal: 0,
      discount_total: 0,
      vat_amount: 0,
      grand_total: parsed.total_amount || 0,
    };
    warnings.push("footer object missing — reconstructed from total_amount");
  } else {
    parsed.footer.subtotal = Number(parsed.footer.subtotal) || 0;
    parsed.footer.discount_total = Number(parsed.footer.discount_total) || 0;
    parsed.footer.vat_amount = Number(parsed.footer.vat_amount) || 0;
    parsed.footer.grand_total = Number(parsed.footer.grand_total) || (parsed.total_amount || 0);
  }
  // Sync total_amount with footer.grand_total
  parsed.total_amount = parsed.footer.grand_total;

  var lineSum = 0;
  for (var s = 0; s < parsed.line_items.length; s++) {
    lineSum += (parsed.line_items[s].total_price || 0);
  }
  lineSum = Math.round(lineSum * 100) / 100;
  var declared = parsed.total_amount || 0;

  // Reconciliation: check if items sum ≈ footer.subtotal, and formula balances
  var footerSubtotal = parsed.footer.subtotal;
  var footerFormula = parsed.footer.subtotal + parsed.footer.discount_total + parsed.footer.vat_amount;
  footerFormula = Math.round(footerFormula * 100) / 100;

  var reconStatus = "balanced";
  if (footerSubtotal > 0 && Math.abs(lineSum - footerSubtotal) > 2) {
    reconStatus = "items_mismatch";
  }
  if (parsed.footer.grand_total > 0 && Math.abs(footerFormula - parsed.footer.grand_total) > 2) {
    reconStatus = reconStatus === "items_mismatch" ? "items_mismatch" : "footer_mismatch";
  }
  // If footer.subtotal is 0 but lineSum > 0, auto-fill subtotal from items
  if (footerSubtotal === 0 && lineSum > 0) {
    parsed.footer.subtotal = lineSum;
    warnings.push("footer.subtotal was 0, filled from items sum: " + lineSum);
  }

  parsed._reconciliation = {
    status: reconStatus,
    items_sum: lineSum,
    formula: parsed.footer.subtotal + " + (" + parsed.footer.discount_total + ") + " + parsed.footer.vat_amount + " = " + parsed.footer.grand_total,
  };

  // Legacy _sum_mismatch (keep for backward compat with existing UI)
  if (Math.abs(lineSum - declared) > 1) {
    parsed._sum_mismatch = {
      line_items_sum: lineSum,
      declared_total: declared,
      difference: Math.round((declared - lineSum) * 100) / 100,
    };
  }

  // ── Item count validation ──
  if (typeof parsed.item_count_observed === "number" && parsed.item_count_observed > 0) {
    var actualCount = parsed.line_items.length;
    if (Math.abs(actualCount - parsed.item_count_observed) > 2) {
      warnings.push("Item count mismatch: AI observed " + parsed.item_count_observed + " but extracted " + actualCount);
    }
  }

  // ── Per-item price sanity & math check ──
  for (var pc = 0; pc < parsed.line_items.length; pc++) {
    var pli = parsed.line_items[pc];
    if (!pli.confidence) pli.confidence = "high";
    if (pli.unit_price <= 0 || pli.total_price <= 0) {
      pli.confidence = "low";
      pli._warning = "Zero or negative price";
    }
    if (pli.total_price > 5000) {
      pli._warning = (pli._warning ? pli._warning + "; " : "") + "Unusually high price — may be subtotal";
    }
    var expectedPrice = Math.round(pli.unit_price * pli.quantity * 100) / 100;
    if (Math.abs(expectedPrice - pli.total_price) > 2) {
      pli._warning = (pli._warning ? pli._warning + "; " : "") +
        "Price math: " + pli.unit_price + " × " + pli.quantity + " ≠ " + pli.total_price;
    }
  }

  // ── Stricter duplicate detection ──
  var dupNameMap = {};
  for (var dn = 0; dn < parsed.line_items.length; dn++) {
    var dnKey = (parsed.line_items[dn].original_name || "").trim().toLowerCase();
    dupNameMap[dnKey] = (dupNameMap[dnKey] || 0) + 1;
  }
  for (var dupKey in dupNameMap) {
    if (dupNameMap[dupKey] > 1) {
      warnings.push("Duplicate item: '" + dupKey + "' appears " + dupNameMap[dupKey] + " times");
    }
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
ZONE 3 — FOOTER (financial summary — extract as structured data):\n\
  Starts at first line containing: รวม, ยอดรวม, Subtotal, Total, ส่วนลด, Discount, VAT, ภาษี, สุทธิ, Net\n\
  Everything at and below = NOT products.\n\
  → Extract into a "footer" object with these fields:\n\
    - subtotal: sum before discounts (รวม, Subtotal) — should equal sum of line_item prices\n\
    - discount_total: total receipt discount as NEGATIVE number (ส่วนลด, Discount, e.g., -500). 0 if no discount.\n\
    - vat_amount: VAT amount (ภาษี, VAT). 0 if VAT-inclusive pricing or no VAT shown.\n\
    - grand_total: final amount paid (ยอดสุทธิ, Net, Grand Total)\n\
  → Also set total_amount = grand_total (for backward compatibility)\n\
  → Formula: subtotal + discount_total + vat_amount = grand_total\n\
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
  "footer": {\n\
    "subtotal": number,\n\
    "discount_total": number,\n\
    "vat_amount": number,\n\
    "grand_total": number\n\
  },\n\
  "item_count_observed": number,\n\
  "line_items": [\n\
    {\n\
      "line_number": 1,\n\
      "supplier_sku": "string or null",\n\
      "original_name": "exact Thai text from receipt",\n\
      "translated_name": "English translation",\n\
      "quantity": number,\n\
      "unit": "kg" | "L" | "pcs",\n\
      "purchase_unit": "unit exactly as printed on receipt (Thai or English)",\n\
      "unit_price": number,\n\
      "total_price": number,\n\
      "category": "food" | "capex" | "opex" | "uncategorized",\n\
      "confidence": "high" | "medium" | "low"\n\
    }\n\
  ],\n\
  "documents": {\n\
    "tax_invoice_index": number or null,\n\
    "supplier_receipt_index": number or null,\n\
    "bank_slip_index": number or null\n\
  }\n\
}\n\
\n\
## ANTI-HALLUCINATION RULES\n\
\n\
1. ITEM COUNT ANCHOR: Before extracting items, COUNT the number of product rows\n\
   visible in the receipt ITEM GRID. Report this count as "item_count_observed".\n\
   Your line_items array length MUST match this count (±1 tolerance).\n\
\n\
2. CONFIDENCE SCORING: For each line_item, set "confidence":\n\
   - "high": text clearly readable, numbers parse cleanly\n\
   - "medium": some characters unclear but context helps\n\
   - "low": significant guessing involved\n\
\n\
3. UNREADABLE ITEMS: If you cannot read >50% of an item\'s name:\n\
   - Set translated_name to "[UNREADABLE]"\n\
   - Set confidence to "low"\n\
   - Still extract quantity/price if visible\n\
   - Do NOT invent a product name\n\
\n\
4. PRICE SANITY: Thai grocery items typically cost 10-2000 THB per line.\n\
   If a line_item total_price > 5000 THB, double-check — it might be a subtotal row.\n\
\n\
5. NO EXTRAPOLATION: If the receipt image is cut off or blurry at the bottom,\n\
   STOP extracting. Do not guess what items might follow.\n\
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
