import { googleVisionKey } from "./supabase.ts"

function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 32768
  let binary = ""
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export async function downloadImageAsBase64(url: string): Promise<{ data: string; mediaType: string }> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Failed to download image: ${resp.status} ${url}`)
  const buf = await resp.arrayBuffer()
  const data = uint8ToBase64(new Uint8Array(buf))
  const contentType = resp.headers.get("content-type") || "image/jpeg"
  return { data, mediaType: contentType.split(";")[0].trim() }
}

export async function extractTextViaGCV(imageBase64: string): Promise<string> {
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
