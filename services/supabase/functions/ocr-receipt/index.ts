// ═══════════════════════════════════════════════════════════
// Edge Function: ocr-receipt v2 — Two-Stage Pipeline
// Stage 1: Google Cloud Vision (OCR) → raw text
// Stage 2: LLM (structure + translate) → ParsedReceipt JSON
// ═══════════════════════════════════════════════════════════
// Zero Body-Read Architecture:
//   inbox_id and model come from URL query params.
//   Images come from receipt_inbox.photo_urls in DB.
// ═══════════════════════════════════════════════════════════

import { CORS, json } from "../_shared/cors.ts"
import { db } from "../_shared/supabase.ts"
import { downloadImageAsBase64, extractTextViaGCV } from "../_shared/gcv.ts"
import { callLLM } from "../_shared/llm-providers.ts"
import type { ApiResult, ImageInput } from "../_shared/llm-providers.ts"
import { SYSTEM_PROMPT, OUTPUT_SCHEMA, MODEL_PRICING, MODEL_MAP } from "../_shared/prompts.ts"
import { resolveSupplier, resolveSupplierWithProfile, matchNomenclature, classifyItems, determineFlowType } from "../_shared/nomenclature.ts"

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS })
  }

  const startTime = Date.now()

  try {
    const url = new URL(req.url)
    const inboxId = url.searchParams.get("inbox_id")?.trim()
    const modelKey = url.searchParams.get("model")?.trim() || "gemini-flash"

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
        // Continue — vision fallback will handle images with no OCR text
      }
    }

    if (ocrTexts.length === 0) {
      // No OCR text at all — will fall through to vision fallback below
      console.log(`[ocr-receipt] No OCR text extracted — will attempt vision fallback`)
    }

    const fullOcrText = ocrTexts.join("\n\n--- PAGE BREAK ---\n\n")
    console.log(`[ocr-receipt] Stage 1 done: ${fullOcrText.length} total chars`)

    // ── Vision fallback for handwritten/low-OCR receipts ──
    const MIN_OCR_CHARS = 50 // Below this threshold, OCR probably failed
    const totalOcrChars = ocrTexts.reduce((sum, t) => sum + t.length, 0)
    const useVisionFallback = totalOcrChars < MIN_OCR_CHARS

    let visionImages: ImageInput[] | undefined
    if (useVisionFallback) {
      console.log(`[ocr-receipt] OCR too short (${totalOcrChars} chars) — falling back to vision mode`)
      visionImages = []
      for (const photoUrl of row.photo_urls) {
        try {
          const img = await downloadImageAsBase64(photoUrl)
          visionImages.push({ base64: img.data, mimeType: img.mediaType || "image/jpeg" })
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error(`[ocr-receipt] Failed to download image for vision: ${msg}`)
        }
      }
      if (visionImages.length === 0) visionImages = undefined // no images downloaded — fall through to text-only
    }

    // ══════════════════════════════════════════
    // STAGE 1.5: Supplier profile lookup
    // ══════════════════════════════════════════
    let supplierProfile: Record<string, unknown> | null = null
    if (row.supplier_hint) {
      const resolved = await resolveSupplierWithProfile(row.supplier_hint)
      supplierProfile = resolved.ocr_profile
      if (supplierProfile) {
        console.log(`[ocr-receipt] Found OCR profile for "${row.supplier_hint}"`)
      }
    }

    // ══════════════════════════════════════════
    // STAGE 2: LLM structuring + translation
    // ══════════════════════════════════════════

    // Build system prompt with optional supplier profile
    let systemPromptWithProfile = SYSTEM_PROMPT
    if (supplierProfile) {
      const profileLines = ["\n\n## SUPPLIER-SPECIFIC PROFILE (learned from previous receipts)"]
      if (supplierProfile.format_hint) profileLines.push(`Receipt format: ${supplierProfile.format_hint}`)
      if (supplierProfile.vat_mode) profileLines.push(`VAT mode: ${supplierProfile.vat_mode}`)
      if (supplierProfile.barcode_format) profileLines.push(`Barcode format: ${supplierProfile.barcode_format}`)
      if (supplierProfile.has_tax_invoice != null) profileLines.push(`Tax invoice: ${supplierProfile.has_tax_invoice}`)
      const rules = supplierProfile.rules as string[] | undefined
      if (rules?.length) {
        profileLines.push("Supplier-specific rules:")
        for (const rule of rules) profileLines.push(`- ${rule}`)
      }
      const examples = supplierProfile.example_items as Record<string, unknown>[] | undefined
      if (examples?.length) {
        profileLines.push(`\nExample items from previous receipts:\n\`\`\`json\n${JSON.stringify(examples.slice(0, 3), null, 2)}\n\`\`\``)
      }
      systemPromptWithProfile += profileLines.join("\n")
    }
    const fullSystemPrompt = systemPromptWithProfile + "\n\n" + OUTPUT_SCHEMA

    const hints: string[] = []
    if (row.supplier_hint) hints.push(`Supplier hint: ${row.supplier_hint}`)
    if (row.receipt_date) hints.push(`Receipt date hint: ${row.receipt_date}`)
    if (row.amount_hint) hints.push(`Expected total: ${row.amount_hint} THB`)

    const userPrompt = visionImages
      ? `The OCR text extraction failed or returned very little text for this receipt. Please look at the attached image(s) directly and parse the receipt into the required JSON format.

${hints.length > 0 ? hints.join("\n") + "\n\n" : ""}${totalOcrChars > 0 ? `Partial OCR text (may be incomplete):\n${fullOcrText}\n` : ""}`
      : `Here is the raw OCR text extracted from the receipt image(s). Parse it into the required JSON format.

${hints.length > 0 ? hints.join("\n") + "\n\n" : ""}--- RAW OCR TEXT ---
${fullOcrText}
--- END OCR TEXT ---`

    const pipelineMode = visionImages ? "vision" : "gcv+llm"
    console.log(`[ocr-receipt] Stage 2: LLM structuring via ${modelConfig.provider}/${modelConfig.modelId} (${pipelineMode})...`)

    const result: ApiResult = await callLLM(modelKey, fullSystemPrompt, userPrompt, visionImages)

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
        original_name: item.original_name as string | null,
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
      details: `${supplierName} — ${pipelineMode === "vision" ? "Vision" : "OCR"}+${modelKey}`,
      amount_original: footer.grand_total || 0,
      discount_total: footer.discount_total || 0,
      vat_amount: footer.vat_amount || 0,
      delivery_fee: footer.delivery_fee || 0,
      has_tax_invoice: parsed.has_tax_invoice || false,
      vat_included: parsed.vat_included !== false,
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
        pipeline: pipelineMode,
      },
    })

    // ── Auto-learn: update supplier ocr_profile with example items ──
    if (supplierId && lineItems.length > 0) {
      try {
        const exampleItems = lineItems.slice(0, 3).map((it) => ({
          barcode: it.barcode,
          original_name: it.original_name,
          translated_name: it.translated_name,
          unit: it.unit,
          category: it.category,
        }))
        // Merge: keep existing rules/format_hint, update example_items + last_seen
        const { data: existing } = await db
          .from("suppliers")
          .select("ocr_profile")
          .eq("id", supplierId)
          .single()
        const currentProfile = (existing?.ocr_profile as Record<string, unknown>) || {}
        await db.from("suppliers")
          .update({
            ocr_profile: {
              ...currentProfile,
              example_items: exampleItems,
              last_learned_at: new Date().toISOString(),
              last_learned_from: inboxId,
            },
          })
          .eq("id", supplierId)
        console.log(`[ocr-receipt] Auto-learned profile for supplier ${supplierId} (${exampleItems.length} examples)`)
      } catch (e) {
        console.warn(`[ocr-receipt] Auto-learn failed:`, e)
      }
    }

    console.log(
      `[ocr-receipt] DONE inbox_id=${inboxId} pipeline=${pipelineMode} items=${lineItems.length} ocr=${fullOcrText.length}chars cost=$${totalCost.toFixed(4)} (gcv=$${gcvCost.toFixed(4)} llm=$${llmCost.toFixed(4)}) ${durationMs}ms`,
    )

    return json({
      ok: true,
      inbox_id: inboxId,
      model: modelConfig.modelId,
      pipeline: pipelineMode,
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
