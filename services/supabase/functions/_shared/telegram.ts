// Shared Telegram Bot API helpers for the staff task tracker (Phase 2).
// Token lives only in Supabase Secrets (TELEGRAM_BOT_TOKEN) — never in the repo.

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? ""
const API = `https://api.telegram.org/bot${TOKEN}`

// Inline buttons are either a callback (data) or a URL (deep-link) button.
export interface InlineCallbackButton {
  text: string
  callback_data: string
}
export interface InlineUrlButton {
  text: string
  url: string
}
export type InlineButton = InlineCallbackButton | InlineUrlButton
export type InlineKeyboard = InlineButton[][]

// Persistent bottom menu so staff tap buttons instead of typing slash commands.
export const MENU_TODAY = "📋 My tasks · งานของฉัน"
export const MENU_TEAM = "👥 Team tasks · งานทีม"
export const MENU_ADD = "➕ Add · เพิ่มงาน"
export const MENU_DONE = "✅ Log done · บันทึกเสร็จ"
export const MENU_BOARD = "🗂 Open full board · เปิดบอร์ด"

export const ADD_PROMPT = "✍️ Type the task to add: · พิมพ์งานที่จะเพิ่ม:"
export const DONE_PROMPT = "✍️ What did you finish? · ทำอะไรเสร็จแล้ว?"

function mainMenu() {
  return {
    keyboard: [
      [{ text: MENU_TODAY }, { text: MENU_TEAM }],
      [{ text: MENU_ADD }, { text: MENU_DONE }],
      [{ text: MENU_BOARD }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  }
}

// Deployed admin panel — role-aware "Open full board" target.
const BOARD_BASE = "https://shishka-os.vercel.app"
/** Where the "Open full board" button should land, by app_role. */
export function boardUrl(appRole: string | null): string {
  return appRole === "owner" || appRole === "task_manager"
    ? `${BOARD_BASE}/staff-tasks`
    : `${BOARD_BASE}/kitchen/my-tasks`
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
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

/** Send a message that also (re)shows the persistent bottom menu. */
export async function sendMenu(chatId: string, text: string): Promise<void> {
  await call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: mainMenu(),
  })
}

/** Prompt the user to reply with free text (force_reply) — used for Add / Done. */
export async function sendForceReply(chatId: string, prompt: string): Promise<void> {
  await call("sendMessage", {
    chat_id: chatId,
    text: prompt,
    reply_markup: { force_reply: true, input_field_placeholder: "…" },
  })
}

/** Send a photo by file_id (re-share, no download) or URL, with an optional caption. */
export async function sendPhoto(
  chatId: string,
  photo: string,
  caption?: string,
  keyboard?: InlineKeyboard,
): Promise<{ ok: boolean }> {
  const body: Record<string, unknown> = { chat_id: chatId, photo }
  if (caption) {
    body.caption = caption
    body.parse_mode = "HTML"
  }
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard }
  const data = await call("sendPhoto", body)
  return { ok: data.ok === true }
}

/** Resolve a Telegram file_id to its server file_path (for download). */
export async function getFilePath(fileId: string): Promise<string | null> {
  const data = await call("getFile", { file_id: fileId })
  const result = data.result as { file_path?: string } | undefined
  return result?.file_path ?? null
}

/** Download the bytes of a Telegram file by its file_path (token stays server-side). */
export async function downloadFile(filePath: string): Promise<Uint8Array | null> {
  const res = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${filePath}`)
  if (!res.ok) {
    console.error("[telegram] downloadFile failed:", res.status)
    return null
  }
  return new Uint8Array(await res.arrayBuffer())
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
  body.reply_markup = { inline_keyboard: keyboard ?? [] }
  const data = await call("editMessageText", body)
  return data.ok === true
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await call("answerCallbackQuery", { callback_query_id: callbackQueryId, text: text ?? "" })
}

/** Register the native command menu (the ☰ button) once. */
export async function setMyCommands(): Promise<void> {
  await call("setMyCommands", {
    commands: [
      { command: "today", description: "My tasks today · งานวันนี้" },
      { command: "team", description: "Team tasks today · งานทีม" },
      { command: "add", description: "Add a task · เพิ่มงาน" },
      { command: "done", description: "Log something done · บันทึกงานที่ทำ" },
    ],
  })
}

/**
 * Reset a menu button to Telegram's default (the native ☰ commands menu),
 * clearing any stale `web_app` button (e.g. a dead ngrok dev tunnel). Pass a
 * chatId to clear a per-chat override; omit it to reset the global default.
 */
export async function setChatMenuButton(chatId?: string): Promise<{ ok: boolean }> {
  const body: Record<string, unknown> = { menu_button: { type: "default" } }
  if (chatId) body.chat_id = chatId
  const data = await call("setChatMenuButton", body)
  return { ok: data.ok === true }
}
/** Inspect a chat menu button (default scope, or a specific chat's override). */
export async function getChatMenuButton(chatId?: string): Promise<Record<string, unknown>> {
  return await call("getChatMenuButton", chatId ? { chat_id: chatId } : {})
}
/** Inspect the registered webhook (URL, pending updates, last error). */
export async function getWebhookInfo(): Promise<Record<string, unknown>> {
  return await call("getWebhookInfo", {})
}
/** (Re)register the inbound webhook with our secret token. */
export async function setWebhook(url: string, secret: string): Promise<{ ok: boolean }> {
  const data = await call("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
  })
  return { ok: data.ok === true }
}

/** Start / Done / Snooze buttons for a concrete task DM. */
export function taskKeyboard(taskId: string): InlineKeyboard {
  return [
    [
      { text: "▶️ Start · เริ่ม", callback_data: `start:${taskId}` },
      { text: "✅ Done · เสร็จ", callback_data: `done:${taskId}` },
    ],
    [{ text: "⏰ Snooze +30 · เลื่อน", callback_data: `snooze:${taskId}` }],
  ]
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

const STATUS_ICON: Record<string, string> = {
  done: "✅",
  in_progress: "🔄",
  skipped: "⏭",
}

/** Compact one-line form for digest lists (team view). */
export function formatTaskLine(
  task: { title: string; due_time: string | null; priority: string; status: string },
  assignee: string,
): string {
  const icon = task.status === "todo"
    ? (PRIORITY_FLAG[task.priority] ?? "🔵")
    : (STATUS_ICON[task.status] ?? "•")
  const time = task.due_time ? `⏰${task.due_time.slice(0, 5)} ` : ""
  const who = assignee ? ` — ${escapeHtml(assignee)}` : ""
  return `${icon} ${time}${escapeHtml(task.title)}${who}`
}

export function hasToken(): boolean {
  return TOKEN.length > 0
}
