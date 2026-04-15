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
