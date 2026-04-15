// Anthropic Claude API client for Vercel Functions.
// Files prefixed with `_` are not exposed as routes by Vercel.

import Anthropic from '@anthropic-ai/sdk'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

if (!ANTHROPIC_API_KEY && process.env.NODE_ENV !== 'test') {
  console.warn('[anthropic] ANTHROPIC_API_KEY is not set — chef endpoints will fail at runtime')
}

/** Default model for chef chat. Override per-request if needed. */
export const DEFAULT_MODEL = 'claude-sonnet-4-6'

/** Conservative default token cap per response. */
export const DEFAULT_MAX_TOKENS = 2048

export function anthropicClient(): Anthropic {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY env var is required')
  }
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY })
}
