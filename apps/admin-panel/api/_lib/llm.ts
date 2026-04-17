// Multi-provider LLM model registry.
// Files prefixed with `_` are not exposed as routes by Vercel.
//
// Adds Anthropic, OpenAI, Google support via Vercel AI SDK.
// Env vars (match existing project convention):
//   ANTHROPIC_API_KEY   (shishka-anthropic-api-key in keychain)
//   OPENAI_API_KEY      (shishka-openAI-api-key in keychain)
//   GOOGLE_API_KEY      (Supabase Edge Function secrets — same as OCR)

import { anthropic, createAnthropic } from '@ai-sdk/anthropic'
import { openai, createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModel } from 'ai'

export type Provider = 'anthropic' | 'openai' | 'google'

export interface ModelOption {
  provider: Provider
  id: string
  label: string
  tier: 'quality' | 'balanced' | 'fast'
  context_window_k: number
  notes?: string
}

/** Model catalog exposed to the UI model selector. */
export const AVAILABLE_MODELS: ModelOption[] = [
  // Anthropic — Claude 4.6 family (latest)
  { provider: 'anthropic', id: 'claude-opus-4-6', label: 'Claude Opus 4.6', tier: 'quality', context_window_k: 1000, notes: '1M context; best reasoning' },
  { provider: 'anthropic', id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', tier: 'balanced', context_window_k: 200, notes: 'Best value for routine work' },
  { provider: 'anthropic', id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', tier: 'fast', context_window_k: 200, notes: 'Cheapest; fast turns' },
  // OpenAI
  { provider: 'openai', id: 'gpt-4o', label: 'GPT-4o', tier: 'balanced', context_window_k: 128 },
  { provider: 'openai', id: 'gpt-4o-mini', label: 'GPT-4o mini', tier: 'fast', context_window_k: 128 },
  // Google — uses GOOGLE_API_KEY (same as OCR pipeline, not GOOGLE_GENERATIVE_AI_API_KEY)
  { provider: 'google', id: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash', tier: 'fast', context_window_k: 1000 },
  { provider: 'google', id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', tier: 'quality', context_window_k: 2000 },
]

export const DEFAULT_MODEL: ModelOption = AVAILABLE_MODELS[1] // Claude Sonnet 4.6

function googleProvider() {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) throw new Error('GOOGLE_API_KEY env var is required for Google provider')
  return createGoogleGenerativeAI({ apiKey })
}

/**
 * Resolve a provider + model id to an AI SDK LanguageModel.
 * Throws if provider/model combination is unknown or required env is missing.
 */
export function getLanguageModel(provider: Provider, modelId: string): LanguageModel {
  const known = AVAILABLE_MODELS.find((m) => m.provider === provider && m.id === modelId)
  if (!known) {
    throw new Error(`Unknown model: ${provider}/${modelId}. See AVAILABLE_MODELS.`)
  }

  switch (provider) {
    case 'anthropic':
      if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY env var is required')
      return anthropic(modelId) as LanguageModel
    case 'openai':
      if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY env var is required')
      return openai(modelId) as LanguageModel
    case 'google':
      return googleProvider()(modelId) as LanguageModel
  }
}

/** Unused-export suppressors (keep factories around for per-request overrides later). */
export const _providers = { anthropic: createAnthropic, openai: createOpenAI }

// ─── Pricing (USD per token) ────────────────────────────────
// Source: provider pricing pages. Keep the map keyed by the same modelId we
// pass to the SDK. Unlisted models fall back to zero cost (still logged, so
// we see usage even if price isn't wired up yet — easier to audit later).
interface ModelPrice {
  input: number  // USD per input token
  output: number // USD per output token
}

export const MODEL_PRICING: Record<string, ModelPrice> = {
  // Anthropic
  'claude-opus-4-6':    { input: 15 / 1_000_000, output: 75 / 1_000_000 },
  'claude-sonnet-4-6':  { input:  3 / 1_000_000, output: 15 / 1_000_000 },
  'claude-haiku-4-5':   { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
  // OpenAI
  'gpt-4o':             { input: 2.5 / 1_000_000, output: 10 / 1_000_000 },
  'gpt-4o-mini':        { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
  // Google — base tier pricing (Gemini 1.5 Pro has a second tier above 128k context)
  'gemini-2.0-flash-exp': { input: 0.10 / 1_000_000, output: 0.40 / 1_000_000 },
  'gemini-1.5-pro':       { input: 1.25 / 1_000_000, output: 5.00 / 1_000_000 },
}

/**
 * Compute USD cost for a single chat turn. Returns 0 if the model isn't in
 * MODEL_PRICING — the row is still logged so we can see usage.
 */
export function computeCostUsd(
  modelId: string,
  tokens_in: number,
  tokens_out: number,
): number {
  const p = MODEL_PRICING[modelId]
  if (!p) return 0
  return tokens_in * p.input + tokens_out * p.output
}
