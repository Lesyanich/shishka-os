import { anthropicKey, openaiKey, googleKey } from "./supabase.ts"
import { MODEL_MAP } from "./prompts.ts"

export interface ApiResult {
  text: string
  tokensIn: number
  tokensOut: number
}

/** Base64-encoded image for vision-capable LLM calls */
export interface ImageInput {
  base64: string
  mimeType: string // "image/jpeg" | "image/png" | "image/webp"
}

export async function callAnthropic(modelId: string, systemPrompt: string, userText: string, images?: ImageInput[]): Promise<ApiResult> {
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not configured")

  // When images are provided, use content array format for vision
  type AnthropicBlock =
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
    | { type: "text"; text: string }
  let userContent: string | AnthropicBlock[] = userText
  if (images?.length) {
    const blocks: AnthropicBlock[] = []
    for (const img of images) {
      blocks.push({ type: "image", source: { type: "base64", media_type: img.mimeType, data: img.base64 } })
    }
    blocks.push({ type: "text", text: userText })
    userContent = blocks
  }

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
      messages: [{ role: "user", content: userContent }],
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

export async function callOpenAI(modelId: string, systemPrompt: string, userText: string, images?: ImageInput[]): Promise<ApiResult> {
  if (!openaiKey) throw new Error("OPENAI_API_KEY not configured")

  // When images are provided, use content array format for GPT-4o vision
  type OpenAIBlock =
    | { type: "image_url"; image_url: { url: string } }
    | { type: "text"; text: string }
  let userContent: string | OpenAIBlock[] = userText
  if (images?.length) {
    const blocks: OpenAIBlock[] = []
    for (const img of images) {
      blocks.push({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.base64}` } })
    }
    blocks.push({ type: "text", text: userText })
    userContent = blocks
  }

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
        { role: "user", content: userContent },
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

export async function callGemini(modelId: string, systemPrompt: string, userText: string, images?: ImageInput[]): Promise<ApiResult> {
  if (!googleKey) throw new Error("GOOGLE_API_KEY not configured")

  // Build parts array — images first (inline_data), then text
  type GeminiPart =
    | { inline_data: { mime_type: string; data: string } }
    | { text: string }
  const parts: GeminiPart[] = []
  if (images?.length) {
    for (const img of images) {
      parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } })
    }
  }
  parts.push({ text: userText })

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${googleKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts }],
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

/** Dispatch to the correct LLM provider based on model key */
export async function callLLM(modelKey: string, systemPrompt: string, userText: string, images?: ImageInput[]): Promise<ApiResult> {
  const modelConfig = MODEL_MAP[modelKey]
  if (!modelConfig) {
    throw new Error(`Unknown model: ${modelKey}. Options: ${Object.keys(MODEL_MAP).join(", ")}`)
  }

  if (modelConfig.provider === "anthropic") {
    return callAnthropic(modelConfig.modelId, systemPrompt, userText, images)
  } else if (modelConfig.provider === "google") {
    return callGemini(modelConfig.modelId, systemPrompt, userText, images)
  } else {
    return callOpenAI(modelConfig.modelId, systemPrompt, userText, images)
  }
}
