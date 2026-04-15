// POST /api/chef/chat — streaming chat with Chef agent.
//
// v1 scope (P1.3 — scaffold):
//   - SSE streaming from Anthropic Claude API
//   - Auth via Supabase JWT in Authorization header
//   - Token logging into chef_chat_sessions via waitUntil() (non-blocking)
//   - NO tools yet (P1.4)
//   - NO MCP tool integration yet (P1.4)
//   - NO MemPalace context injection (P2)
//
// Architecture decisions (per CEO 2026-04-15, MC 5a4f1e17):
//   - Vercel Hobby tier: 300s max per Function (configured in vercel.json)
//   - Hybrid execution: inline streaming + waitUntil for side effects
//   - Single shishka-os Vercel project (no separate API project)

import type { VercelRequest, VercelResponse } from '@vercel/node'
import type Anthropic from '@anthropic-ai/sdk'
import { anthropicClient, DEFAULT_MODEL, DEFAULT_MAX_TOKENS } from '../_lib/anthropic'
import { getAuthedUser, supabaseForUser } from '../_lib/supabase'

export const config = { runtime: 'nodejs', maxDuration: 300 }

// Minimal Chef system prompt for v1. Will be replaced by Chef AGENT.md
// + tool definitions + MemPalace context in P1.4.
const SYSTEM_PROMPT_V1 = `You are the AI Executive Chef for Shishka Healthy Kitchen, a healthy food restaurant in Thailand.

You assist the owner (Lesia) with:
- Menu composition (dishes, BOM, pricing)
- Recipe development and process steps
- Cost analysis and food cost optimization
- Ingredient substitutions and sourcing decisions

Rules:
- Reply in the user's language (Russian, English, or Thai).
- Be concise. The owner is busy. Skip filler.
- When the user asks you to make a change, describe what you'd do and ask for confirmation. Do NOT claim to have made changes — you cannot write to the database yet (write tools land in the next phase).
- Use Thai Baht (฿) for prices.
- For ingredient names, prefer the canonical form used in Shishka's nomenclature (e.g. "RAW-SALT_SEA_FINE").

You currently have NO database access. If the user asks you to look something up, say "I cannot read the database yet — that lands in the next phase. For now I can answer from general knowledge or whatever you paste into chat."`

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatRequestBody {
  messages: ChatMessage[]
  session_id?: string // optional — if provided, append to existing session
  context?: Record<string, unknown> // optional page context (dish_id, etc)
}

function corsHeaders(res: VercelResponse) {
  // Same-origin in production; permissive in dev. Tighten in P2 if needed.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  corsHeaders(res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' })
    return
  }

  // ─── Auth ──────────────────────────────────────────────────
  const authed = await getAuthedUser(req)
  if (!authed) {
    res.status(401).json({ error: 'Unauthorized. Provide Authorization: Bearer <jwt>.' })
    return
  }
  const { user, jwt } = authed

  // ─── Validate body ─────────────────────────────────────────
  const body = req.body as ChatRequestBody | undefined
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json({ error: 'Body must include non-empty messages array.' })
    return
  }
  if (body.messages.some((m) => !m.content || typeof m.content !== 'string' || (m.role !== 'user' && m.role !== 'assistant'))) {
    res.status(400).json({ error: 'Each message must have role (user|assistant) and string content.' })
    return
  }

  // ─── SSE headers ───────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // disable proxy buffering

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  // ─── Stream from Claude ────────────────────────────────────
  let fullText = ''
  let usage: Anthropic.Messages.Usage | null = null
  let modelUsed = DEFAULT_MODEL
  let stopReason: string | null = null

  try {
    const client = anthropicClient()
    const stream = await client.messages.stream({
      model: DEFAULT_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: SYSTEM_PROMPT_V1,
      messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text
        sendEvent('delta', { text: event.delta.text })
      } else if (event.type === 'message_start') {
        modelUsed = event.message.model
      } else if (event.type === 'message_delta') {
        if (event.usage) {
          usage = { ...usage, ...event.usage } as Anthropic.Messages.Usage
        }
        if (event.delta.stop_reason) stopReason = event.delta.stop_reason
      }
    }

    const finalMessage = await stream.finalMessage()
    if (finalMessage.usage) usage = finalMessage.usage

    sendEvent('done', {
      stop_reason: stopReason,
      usage: usage
        ? {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cache_read_tokens: usage.cache_read_input_tokens ?? 0,
          }
        : null,
      model: modelUsed,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[/api/chef/chat] stream error', message)
    sendEvent('error', { message })
  } finally {
    res.end()
  }

  // ─── Persist session (non-blocking, runs after response close) ───
  // On Vercel, anything after res.end() runs until the function instance is reclaimed.
  // No explicit waitUntil needed for Node Functions on Vercel — the runtime will
  // wait for the event loop to drain. We still log errors but don't await.
  void persistSession({
    jwt,
    userId: user.id,
    sessionId: body.session_id,
    incoming: body.messages,
    assistantText: fullText,
    usage,
    context: body.context,
  }).catch((e) => console.error('[/api/chef/chat] persistSession failed', e))
}

interface PersistArgs {
  jwt: string
  userId: string
  sessionId?: string
  incoming: ChatMessage[]
  assistantText: string
  usage: Anthropic.Messages.Usage | null
  context?: Record<string, unknown>
}

async function persistSession(args: PersistArgs): Promise<void> {
  if (!args.assistantText) return // nothing to log

  const supa = supabaseForUser(args.jwt)
  const turnIn = args.usage?.input_tokens ?? 0
  const turnOut = args.usage?.output_tokens ?? 0

  const newMessages = [
    ...args.incoming,
    { role: 'assistant' as const, content: args.assistantText, timestamp: new Date().toISOString() },
  ]

  if (args.sessionId) {
    // Append to existing session — fetch current, merge, update.
    const { data: existing } = await supa
      .from('chef_chat_sessions')
      .select('messages, token_count_in, token_count_out')
      .eq('id', args.sessionId)
      .maybeSingle()

    const mergedMessages = existing?.messages
      ? [...(existing.messages as unknown[]), ...newMessages]
      : newMessages

    await supa
      .from('chef_chat_sessions')
      .update({
        messages: mergedMessages,
        token_count_in: (existing?.token_count_in ?? 0) + turnIn,
        token_count_out: (existing?.token_count_out ?? 0) + turnOut,
      })
      .eq('id', args.sessionId)
  } else {
    // New session
    await supa.from('chef_chat_sessions').insert({
      user_id: args.userId,
      surface: 'erp_chat',
      messages: newMessages,
      context: args.context ?? null,
      token_count_in: turnIn,
      token_count_out: turnOut,
    })
  }
}
