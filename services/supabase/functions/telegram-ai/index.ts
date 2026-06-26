// ═══════════════════════════════════════════════════════════
// Edge Function: telegram-ai
// Slow LLM work for the staff bot, decoupled from telegram-webhook so the
// webhook can return 200 fast (Telegram retries if the webhook waits > ~10s).
//
// Called server-to-server by telegram-webhook (fire-and-forget) with the
// shared TELEGRAM_WEBHOOK_SECRET in the x-telegram-bot-api-secret-token header.
//
// Phase B: classify intent (claude-haiku) → answer menu / general questions
// from the DB. Menu answers read ONLY `menu_public` (price / КБЖУ / ingredients —
// never cost_per_unit or margin). Task intake + owner relay are stubbed here
// (Phases C / D).
//
// Deploy: `supabase functions deploy telegram-ai --no-verify-jwt`
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, ANTHROPIC_API_KEY,
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ═══════════════════════════════════════════════════════════

import { db } from "../_shared/supabase.ts"
import { json } from "../_shared/cors.ts"
import { callLLM, type ApiResult } from "../_shared/llm-providers.ts"
import { MODEL_MAP, MODEL_PRICING } from "../_shared/prompts.ts"
import { sendMessage } from "../_shared/telegram.ts"

const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? ""
const MODEL_KEY = "claude-haiku" // cheap + fast; good enough for routing + Q&A

type Lang = "ru" | "en" | "th"
type Intent = "menu_question" | "task_intake" | "report_to_owner" | "general_question"

function tri(lang: Lang, ru: string, en: string, th: string): string {
  return lang === "ru" ? ru : lang === "en" ? en : th
}
function langName(lang: Lang): string {
  return lang === "ru" ? "Russian" : lang === "th" ? "Thai" : "English"
}

/** Pull the first {...} JSON object out of an LLM text reply (Anthropic returns prose). */
function parseJsonObject(s: string): Record<string, unknown> | null {
  const m = s.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0]) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Record token usage + cost so the AI bot is observable/billable. */
async function logCost(res: ApiResult, chatId: string, intent: string, lang: string) {
  try {
    const modelId = MODEL_MAP[MODEL_KEY].modelId
    const pricing = MODEL_PRICING[modelId] ?? { input: 0, output: 0 }
    const cost = res.tokensIn * pricing.input + res.tokensOut * pricing.output
    await db.from("api_cost_log").insert({
      service: "anthropic",
      model: modelId,
      feature: "telegram-ai",
      tokens_in: res.tokensIn,
      tokens_out: res.tokensOut,
      cost_usd: cost,
      reference_type: "telegram_chat",
      metadata: { chat_id: chatId, intent, lang },
    })
  } catch (e) {
    console.error("[telegram-ai] cost log failed:", e)
  }
}

const CLASSIFY_SYS =
  `You route messages from kitchen staff of "Shishka Healthy Kitchen" (a Thai healthy restaurant) sent to the staff Telegram bot. Classify the message into exactly ONE intent and detect its language.

Intents:
- "menu_question": anything about dishes — price, calories/КБЖУ (protein/carbs/fat), ingredients/состав, what is vegetarian/vegan, what's available, recommendations.
- "task_intake": the staff is describing work to be done or assigned (e.g. "нужно помыть холодильник", "Hein should restock napkins").
- "report_to_owner": a message meant for the owner/manager — a complaint, an issue, or a question not about the menu.
- "general_question": small talk or general info about the restaurant.

Return ONLY compact JSON, no markdown, no extra text:
{"intent":"menu_question|task_intake|report_to_owner|general_question","lang":"ru|en|th"}`

async function classify(chatId: string, text: string): Promise<{ intent: Intent; lang: Lang | null }> {
  const res = await callLLM(MODEL_KEY, CLASSIFY_SYS, text.slice(0, 1000))
  await logCost(res, chatId, "classify", "")
  const parsed = parseJsonObject(res.text) ?? {}
  const intents: Intent[] = ["menu_question", "task_intake", "report_to_owner", "general_question"]
  const intent = intents.includes(parsed.intent as Intent) ? (parsed.intent as Intent) : "general_question"
  const lang = (["ru", "en", "th"].includes(parsed.lang as string) ? (parsed.lang as Lang) : null)
  return { intent, lang }
}

interface MenuRow {
  name: string | null
  customer_short_name: string | null
  price: number | null
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  customer_ingredients: string | null
  category_name: string | null
}

/** Safe menu context for the LLM — price/КБЖУ/ingredients only, never cost/margin. */
async function fetchMenu(): Promise<Array<Record<string, unknown>>> {
  const { data } = await db
    .from("menu_public")
    .select("name, customer_short_name, price, calories, protein, carbs, fat, customer_ingredients, category_name")
    .eq("is_available", true)
    .order("category_sort_order", { ascending: true })
    .order("display_order", { ascending: true })
  return ((data ?? []) as MenuRow[]).map((d) => ({
    name: d.customer_short_name || d.name,
    cat: d.category_name,
    price: d.price,
    kcal: d.calories,
    protein: d.protein,
    carbs: d.carbs,
    fat: d.fat,
    ingredients: (d.customer_ingredients ?? "").replace(/&amp;/g, "&").slice(0, 220) || null,
  }))
}

async function answerMenu(chatId: string, text: string, lang: Lang) {
  const menu = await fetchMenu()
  const sys =
    `You are a friendly assistant for the staff of "Shishka Healthy Kitchen", a Thai healthy restaurant. Answer the staff member's question using ONLY the MENU DATA below. Be concise (a few short lines). Answer in ${langName(lang)}.
- Prices are in Thai Baht (฿). КБЖУ (calories / protein / carbs / fat) are per portion.
- For allergen or diet questions, reason from the listed ingredients; for severe allergies tell them to confirm with the kitchen.
- If a dish or a fact is not in the data, say you don't have that info — do NOT invent prices or numbers.
- Never mention internal cost, margin, or supplier info (it is not provided and must never be guessed).

MENU DATA (JSON):
${JSON.stringify(menu)}`
  const res = await callLLM(MODEL_KEY, sys, text.slice(0, 1000))
  await logCost(res, chatId, "menu_question", lang)
  const answer = res.text.trim() ||
    tri(lang, "Извините, не нашёл ответа.", "Sorry, I couldn't find an answer.", "ขออภัย ไม่พบคำตอบ")
  await sendMessage(chatId, answer)
}

async function answerGeneral(chatId: string, text: string, lang: Lang) {
  const sys =
    `You are the staff assistant bot for "Shishka Healthy Kitchen", a Thai healthy restaurant. Answer briefly and helpfully in ${langName(lang)}. If you don't know something specific about this restaurant, say so and suggest asking the owner. Never invent menu prices, schedules, or policies.`
  const res = await callLLM(MODEL_KEY, sys, text.slice(0, 1000))
  await logCost(res, chatId, "general_question", lang)
  const answer = res.text.trim() ||
    tri(lang, "Извините, не понял вопрос.", "Sorry, I didn't catch that.", "ขออภัย ไม่เข้าใจคำถาม")
  await sendMessage(chatId, answer)
}

async function handleAI(chatId: string, text: string, fallbackLang: Lang) {
  const { intent, lang: detected } = await classify(chatId, text)
  const lang = detected ?? fallbackLang

  if (intent === "menu_question") {
    await answerMenu(chatId, text, lang)
  } else if (intent === "general_question") {
    await answerGeneral(chatId, text, lang)
  } else if (intent === "task_intake") {
    // Phase C will turn this into an owner-approved task draft.
    await sendMessage(
      chatId,
      tri(
        lang,
        "📝 Понял. Создание задач прямо из чата скоро появится — пока добавьте её на доске (кнопка 🗂 Open full board).",
        "📝 Got it. Creating tasks straight from chat is coming soon — for now add it on the board (🗂 Open full board).",
        "📝 รับทราบ ฟีเจอร์สร้างงานจากแชทกำลังจะมา — ระหว่างนี้เพิ่มงานบนบอร์ด (🗂 Open full board)",
      ),
    )
  } else {
    // report_to_owner — Phase D will relay this to the owner.
    await sendMessage(
      chatId,
      tri(
        lang,
        "🙏 Спасибо! Передача сообщений владельцу скоро появится. Пока, пожалуйста, напишите ему напрямую.",
        "🙏 Thanks! Forwarding messages to the owner is coming soon. For now, please contact them directly.",
        "🙏 ขอบคุณ! ระบบส่งข้อความถึงเจ้าของร้านกำลังจะมา ระหว่างนี้กรุณาติดต่อโดยตรง",
      ),
    )
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 })
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405)

  // Server-to-server only: same shared secret the webhook validates.
  const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? ""
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return json({ ok: false, error: "unauthorized" }, 401)
  }

  let body: { chat_id?: unknown; text?: unknown; lang?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: "bad_json" }, 400)
  }
  const chatId = body.chat_id != null ? String(body.chat_id) : ""
  const text = typeof body.text === "string" ? body.text.trim() : ""
  const fallbackLang = (["ru", "en", "th"].includes(body.lang as string) ? (body.lang as Lang) : "th")
  if (!chatId || !text) return json({ ok: false, error: "missing_fields" }, 400)

  try {
    await handleAI(chatId, text, fallbackLang)
    return json({ ok: true })
  } catch (e) {
    console.error("[telegram-ai] error:", e)
    await sendMessage(chatId, "⚠️ Sorry, something went wrong. Please try again. · ลองใหม่อีกครั้ง").catch(() => {})
    return json({ ok: false, error: (e as Error).message }, 200)
  }
})
