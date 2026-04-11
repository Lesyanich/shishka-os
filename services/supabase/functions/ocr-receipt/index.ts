// ═══════════════════════════════════════════════════════════
// Edge Function: ocr-receipt v2 — Two-Stage Pipeline
// Stage 1: Google Cloud Vision (OCR) → raw text
// Stage 2: LLM (structure + translate) → ParsedReceipt JSON
// ═══════════════════════════════════════════════════════════
// Zero Body-Read Architecture:
//   inbox_id and model come from URL query params.
//   Images come from receipt_inbox.photo_urls in DB.
// ═══════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2"
import { SYSTEM_PROMPT, OUTPUT_SCHEMA, MODEL_PRICING, MODEL_MAP } from "./prompts.ts"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? ""
const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? ""
const googleKey = Deno.env.get("GOOGLE_API_KEY") ?? ""
const googleVisionKey = Deno.env.get("GOOGLE_API_KEY_VISAI") ?? Deno.env.get("GOOGLE_API_KEY") ?? ""

const db = createClient(supabaseUrl, supabaseKey)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}

// ═══════════════════════════════════════════════════════════
// Stage 1: Google Cloud Vision OCR
// ═══════════════════════════════════════════════════════════

function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 32768
  let binary = ""
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

async function downloadImageAsBase64(url: string): Promise<{ data: string; mediaType: string }> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Failed to download image: ${resp.status} ${url}`)
  const buf = await resp.arrayBuffer()
  const data = uint8ToBase64(new Uint8Array(buf))
  const contentType = resp.headers.get("content-type") || "image/jpeg"
  return { data, mediaType: contentType.split(";")[0].trim() }
}

async function extractTextViaGCV(imageBase64: string): Promise<string> {
  const visionKey = googleVisionKey
  if (!visionKey) throw new Error("GOOGLE_API_KEY_VISAI not configured for Vision API")

  const resp = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${visionKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBase64 },
          features: [{ type: "TEXT_DETECTION" }],
        }],
      }),
    },
  )

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Vision API ${resp.status}: ${err}`)
  }

  const body = await resp.json()
  const annotation = body.responses?.[0]
  if (annotation?.error) {
    throw new Error(`Vision API error: ${annotation.error.message}`)
  }
  return annotation?.fullTextAnnotation?.text ?? ""
}

// ═══════════════════════════════════════════════════════════
// Stage 2: LLM for structuring + translation
// ═══════════════════════════════════════════════════════════

interface ApiResult {
  text: string
  tokensIn: number
  tokensOut: number
}

async function callAnthropic(modelId: string, systemPrompt: string, userText: string): Promise<ApiResult> {
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not configured")

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userText }],
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Anthropic API ${resp.status}: ${err}`)
  }

  const body = await resp.json()
  return {
    text: body.content?.[0]?.text ?? "",
    tokensIn: body.usage?.input_tokens ?? 0,
    tokensOut: body.usage?.output_tokens ?? 0,
  }
}

async function callOpenAI(modelId: string, systemPrompt: string, userText: string): Promise<ApiResult> {
  if (!openaiKey) throw new Error("OPENAI_API_KEY not configured")

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`OpenAI API ${resp.status}: ${err}`)
  }

  const body = await resp.json()
  return {
    text: body.choices?.[0]?.message?.content ?? "",
    tokensIn: body.usage?.prompt_tokens ?? 0,
    tokensOut: body.usage?.completion_tokens ?? 0,
  }
}

async function callGemini(modelId: string, systemPrompt: string, userText: string): Promise<ApiResult> {
  if (!googleKey) throw new Error("GOOGLE_API_KEY not configured")

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${googleKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 65536,
        },
      }),
    },
  )

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Gemini API ${resp.status}: ${err}`)
  }

  const body = await resp.json()
  const usage = body.usageMetadata ?? {}
  return {
    text: body.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
    tokensIn: usage.promptTokenCount ?? 0,
    tokensOut: usage.candidatesTokenCount ?? 0,
  }
}

// ═══════════════════════════════════════════════════════════
// Nomenclature matching
// ═══════════════════════════════════════════════════════════

async function resolveSupplier(name: string): Promise<string | null> {
  if (!name) return null
  const { data } = await db
    .from("suppliers")
    .select("id")
    .ilike("name", `%${name}%`)
    .limit(1)
  return data?.[0]?.id ?? null
}

async function matchNomenclature(
  supplierId: string | null,
  item: { barcode?: string | null; supplier_sku?: string | null; translated_name?: string },
): Promise<{ nomenclature_id: string | null; sku_id: string | null; confidence: string }> {
  if (item.barcode) {
    const { data } = await db
      .from("supplier_catalog")
      .select("nomenclature_id, sku_id")
      .eq("barcode", item.barcode)
      .order("match_count", { ascending: false })
      .limit(1)
    if (data?.[0]?.nomenclature_id) {
      return { nomenclature_id: data[0].nomenclature_id, sku_id: data[0].sku_id, confidence: "high" }
    }
  }
  if (item.supplier_sku && supplierId) {
    const { data } = await db
      .from("supplier_catalog")
      .select("nomenclature_id, sku_id")
      .eq("supplier_sku", item.supplier_sku)
      .eq("supplier_id", supplierId)
      .order("match_count", { ascending: false })
      .limit(1)
    if (data?.[0]?.nomenclature_id) {
      return { nomenclature_id: data[0].nomenclature_id, sku_id: data[0].sku_id, confidence: "high" }
    }
  }
  if (item.translated_name) {
    const { data } = await db
      .from("nomenclature")
      .select("id")
      .ilike("name", `%${item.translated_name.slice(0, 30)}%`)
      .limit(1)
    if (data?.[0]?.id) {
      return { nomenclature_id: data[0].id, sku_id: null, confidence: "medium" }
    }
  }
  return { nomenclature_id: null, sku_id: null, confidence: "low" }
}

// ═══════════════════════════════════════════════════════════
// Item classification
// ═══════════════════════════════════════════════════════════

function classifyItems(lineItems: Record<string, unknown>[]) {
  const food_items: Record<string, unknown>[] = []
  const capex_items: Record<string, unknown>[] = []
  const opex_items: Record<string, unknown>[] = []

  for (const item of lineItems) {
    const cat = (item.category as string) || "food"
    const base = {
      name: item.translated_name || item.original_name,
      original_name: item.original_name,
      quantity: item.quantity,
      unit: item.unit || "pcs",
      unit_price: item.unit_price,
      total_price: item.total_price,
      barcode: item.barcode || null,
      supplier_sku: item.supplier_sku || null,
      brand: item.brand || null,
      package_weight: item.package_weight || null,
      nomenclature_id: item.nomenclature_id || null,
      sku_id: item.sku_id || null,
      confidence: item.confidence || "low",
    }
    if (cat === "capex") capex_items.push({ description: base.name, ...base })
    else if (cat === "opex") opex_items.push({ description: base.name, ...base })
    else food_items.push(base)
  }
  return { food_items, capex_items, opex_items }
}

function determineFlowType(food: unknown[], capex: unknown[], opex: unknown[]): string {
  if (capex.length > 0) return "CapEx"
  if (food.length === 0 && opex.length > 0) return "OpEx"
  return "COGS"
}

// ═══════════════════════════════════════════════════════════
// Main handler
// ═══════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS })
  }

  const startTime = Date.now()

  try {
    const url = new URL(req.url)
    const inboxId = url.searchParams.get("inbox_id")?.trim()
    const modelKey = url.searchParams.get("model")?.trim() || "gemini-pro"

    if (!inboxId) return json({ error: "inbox_id query parameter is required" }, 400)

    const modelConfig = MODEL_MAP[modelKey]
    if (!modelConfig) {
      return json({ error: `Unknown model: ${modelKey}. Options: ${Object.keys(MODEL_MAP).join(", ")}` }, 400)
    }

    console.log(`[ocr-receipt] START inbox_id=${inboxId} model=${modelKey} (${modelConfig.modelId})`)

    // ── Read inbox row ──
    const { data: row, error: readErr } = await db
      .from("receipt_inbox")
      .select("photo_urls, supplier_hint, receipt_date, amount_hint, status")
      .eq("id", inboxId)
      .single()

    if (readErr || !row) return json({ error: `Inbox row not found: ${readErr?.message}` }, 404)
    if (!row.photo_urls?.length) return json({ error: "No photo_urls in inbox row" }, 400)

    // ── Mark as processing ──
    await db.from("receipt_inbox")
      .update({ status: "processing", model_used: modelConfig.modelId })
      .eq("id", inboxId)

    // ══════════════════════════════════════════
    // STAGE 1: Google Cloud Vision OCR
    // ══════════════════════════════════════════
    console.log(`[ocr-receipt] Stage 1: OCR on ${row.photo_urls.length} image(s)...`)
    const ocrTexts: string[] = []

    for (const photoUrl of row.photo_urls) {
      try {
        const img = await downloadImageAsBase64(photoUrl)
        const text = await extractTextViaGCV(img.data)
        if (text) ocrTexts.push(text)
        console.log(`[ocr-receipt] GCV extracted ${text.length} chars from ${photoUrl.slice(-30)}`)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`[ocr-receipt] GCV failed for ${photoUrl}: ${errMsg}`)
        // If GCV fails, include the error so we can debug
        if (ocrTexts.length === 0) {
          await db.from("receipt_inbox")
            .update({ status: "error", error_message: `GCV OCR failed: ${errMsg.slice(0, 500)}` })
            .eq("id", inboxId)
          return json({ error: `GCV OCR failed: ${errMsg}` }, 500)
        }
      }
    }

    if (ocrTexts.length === 0) {
      await db.from("receipt_inbox")
        .update({ status: "error", error_message: "OCR failed: no text extracted from images" })
        .eq("id", inboxId)
      return json({ error: "OCR failed: no text extracted" }, 500)
    }

    const fullOcrText = ocrTexts.join("\n\n--- PAGE BREAK ---\n\n")
    console.log(`[ocr-receipt] Stage 1 done: ${fullOcrText.length} total chars`)

    // ══════════════════════════════════════════
    // STAGE 2: LLM structuring + translation
    // ══════════════════════════════════════════
    const fullSystemPrompt = SYSTEM_PROMPT + "\n\n" + OUTPUT_SCHEMA

    const hints: string[] = []
    if (row.supplier_hint) hints.push(`Supplier hint: ${row.supplier_hint}`)
    if (row.receipt_date) hints.push(`Receipt date hint: ${row.receipt_date}`)
    if (row.amount_hint) hints.push(`Expected total: ${row.amount_hint} THB`)

    const userPrompt = `Here is the raw OCR text extracted from the receipt image(s). Parse it into the required JSON format.

${hints.length > 0 ? hints.join("\n") + "\n\n" : ""}--- RAW OCR TEXT ---
${fullOcrText}
--- END OCR TEXT ---`

    console.log(`[ocr-receipt] Stage 2: LLM structuring via ${modelConfig.provider}/${modelConfig.modelId}...`)

    let result: ApiResult
    if (modelConfig.provider === "anthropic") {
      result = await callAnthropic(modelConfig.modelId, fullSystemPrompt, userPrompt)
    } else if (modelConfig.provider === "google") {
      result = await callGemini(modelConfig.modelId, fullSystemPrompt, userPrompt)
    } else {
      result = await callOpenAI(modelConfig.modelId, fullSystemPrompt, userPrompt)
    }

    console.log(`[ocr-receipt] Stage 2 done: ${result.tokensIn} in, ${result.tokensOut} out`)

    // ── Parse JSON ──
    let parsed: Record<string, unknown>
    try {
      let text = result.text.trim()
      if (text.startsWith("```")) {
        text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
      }
      parsed = JSON.parse(text)
    } catch {
      console.error(`[ocr-receipt] Failed to parse JSON:`, result.text.slice(0, 1000))
      await db.from("receipt_inbox")
        .update({ status: "error", error_message: `Model returned invalid JSON: ${result.text.slice(0, 500)}` })
        .eq("id", inboxId)
      return json({ error: "Model returned invalid JSON", raw_snippet: result.text.slice(0, 300) }, 500)
    }

    // ── Nomenclature matching ──
    const lineItems = (parsed.line_items as Record<string, unknown>[]) || []
    const supplierName = (parsed.supplier_name as string) || row.supplier_hint || ""
    const supplierId = await resolveSupplier(supplierName)

    for (const item of lineItems) {
      const match = await matchNomenclature(supplierId, {
        barcode: item.barcode as string | null,
        supplier_sku: item.supplier_sku as string | null,
        translated_name: item.translated_name as string,
      })
      item.nomenclature_id = match.nomenclature_id
      item.sku_id = match.sku_id
      if (!item.confidence || item.confidence === "low") item.confidence = match.confidence
    }

    // ── Classify items ──
    const { food_items, capex_items, opex_items } = classifyItems(lineItems)
    const flowType = determineFlowType(food_items, capex_items, opex_items)
    const footer = (parsed.footer as Record<string, number>) || {}

    // ── Build payload ──
    const payload = {
      supplier_name: supplierName,
      invoice_number: parsed.invoice_number || null,
      transaction_date: parsed.transaction_date,
      flow_type: flowType,
      category_code: flowType === "COGS" ? 4100 : flowType === "CapEx" ? 1100 : 2100,
      details: `${supplierName} — OCR+${modelKey}`,
      amount_original: footer.grand_total || 0,
      discount_total: footer.discount_total || 0,
      vat_amount: footer.vat_amount || 0,
      delivery_fee: footer.delivery_fee || 0,
      has_tax_invoice: parsed.has_tax_invoice || false,
      currency: "THB",
      food_items,
      capex_items,
      opex_items,
      raw_parse: parsed.raw_parse || {},
      line_items: lineItems,
      item_count_observed: parsed.item_count_observed || lineItems.length,
      _reconciliation: parsed._reconciliation || null,
      _warnings: parsed._warnings || [],
      _ocr_text: fullOcrText,
    }

    // ── Calculate cost ──
    // GCV cost: $1.50 per 1000 images = $0.0015 per image
    const gcvCost = row.photo_urls.length * 0.0015
    const pricing = MODEL_PRICING[modelConfig.modelId] || { input: 0, output: 0 }
    const llmCost = result.tokensIn * pricing.input + result.tokensOut * pricing.output
    const totalCost = gcvCost + llmCost
    const durationMs = Date.now() - startTime

    // ── Update receipt_inbox ──
    await db.from("receipt_inbox")
      .update({
        status: "parsed",
        parsed_payload: payload,
        parsed_at: new Date().toISOString(),
        parse_cost_usd: totalCost,
        parse_tokens_in: result.tokensIn,
        parse_tokens_out: result.tokensOut,
        model_used: modelConfig.modelId,
        error_message: null,
      })
      .eq("id", inboxId)

    // ── Log to api_cost_log ──
    await db.from("api_cost_log").insert({
      service: modelConfig.provider,
      model: modelConfig.modelId,
      feature: "receipt-ocr",
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_usd: totalCost,
      reference_id: inboxId,
      reference_type: "receipt",
      metadata: {
        image_count: row.photo_urls.length,
        ocr_chars: fullOcrText.length,
        gcv_cost_usd: gcvCost,
        llm_cost_usd: llmCost,
        supplier_hint: row.supplier_hint,
        duration_ms: durationMs,
        items_parsed: lineItems.length,
        nomenclature_matched: lineItems.filter((i) => i.nomenclature_id).length,
        pipeline: "gcv+llm",
      },
    })

    console.log(
      `[ocr-receipt] DONE inbox_id=${inboxId} items=${lineItems.length} ocr=${fullOcrText.length}chars cost=$${totalCost.toFixed(4)} (gcv=$${gcvCost.toFixed(4)} llm=$${llmCost.toFixed(4)}) ${durationMs}ms`,
    )

    return json({
      ok: true,
      inbox_id: inboxId,
      model: modelConfig.modelId,
      pipeline: "gcv+llm",
      items_parsed: lineItems.length,
      nomenclature_matched: lineItems.filter((i) => i.nomenclature_id).length,
      ocr_chars: fullOcrText.length,
      cost_usd: Math.round(totalCost * 1_000_000) / 1_000_000,
      cost_breakdown: { gcv: Math.round(gcvCost * 1_000_000) / 1_000_000, llm: Math.round(llmCost * 1_000_000) / 1_000_000 },
      duration_ms: durationMs,
    })
  } catch (error) {
    console.error("[ocr-receipt] CRASH:", error)
    const url = new URL(req.url)
    const inboxId = url.searchParams.get("inbox_id")?.trim()
    if (inboxId) {
      await db.from("receipt_inbox")
        .update({ status: "error", error_message: error instanceof Error ? error.message : "Unknown error" })
        .eq("id", inboxId)
        .catch(() => {})
    }
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500)
  }
})
