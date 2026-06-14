// Shared Telegram Bot API helpers for the staff task tracker (Phase 2).
// Token lives only in Supabase Secrets (TELEGRAM_BOT_TOKEN) — never in the repo.

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? ""
const API = `https://api.telegram.org/bot${TOKEN}`

export interface InlineButton {
  text: string
  callback_data: string
}
export type InlineKeyboard = InlineButton[][]

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

async function call(method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({})) as Record<string, unknown>
  if (!res.ok || data.ok === false) {
    console.error(`[telegram] ${method} failed:`, res.status, JSON.stringify(data))
  }
  return data
}

export async function sendMessage(
  chatId: string,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<{ ok: boolean; messageId?: number }> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  }
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard }
  const data = await call("sendMessage", body)
  const result = data.result as { message_id?: number } | undefined
  return { ok: data.ok === true, messageId: result?.message_id }
}

export async function editMessageText(
  chatId: string,
  messageId: string | number,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<boolean> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: typeof messageId === "string" ? Number(messageId) : messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  }
  // Pass an explicit (possibly empty) keyboard so old buttons are cleared.
  body.reply_markup = { inline_keyboard: keyboard ?? [] }
  const data = await call("editMessageText", body)
  return data.ok === true
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await call("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: text ?? "",
  })
}

/** Done / Snooze buttons for a concrete task. */
export function taskKeyboard(taskId: string): InlineKeyboard {
  return [[
    { text: "✅ Done / เสร็จ", callback_data: `done:${taskId}` },
    { text: "⏰ Snooze / เลื่อน", callback_data: `snooze:${taskId}` },
  ]]
}

export interface FormattableTask {
  title: string
  title_th: string | null
  description: string | null
  due_time: string | null
  category: string
  priority: string
}

const PRIORITY_FLAG: Record<string, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🔵",
  low: "⚪",
}

/** Bilingual (English + Thai) HTML message body for one task. */
export function formatTask(task: FormattableTask): string {
  const flag = PRIORITY_FLAG[task.priority] ?? "🔵"
  const time = task.due_time ? ` · ⏰ ${task.due_time.slice(0, 5)}` : ""
  const lines = [`${flag} <b>${escapeHtml(task.title)}</b>${time}`]
  if (task.title_th) lines.push(escapeHtml(task.title_th))
  if (task.description) lines.push(`<i>${escapeHtml(task.description)}</i>`)
  return lines.join("\n")
}

export function hasToken(): boolean {
  return TOKEN.length > 0
}
