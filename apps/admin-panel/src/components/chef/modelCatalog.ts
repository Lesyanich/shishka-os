// Frontend mirror of api/_lib/llm.ts AVAILABLE_MODELS.
// Kept as a separate file so the React bundle doesn't pull the SDK provider imports.
// Keep in sync with api/_lib/llm.ts when adding/removing models.

export type Provider = 'anthropic' | 'openai' | 'google'

export interface ModelOption {
  provider: Provider
  id: string
  label: string
  tier: 'quality' | 'balanced' | 'fast'
  context_window_k: number
  notes?: string
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { provider: 'anthropic', id: 'claude-opus-4-6', label: 'Claude Opus 4.6', tier: 'quality', context_window_k: 1000, notes: '1M context; best reasoning' },
  { provider: 'anthropic', id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', tier: 'balanced', context_window_k: 200, notes: 'Best value' },
  { provider: 'anthropic', id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', tier: 'fast', context_window_k: 200, notes: 'Cheapest; fast' },
  { provider: 'openai', id: 'gpt-4o', label: 'GPT-4o', tier: 'balanced', context_window_k: 128 },
  { provider: 'openai', id: 'gpt-4o-mini', label: 'GPT-4o mini', tier: 'fast', context_window_k: 128 },
  { provider: 'google', id: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash', tier: 'fast', context_window_k: 1000 },
  { provider: 'google', id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', tier: 'quality', context_window_k: 2000 },
]

export const DEFAULT_MODEL: ModelOption = AVAILABLE_MODELS[1] // Claude Sonnet 4.6

const STORAGE_KEY = 'shishka.chef.selectedModel'

export function loadSelectedModel(): ModelOption {
  if (typeof localStorage === 'undefined') return DEFAULT_MODEL
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_MODEL
    const parsed = JSON.parse(raw) as { provider?: string; id?: string }
    const found = AVAILABLE_MODELS.find((m) => m.provider === parsed.provider && m.id === parsed.id)
    return found ?? DEFAULT_MODEL
  } catch {
    return DEFAULT_MODEL
  }
}

export function saveSelectedModel(m: ModelOption): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ provider: m.provider, id: m.id }))
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export function providerLabel(p: Provider): string {
  switch (p) {
    case 'anthropic': return 'Claude'
    case 'openai': return 'OpenAI'
    case 'google': return 'Gemini'
  }
}

export function tierColor(t: ModelOption['tier']): string {
  switch (t) {
    case 'quality': return 'bg-violet-500/15 text-violet-300'
    case 'balanced': return 'bg-emerald-500/15 text-emerald-300'
    case 'fast': return 'bg-sky-500/15 text-sky-300'
  }
}
