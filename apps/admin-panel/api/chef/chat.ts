// POST /api/chef/chat — streaming chat with the AI Chef.
//
// v2.1 (fix for FUNCTION_INVOCATION_FAILED in prod):
//   - Back to VercelRequest/VercelResponse (Node runtime — compatible with Vercel Functions)
//   - pipeUIMessageStreamToResponse(res) — canonical pattern for Node servers
//   - Multi-provider via Vercel AI SDK (Anthropic / OpenAI / Google)
//   - Auth: Bearer JWT in Authorization header
//   - Session persistence via onFinish (fires after stream close, non-blocking)
//
// Architecture (CEO decisions 2026-04-15, MC 5a4f1e17):
//   - Vercel Hobby tier, 300s maxDuration (configured in vercel.json)
//   - Inline + post-response side effects

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { convertToModelMessages, streamText, type UIMessage } from 'ai'
import {
  getLanguageModel,
  AVAILABLE_MODELS,
  DEFAULT_MODEL,
  type Provider,
} from '../_lib/llm'
import { supabaseForUser } from '../_lib/supabase'

export const config = { runtime: 'nodejs', maxDuration: 300 }

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

interface ChatBody {
  messages: UIMessage[]
  provider?: Provider
  model?: string
  session_id?: string
  context?: Record<string, unknown>
}

function setCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function jsonError(res: VercelResponse, status: number, error: string): void {
  setCors(res)
  res.status(status).json({ error })
}

async function verifyJwt(jwt: string): Promise<{ userId: string; email: string | null } | null> {
  const supa = supabaseForUser(jwt)
  const { data, error } = await supa.auth.getUser(jwt)
  if (error || !data.user) return null
  return { userId: data.user.id, email: data.user.email ?? null }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    jsonError(res, 405, 'Method not allowed. Use POST.')
    return
  }

  try {
    // ─── Auth ──────────────────────────────────────────────────
    const rawAuth = req.headers.authorization ?? req.headers.Authorization
    const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      jsonError(res, 401, 'Unauthorized. Provide Authorization: Bearer <jwt>.')
      return
    }
    const jwt = authHeader.slice('Bearer '.length).trim()
    if (!jwt) {
      jsonError(res, 401, 'Unauthorized. Empty JWT.')
      return
    }

    const user = await verifyJwt(jwt)
    if (!user) {
      jsonError(res, 401, 'Unauthorized. Invalid JWT.')
      return
    }

    // ─── Body ──────────────────────────────────────────────────
    // Vercel auto-parses JSON for application/json content-type
    const body = req.body as ChatBody | undefined
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      jsonError(res, 400, 'Body must include non-empty messages array.')
      return
    }

    // ─── Resolve model ─────────────────────────────────────────
    const provider = body.provider ?? DEFAULT_MODEL.provider
    const modelId = body.model ?? DEFAULT_MODEL.id
    const knownModel = AVAILABLE_MODELS.find((m) => m.provider === provider && m.id === modelId)
    if (!knownModel) {
      jsonError(res, 400, `Unknown model: ${provider}/${modelId}.`)
      return
    }

    let languageModel
    try {
      languageModel = getLanguageModel(provider, modelId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      jsonError(res, 503, `Provider not configured: ${msg}`)
      return
    }

    // ─── Stream ────────────────────────────────────────────────
    const modelMessages = await convertToModelMessages(body.messages)
    const result = streamText({
      model: languageModel,
      system: SYSTEM_PROMPT_V1,
      messages: modelMessages,
      onFinish: async ({ text, usage }) => {
        try {
          await persistSession({
            jwt,
            userId: user.userId,
            sessionId: body.session_id,
            incoming: body.messages,
            assistantText: text,
            usage: {
              input_tokens: usage.inputTokens ?? 0,
              output_tokens: usage.outputTokens ?? 0,
            },
            provider,
            model: modelId,
            context: body.context,
          })
        } catch (e) {
          console.error('[/api/chef/chat] persistSession failed', e)
        }
      },
    })

    // Canonical Node-server pattern from AI SDK docs
    result.pipeUIMessageStreamToResponse(res)
  } catch (err) {
    // Any uncaught error — log and return JSON. Don't crash the function.
    console.error('[/api/chef/chat] handler crash', err)
    if (!res.headersSent) {
      const msg = err instanceof Error ? err.message : String(err)
      jsonError(res, 500, `Internal error: ${msg}`)
    }
  }
}

// ─── Session persistence ───────────────────────────────────

interface PersistArgs {
  jwt: string
  userId: string
  sessionId?: string
  incoming: UIMessage[]
  assistantText: string
  usage: { input_tokens: number; output_tokens: number }
  provider: Provider
  model: string
  context?: Record<string, unknown>
}

async function persistSession(args: PersistArgs): Promise<void> {
  if (!args.assistantText) return

  const supa = supabaseForUser(args.jwt)
  const turnIn = args.usage.input_tokens
  const turnOut = args.usage.output_tokens

  const flattened = args.incoming.map((m) => ({
    role: m.role,
    content: uiMessageText(m),
    timestamp: new Date().toISOString(),
  }))
  flattened.push({
    role: 'assistant',
    content: args.assistantText,
    timestamp: new Date().toISOString(),
  })

  const contextWithMeta = {
    ...(args.context ?? {}),
    provider: args.provider,
    model: args.model,
  }

  if (args.sessionId) {
    const { data: existing } = await supa
      .from('chef_chat_sessions')
      .select('messages, token_count_in, token_count_out')
      .eq('id', args.sessionId)
      .maybeSingle()

    const mergedMessages = existing?.messages
      ? [...(existing.messages as unknown[]), ...flattened]
      : flattened

    await supa
      .from('chef_chat_sessions')
      .update({
        messages: mergedMessages,
        token_count_in: (existing?.token_count_in ?? 0) + turnIn,
        token_count_out: (existing?.token_count_out ?? 0) + turnOut,
        context: contextWithMeta,
      })
      .eq('id', args.sessionId)
  } else {
    await supa.from('chef_chat_sessions').insert({
      user_id: args.userId,
      surface: 'erp_chat',
      messages: flattened,
      context: contextWithMeta,
      token_count_in: turnIn,
      token_count_out: turnOut,
    })
  }
}

function uiMessageText(m: UIMessage): string {
  if (typeof (m as unknown as { content?: string }).content === 'string') {
    return (m as unknown as { content: string }).content
  }
  const parts = (m as unknown as { parts?: Array<{ type: string; text?: string }> }).parts
  if (Array.isArray(parts)) {
    return parts
      .filter((p) => p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text)
      .join('')
  }
  return ''
}
