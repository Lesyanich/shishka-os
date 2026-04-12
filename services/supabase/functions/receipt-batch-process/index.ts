// ═══════════════════════════════════════════════════════════
// Edge Function: receipt-batch-process — Batch Receipt Triage + Parse
// Stage 1: GCV OCR on all images (parallel)
// Stage 2: LLM triage — group images into receipt clusters
// Stage 3: Per-group full parse (parallel)
// ═══════════════════════════════════════════════════════════

import { CORS, json } from "../_shared/cors.ts"
import { db } from "../_shared/supabase.ts"
import { downloadImageAsBase64, extractTextViaGCV } from "../_shared/gcv.ts"
import { callLLM } from "../_shared/llm-providers.ts"
import type { ApiResult } from "../_shared/llm-providers.ts"
import {
  SYSTEM_PROMPT, OUTPUT_SCHEMA, MODEL_PRICING, MODEL_MAP, TRIAGE_PROMPT,
} from "../_shared/prompts.ts"
import {
  resolveSupplier, matchNomenclature, classifyItems, determineFlowType,
} from "../_shared/nomenclature.ts"

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

interface TriageItem {
  image_index: number
  receipt_number: string | null
  date: string | null
  supplier_name: string | null
  document_type: string
  page_hint: string | null
  is_multi_receipt: boolean
  receipts_on_image: number
  notes: string | null
}

interface ImageOcr {
  index: number
  url: string
  ocrText: string
}

interface ReceiptGroup {
  id: string
  imageIndices: number[]
  urls: string[]
  ocrTexts: string[]
  meta: {
    receipt_number: string | null
    date: string | null
    supplier_name: string | null
    document_type: string
  }
}

interface GroupResult {
  inbox_id: string
  supplier: string
  images: number
  items: number
  cost_usd: number
  error?: string
}

// ═══════════════════════════════════════════════════════════
// Grouping algorithm (deterministic, server-side)
// ═══════════════════════════════════════════════════════════

function groupImages(triageItems: TriageItem[], imageOcrs: ImageOcr[]): ReceiptGroup[] {
  const groups: ReceiptGroup[] = []
  const assigned = new Set<number>()
  let groupCounter = 0

  // Step 1: Group by receipt_number (exact match, non-null)
  const byReceiptNumber = new Map<string, TriageItem[]>()
  for (const item of triageItems) {
    if (item.receipt_number) {
      const existing = byReceiptNumber.get(item.receipt_number) || []
      existing.push(item)
      byReceiptNumber.set(item.receipt_number, existing)
    }
  }

  for (const [receiptNum, items] of byReceiptNumber) {
    // Sort by page_hint (1/3 < 2/3 < 3/3)
    items.sort((a, b) => {
      const pa = parsePageHint(a.page_hint)
      const pb = parsePageHint(b.page_hint)
      return pa - pb
    })

    const indices = items.map((i) => i.image_index)
    const first = items[0]
    groups.push({
      id: `group-${groupCounter++}`,
      imageIndices: indices,
      urls: indices.map((i) => imageOcrs[i].url),
      ocrTexts: indices.map((i) => imageOcrs[i].ocrText),
      meta: {
        receipt_number: receiptNum,
        date: first.date,
        supplier_name: first.supplier_name,
        document_type: first.document_type,
      },
    })
    for (const idx of indices) assigned.add(idx)
  }

  // Step 2: Cluster ungrouped by (supplier_name + date ±1 day)
  const ungrouped = triageItems.filter(
    (item) => !assigned.has(item.image_index) && item.document_type !== "unknown",
  )

  const bySupplierDate = new Map<string, TriageItem[]>()
  for (const item of ungrouped) {
    if (item.supplier_name && item.date) {
      // Use supplier + date as cluster key
      const key = `${item.supplier_name.toLowerCase()}|${item.date}`
      const existing = bySupplierDate.get(key) || []
      existing.push(item)
      bySupplierDate.set(key, existing)
    }
  }

  // Merge clusters within ±1 day of same supplier
  const supplierClusters = new Map<string, TriageItem[]>()
  for (const [key, items] of bySupplierDate) {
    const [supplier] = key.split("|")
    let merged = false

    for (const [existingKey, existingItems] of supplierClusters) {
      const [existingSupplier] = existingKey.split("|")
      if (existingSupplier === supplier) {
        const existingDate = existingItems[0].date
        const newDate = items[0].date
        if (existingDate && newDate && datesWithinOneDay(existingDate, newDate)) {
          existingItems.push(...items)
          merged = true
          break
        }
      }
    }

    if (!merged) {
      supplierClusters.set(key, [...items])
    }
  }

  for (const items of supplierClusters.values()) {
    const indices = items.map((i) => i.image_index).filter((i) => !assigned.has(i))
    if (indices.length === 0) continue

    items.sort((a, b) => parsePageHint(a.page_hint) - parsePageHint(b.page_hint))
    const first = items[0]

    groups.push({
      id: `group-${groupCounter++}`,
      imageIndices: indices,
      urls: indices.map((i) => imageOcrs[i].url),
      ocrTexts: indices.map((i) => imageOcrs[i].ocrText),
      meta: {
        receipt_number: first.receipt_number,
        date: first.date,
        supplier_name: first.supplier_name,
        document_type: first.document_type,
      },
    })
    for (const idx of indices) assigned.add(idx)
  }

  // Step 3: multi_receipt images belong to all detected groups on that image
  // (handled during triage — if LLM says 2 receipts on 1 image, each is a separate group)
  for (const item of triageItems) {
    if (item.is_multi_receipt && !assigned.has(item.image_index)) {
      // Create one group per detected receipt on this image
      for (let r = 0; r < item.receipts_on_image; r++) {
        groups.push({
          id: `group-${groupCounter++}`,
          imageIndices: [item.image_index],
          urls: [imageOcrs[item.image_index].url],
          ocrTexts: [imageOcrs[item.image_index].ocrText],
          meta: {
            receipt_number: null,
            date: item.date,
            supplier_name: item.supplier_name,
            document_type: item.document_type,
          },
        })
      }
      assigned.add(item.image_index)
    }
  }

  // Step 4: Remaining ungrouped — each image = 1 separate receipt
  for (const item of triageItems) {
    if (!assigned.has(item.image_index)) {
      if (item.document_type === "unknown") {
        // Error group — unrecognized document
        groups.push({
          id: `group-${groupCounter++}`,
          imageIndices: [item.image_index],
          urls: [imageOcrs[item.image_index].url],
          ocrTexts: [imageOcrs[item.image_index].ocrText],
          meta: {
            receipt_number: null,
            date: null,
            supplier_name: null,
            document_type: "unknown",
          },
        })
      } else {
        groups.push({
          id: `group-${groupCounter++}`,
          imageIndices: [item.image_index],
          urls: [imageOcrs[item.image_index].url],
          ocrTexts: [imageOcrs[item.image_index].ocrText],
          meta: {
            receipt_number: item.receipt_number,
            date: item.date,
            supplier_name: item.supplier_name,
            document_type: item.document_type,
          },
        })
      }
      assigned.add(item.image_index)
    }
  }

  return groups
}

function parsePageHint(hint: string | null): number {
  if (!hint) return 0
  const match = hint.match(/^(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

function datesWithinOneDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return Math.abs(da.getTime() - db.getTime()) <= 86400000
}

// ═══════════════════════════════════════════════════════════
// Per-group full parse (reuses ocr-receipt logic)
// ═══════════════════════════════════════════════════════════

async function parseReceiptGroup(
  group: ReceiptGroup,
  modelKey: string,
  uploadedBy: string,
): Promise<GroupResult> {
  const modelConfig = MODEL_MAP[modelKey]

  // Create receipt_inbox row
  const { data: inboxRow, error: insertErr } = await db
    .from("receipt_inbox")
    .insert({
      uploaded_by: uploadedBy,
      photo_urls: group.urls,
      status: "processing",
      model_used: modelConfig.modelId,
      supplier_hint: group.meta.supplier_name,
      receipt_date: group.meta.date,
    })
    .select("id")
    .single()

  if (insertErr || !inboxRow) {
    return {
      inbox_id: "",
      supplier: group.meta.supplier_name || "unknown",
      images: group.urls.length,
      items: 0,
      cost_usd: 0,
      error: `Failed to create inbox row: ${insertErr?.message}`,
    }
  }

  const inboxId = inboxRow.id

  // Handle unknown documents
  if (group.meta.document_type === "unknown") {
    await db.from("receipt_inbox")
      .update({ status: "error", error_message: "Unrecognized document — not a receipt" })
      .eq("id", inboxId)
    return {
      inbox_id: inboxId,
      supplier: "unknown",
      images: group.urls.length,
      items: 0,
      cost_usd: 0,
      error: "unrecognized document",
    }
  }

  try {
    // Concatenate OCR texts
    const fullOcrText = group.ocrTexts.join("\n\n--- PAGE BREAK ---\n\n")
    const fullSystemPrompt = SYSTEM_PROMPT + "\n\n" + OUTPUT_SCHEMA

    const hints: string[] = []
    if (group.meta.supplier_name) hints.push(`Supplier hint: ${group.meta.supplier_name}`)
    if (group.meta.date) hints.push(`Receipt date hint: ${group.meta.date}`)

    const userPrompt = `Here is the raw OCR text extracted from the receipt image(s). Parse it into the required JSON format.

${hints.length > 0 ? hints.join("\n") + "\n\n" : ""}--- RAW OCR TEXT ---
${fullOcrText}
--- END OCR TEXT ---`

    const result: ApiResult = await callLLM(modelKey, fullSystemPrompt, userPrompt)

    // Parse JSON
    let parsed: Record<string, unknown>
    let text = result.text.trim()
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
    }
    parsed = JSON.parse(text)

    // Nomenclature matching
    const lineItems = (parsed.line_items as Record<string, unknown>[]) || []
    const supplierName = (parsed.supplier_name as string) || group.meta.supplier_name || ""
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

    // Classify items
    const { food_items, capex_items, opex_items } = classifyItems(lineItems)
    const flowType = determineFlowType(food_items, capex_items, opex_items)
    const footer = (parsed.footer as Record<string, number>) || {}

    // Build payload
    const payload = {
      supplier_name: supplierName,
      invoice_number: parsed.invoice_number || null,
      transaction_date: parsed.transaction_date,
      flow_type: flowType,
      category_code: flowType === "COGS" ? 4100 : flowType === "CapEx" ? 1100 : 2100,
      details: `${supplierName} — batch-OCR+${modelKey}`,
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

    // Calculate cost
    const gcvCost = 0 // GCV cost tracked at batch level
    const pricing = MODEL_PRICING[modelConfig.modelId] || { input: 0, output: 0 }
    const llmCost = result.tokensIn * pricing.input + result.tokensOut * pricing.output

    // Update inbox row
    await db.from("receipt_inbox")
      .update({
        status: "parsed",
        parsed_payload: payload,
        parsed_at: new Date().toISOString(),
        parse_cost_usd: llmCost,
        parse_tokens_in: result.tokensIn,
        parse_tokens_out: result.tokensOut,
        model_used: modelConfig.modelId,
        error_message: null,
      })
      .eq("id", inboxId)

    return {
      inbox_id: inboxId,
      supplier: supplierName,
      images: group.urls.length,
      items: lineItems.length,
      cost_usd: llmCost,
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown parse error"
    await db.from("receipt_inbox")
      .update({ status: "error", error_message: errMsg.slice(0, 500) })
      .eq("id", inboxId)
    return {
      inbox_id: inboxId,
      supplier: group.meta.supplier_name || "unknown",
      images: group.urls.length,
      items: 0,
      cost_usd: 0,
      error: errMsg,
    }
  }
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
    // Read POST body
    const body = await req.json()
    const photoUrls: string[] = body.photo_urls || []
    const uploadedBy: string = body.uploaded_by || "Admin"
    const modelKey: string = body.model || "gemini-flash"

    if (photoUrls.length === 0) {
      return json({ error: "photo_urls array is required and must not be empty" }, 400)
    }

    const modelConfig = MODEL_MAP[modelKey]
    if (!modelConfig) {
      return json({ error: `Unknown model: ${modelKey}. Options: ${Object.keys(MODEL_MAP).join(", ")}` }, 400)
    }

    console.log(`[batch] START ${photoUrls.length} images, model=${modelKey}, by=${uploadedBy}`)

    // ══════════════════════════════════════════
    // STAGE 1: GCV OCR on all images (parallel)
    // ══════════════════════════════════════════
    console.log(`[batch] Stage 1: GCV OCR on ${photoUrls.length} image(s)...`)

    const ocrResults = await Promise.allSettled(
      photoUrls.map(async (url, index): Promise<ImageOcr> => {
        const img = await downloadImageAsBase64(url)
        const ocrText = await extractTextViaGCV(img.data)
        console.log(`[batch] GCV [${index}] ${ocrText.length} chars from ${url.slice(-30)}`)
        return { index, url, ocrText }
      }),
    )

    const imageOcrs: ImageOcr[] = []
    const ocrErrors: string[] = []
    for (let i = 0; i < ocrResults.length; i++) {
      const result = ocrResults[i]
      if (result.status === "fulfilled") {
        imageOcrs.push(result.value)
      } else {
        console.error(`[batch] GCV [${i}] FAILED: ${result.reason}`)
        ocrErrors.push(`Image ${i}: ${result.reason}`)
        // Still include with empty text so triage sees the image index
        imageOcrs.push({ index: i, url: photoUrls[i], ocrText: "" })
      }
    }

    // Sort by index (Promise.allSettled preserves order, but be safe)
    imageOcrs.sort((a, b) => a.index - b.index)

    const successfulOcrs = imageOcrs.filter((o) => o.ocrText.length > 0)
    if (successfulOcrs.length === 0) {
      return json({ error: "GCV OCR failed for all images", details: ocrErrors }, 500)
    }

    console.log(`[batch] Stage 1 done: ${successfulOcrs.length}/${photoUrls.length} images OCR'd`)

    // ══════════════════════════════════════════
    // STAGE 2: Triage — single LLM call
    // ══════════════════════════════════════════
    console.log(`[batch] Stage 2: Triage via ${modelKey}...`)

    const triageInput = imageOcrs.map((o) =>
      `=== IMAGE ${o.index} ===\n${o.ocrText || "(no text extracted — image may be unreadable)"}\n`
    ).join("\n")

    const triagePrompt = TRIAGE_PROMPT.replace("{N}", String(imageOcrs.length))

    const triageResult: ApiResult = await callLLM(modelKey, triagePrompt, triageInput)

    let triageItems: TriageItem[]
    try {
      let text = triageResult.text.trim()
      if (text.startsWith("```")) {
        text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
      }
      triageItems = JSON.parse(text)
    } catch {
      console.error(`[batch] Triage JSON parse failed:`, triageResult.text.slice(0, 500))
      return json({ error: "Triage returned invalid JSON", raw_snippet: triageResult.text.slice(0, 300) }, 500)
    }

    console.log(`[batch] Stage 2 done: ${triageItems.length} items triaged`)

    // ── Grouping ──
    const groups = groupImages(triageItems, imageOcrs)
    console.log(`[batch] Grouped into ${groups.length} receipt(s)`)

    // ══════════════════════════════════════════
    // STAGE 3: Per-group full parse (parallel)
    // ══════════════════════════════════════════
    console.log(`[batch] Stage 3: Parsing ${groups.length} group(s)...`)

    const parseResults = await Promise.allSettled(
      groups.map((group) => parseReceiptGroup(group, modelKey, uploadedBy)),
    )

    const groupResults: GroupResult[] = parseResults.map((r, i) => {
      if (r.status === "fulfilled") return r.value
      return {
        inbox_id: "",
        supplier: groups[i].meta.supplier_name || "unknown",
        images: groups[i].urls.length,
        items: 0,
        cost_usd: 0,
        error: r.reason?.message || "Parse failed",
      }
    })

    // ── Calculate total cost ──
    const gcvCost = photoUrls.length * 0.0015
    const triagePricing = MODEL_PRICING[modelConfig.modelId] || { input: 0, output: 0 }
    const triageCost = triageResult.tokensIn * triagePricing.input + triageResult.tokensOut * triagePricing.output
    const parseCost = groupResults.reduce((sum, g) => sum + g.cost_usd, 0)
    const totalCost = gcvCost + triageCost + parseCost
    const durationMs = Date.now() - startTime

    // ── Log batch cost ──
    await db.from("api_cost_log").insert({
      service: modelConfig.provider,
      model: modelConfig.modelId,
      feature: "receipt-batch",
      tokens_in: triageResult.tokensIn,
      tokens_out: triageResult.tokensOut,
      cost_usd: totalCost,
      reference_id: null,
      reference_type: "batch",
      metadata: {
        image_count: photoUrls.length,
        groups_created: groups.length,
        gcv_cost_usd: gcvCost,
        triage_cost_usd: triageCost,
        parse_cost_usd: parseCost,
        duration_ms: durationMs,
        uploaded_by: uploadedBy,
        group_ids: groupResults.map((g) => g.inbox_id).filter(Boolean),
      },
    })

    console.log(
      `[batch] DONE ${photoUrls.length} images → ${groups.length} receipts, cost=$${totalCost.toFixed(4)}, ${durationMs}ms`,
    )

    return json({
      ok: true,
      groups: groupResults,
      total_receipts: groups.length,
      total_images: photoUrls.length,
      total_cost_usd: Math.round(totalCost * 1_000_000) / 1_000_000,
      cost_breakdown: {
        gcv: Math.round(gcvCost * 1_000_000) / 1_000_000,
        triage: Math.round(triageCost * 1_000_000) / 1_000_000,
        parse: Math.round(parseCost * 1_000_000) / 1_000_000,
      },
      duration_ms: durationMs,
    })
  } catch (error) {
    console.error("[batch] CRASH:", error)
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500)
  }
})
