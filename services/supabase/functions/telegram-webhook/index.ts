// ═══════════════════════════════════════════════════════════
// Edge Function: telegram-webhook
// Inbound updates from the Shishka_Kitchen_bot (staff task tracker, Phase 2).
//
// Handles:
//   • /start <code>      → link this Telegram chat to a staff member
//                          (fn_link_telegram validates + consumes the code)
//   • /today             → digest of the staff member's tasks for today (ICT)
//   • callback "done:<id>"   → mark task done, edit message, clear buttons
//   • callback "snooze:<id>" → push due_time +30 min, keep buttons
//
// Auth: Telegram sends our secret in the X-Telegram-Bot-Api-Secret-Token header
// (configured at setWebhook). Mismatch → 401 + dead-letter. Telegram itself
// cannot send a JWT, so deploy with `--no-verify-jwt`.
//
// Always returns 200 for handled updates so Telegram does not retry-storm.
//
// Deploy: `supabase functions deploy telegram-webhook --no-verify-jwt`
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET
// ═══════════════════════════════════════════════════════════

import { db } from "../_shared/supabase.ts"
import {
  answerCallbackQuery,
  editMessageText,
  formatTask,
  sendMessage,
  taskKeyboard,
  type FormattableTask,
} from "../_shared/telegram.ts"

const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? ""

function ok(data: unknown = { ok: true }) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

async function deadLetter(reason: string, payload: unknown) {
  try {
    await db.from("staff_task_dead_letter").insert({
      source: "telegram-webhook",
      reason,
      payload: payload as Record<string, unknown>,
    })
  } catch (e) {
    console.error("[telegram-webhook] dead-letter insert failed:", e)
  }
}

/** Today's date in Asia/Bangkok (UTC+7), as YYYY-MM-DD. */
function todayICT(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
}

async function staffForChat(chatId: string): Promise<{ id: string; name: string } | null> {
  const { data } = await db
    .from("staff_telegram")
    .select("staff_id, staff:staff(name)")
    .eq("telegram_chat_id", chatId)
    .maybeSingle()
  if (!data) return null
  const raw = data.staff as { name?: string } | { name?: string }[] | null
  const staff = Array.isArray(raw) ? raw[0] : raw
  return { id: data.staff_id as string, name: staff?.name ?? "" }
}

async function handleStart(chatId: string, username: string | null, code: string | null) {
  if (!code) {
    await sendMessage(
      chatId,
      "👋 <b>Shishka Kitchen</b>\nAsk the owner for your personal link to connect your tasks.\nขอลิงก์ส่วนตัวจากเจ้าของร้านเพื่อเชื่อมต่องานของคุณ",
    )
    return
  }

  const { data, error } = await db.rpc("fn_link_telegram", {
    p_code: code,
    p_chat_id: chatId,
    p_username: username,
  })

  const row = Array.isArray(data) ? data[0] : null
  if (error || !row) {
    await sendMessage(
      chatId,
      "⚠️ This link is invalid or expired. Ask the owner for a new one.\nลิงก์ไม่ถูกต้องหรือหมดอายุ ขอใหม่จากเจ้าของร้าน",
    )
    return
  }

  const name = (row as { staff_name?: string }).staff_name ?? ""
  await sendMessage(
    chatId,
    `✅ Connected, <b>${name}</b>!\nYou'll get your tasks and reminders here.\nเชื่อมต่อแล้ว! คุณจะได้รับงานและการแจ้งเตือนที่นี่\n\nSend /today to see today's tasks · พิมพ์ /today เพื่อดูงานวันนี้`,
  )
}

async function handleToday(chatId: string) {
  const staff = await staffForChat(chatId)
  if (!staff) {
    await sendMessage(chatId, "You're not connected yet. Ask the owner for your link. · ยังไม่ได้เชื่อมต่อ")
    return
  }

  const { data } = await db
    .from("staff_tasks")
    .select("id, title, title_th, description, due_time, category, priority, status")
    .eq("assigned_to", staff.id)
    .eq("due_date", todayICT())
    .eq("is_template", false)
    .neq("status", "cancelled")
    .order("due_time", { ascending: true, nullsFirst: true })

  const tasks = (data ?? []) as Array<FormattableTask & { id: string; status: string }>
  if (tasks.length === 0) {
    await sendMessage(chatId, "🎉 No tasks for today. · วันนี้ไม่มีงาน")
    return
  }

  await sendMessage(chatId, `📋 <b>Today · วันนี้</b> (${tasks.length})`)
  for (const t of tasks) {
    const done = t.status === "done"
    const body = formatTask(t) + (done ? "\n✅ Done" : "")
    await sendMessage(chatId, body, done ? undefined : taskKeyboard(t.id))
  }
}

async function handleCallback(cq: Record<string, unknown>) {
  const id = String(cq.id)
  const data = typeof cq.data === "string" ? cq.data : ""
  const from = cq.from as { id?: number } | undefined
  const message = cq.message as { message_id?: number; chat?: { id?: number } } | undefined
  const presserChatId = from?.id != null ? String(from.id) : null
  const msgChatId = message?.chat?.id != null ? String(message.chat.id) : null
  const messageId = message?.message_id

  const [action, taskId] = data.split(":")
  if (!taskId || !presserChatId || !msgChatId || messageId == null) {
    await answerCallbackQuery(id, "Unknown action")
    return
  }

  const staff = await staffForChat(presserChatId)
  if (!staff) {
    await answerCallbackQuery(id, "You're not connected. Ask the owner for your link.")
    return
  }

  const { data: taskRow } = await db
    .from("staff_tasks")
    .select("id, title, title_th, description, due_time, category, priority, status")
    .eq("id", taskId)
    .maybeSingle()

  if (!taskRow) {
    await answerCallbackQuery(id, "Task not found")
    return
  }
  const task = taskRow as FormattableTask & { id: string; status: string }

  if (action === "done") {
    await db
      .from("staff_tasks")
      .update({ status: "done", completed_at: new Date().toISOString(), completed_via: "telegram" })
      .eq("id", taskId)
    await editMessageText(msgChatId, messageId, `${formatTask(task)}\n✅ Done by ${staff.name}`)
    await answerCallbackQuery(id, "✅ Marked done")
    return
  }

  if (action === "snooze") {
    // Push the due time forward 30 minutes; keep the task actionable.
    let newTime: string | null = task.due_time
    if (task.due_time) {
      const [h, m] = task.due_time.split(":").map(Number)
      const total = (h * 60 + m + 30) % (24 * 60)
      newTime = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`
      await db.from("staff_tasks").update({ due_time: newTime, reminder_sent_at: null }).eq("id", taskId)
    }
    await editMessageText(
      msgChatId,
      messageId,
      `${formatTask({ ...task, due_time: newTime })}\n⏰ Snoozed +30 min`,
      taskKeyboard(taskId),
    )
    await answerCallbackQuery(id, "⏰ Snoozed 30 min")
    return
  }

  await answerCallbackQuery(id, "Unknown action")
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 })
  if (req.method !== "POST") return ok({ ok: false, error: "method_not_allowed" })

  // Auth: Telegram echoes our secret token in this header.
  const provided = req.headers.get("x-telegram-bot-api-secret-token") ?? ""
  if (!WEBHOOK_SECRET || provided !== WEBHOOK_SECRET) {
    const raw = await req.text().catch(() => "")
    await deadLetter("invalid_secret_token", { raw: raw.slice(0, 2000) })
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 })
  }

  let update: Record<string, unknown>
  try {
    update = await req.json()
  } catch (e) {
    await deadLetter("parse_error", { error: (e as Error).message })
    return ok()
  }

  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query as Record<string, unknown>)
      return ok()
    }

    const message = update.message as
      | { text?: string; chat?: { id?: number }; from?: { username?: string } }
      | undefined
    const text = message?.text?.trim() ?? ""
    const chatId = message?.chat?.id != null ? String(message.chat.id) : null
    const username = message?.from?.username ?? null

    if (!chatId) return ok()

    if (text.startsWith("/start")) {
      const code = text.split(/\s+/)[1] ?? null
      await handleStart(chatId, username, code)
    } else if (text.startsWith("/today")) {
      await handleToday(chatId)
    } else {
      await sendMessage(chatId, "Send /today to see your tasks. · พิมพ์ /today เพื่อดูงาน")
    }
    return ok()
  } catch (e) {
    console.error("[telegram-webhook] handler error:", e)
    await deadLetter("handler_error", { error: (e as Error).message, update })
    return ok()
  }
})
