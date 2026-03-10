// ═══════════════════════════════════════════════════════════
// Edge Function: parse-receipts
// Phase 4.4: AI Receipt Clustering & Smart Line-Item Routing
// Runtime: Deno (Supabase Edge Functions)
// ═══════════════════════════════════════════════════════════
// Receives receipt image URLs → OpenAI gpt-4o-mini vision →
// Returns structured JSON with supplier, items classified as
// food / capex / opex.
// ═══════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

const SYSTEM_PROMPT = `You are a receipt/invoice parser for a restaurant kitchen supply chain (Shishka Healthy Kitchen, Thailand).
Analyze the provided receipt or invoice images and extract structured data.

Return ONLY valid JSON with this exact schema:
{
  "supplier_name": "string — the vendor / store name from the receipt",
  "invoice_number": "string or null — receipt or invoice number if visible",
  "total_amount": number,
  "currency": "THB" or "USD" or "EUR" etc.,
  "transaction_date": "YYYY-MM-DD — date from the receipt",
  "food_items": [
    { "name": "string", "quantity": number, "unit": "kg|pcs|g|liters|pack", "unit_price": number, "total_price": number }
  ],
  "capex_items": [
    { "name": "string", "quantity": number, "unit_price": number, "total_price": number }
  ],
  "opex_items": [
    { "description": "string", "quantity": number, "unit": "pcs|pack|roll|bottle", "unit_price": number, "total_price": number }
  ]
}

Classification rules:
- food_items: raw ingredients, produce, proteins, grains, dairy, spices, sauces, oils — anything that goes INTO food production
- capex_items: equipment, machinery, furniture, construction materials, IT hardware, appliances — assets with useful life > 1 year
- opex_items: cleaning supplies, packaging materials, disposable containers, office supplies, services, delivery fees — consumables used up quickly

If a category has no items, return an empty array [].
If you cannot determine a field, use null.
All monetary values must be numbers (not strings).
Quantities must be positive numbers.
If multiple receipt images are provided, they belong to the SAME transaction — combine all items into a single response.`

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  try {
    // Validate API key
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured in Supabase Secrets" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    // Parse request body
    const { image_urls } = await req.json()

    if (!image_urls || !Array.isArray(image_urls) || image_urls.length === 0) {
      return new Response(
        JSON.stringify({ error: "image_urls array is required and must not be empty" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    // Build vision message content with all images
    const imageContent = image_urls.map((url: string) => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const },
    }))

    // Call OpenAI gpt-4o-mini vision
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Parse this receipt/invoice and return the structured JSON:",
              },
              ...imageContent,
            ],
          },
        ],
        max_tokens: 2000,
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error("[parse-receipts] OpenAI API error:", response.status, errBody)
      return new Response(
        JSON.stringify({
          error: `OpenAI API error: ${response.status}`,
          details: errBody,
        }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    const data = await response.json()

    // Extract and parse the JSON content
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      return new Response(
        JSON.stringify({ error: "No content in OpenAI response" }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    const parsed = JSON.parse(content)

    // Ensure arrays exist (defensive)
    parsed.food_items = parsed.food_items ?? []
    parsed.capex_items = parsed.capex_items ?? []
    parsed.opex_items = parsed.opex_items ?? []

    console.log(
      `[parse-receipts] OK: ${parsed.supplier_name}, ` +
        `food=${parsed.food_items.length}, capex=${parsed.capex_items.length}, ` +
        `opex=${parsed.opex_items.length}`,
    )

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("[parse-receipts] Error:", error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    )
  }
})
