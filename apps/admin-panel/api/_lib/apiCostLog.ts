// Insert a row into public.api_cost_log.
//
// RLS on api_cost_log only lets service_role INSERT (migration 106), so this
// must use supabaseService(). Call from server code only — never from a route
// that runs under a user JWT.

import { supabaseService } from './supabase.js'
import { computeCostUsd, type Provider } from './llm.js'

export interface LogApiCostArgs {
  service: Provider            // 'anthropic' | 'openai' | 'google'
  model: string                // modelId as passed to the SDK
  feature: string              // 'chef-chat', 'receipt-ocr', …
  tokens_in: number
  tokens_out: number
  cost_usd?: number            // optional override; default = computeCostUsd(model, in, out)
  reference_id?: string | null // e.g. chef_chat_sessions.id
  reference_type?: string | null
  metadata?: Record<string, unknown>
  error?: string | null
}

/**
 * Best-effort: never throws. Failures are logged to console and swallowed,
 * so a cost-logging hiccup cannot break the user-visible response.
 */
export async function logApiCost(args: LogApiCostArgs): Promise<void> {
  try {
    const supa = supabaseService()
    const cost =
      args.cost_usd ?? computeCostUsd(args.model, args.tokens_in, args.tokens_out)

    const { error } = await supa.from('api_cost_log').insert({
      service: args.service,
      model: args.model,
      feature: args.feature,
      tokens_in: args.tokens_in,
      tokens_out: args.tokens_out,
      cost_usd: cost,
      reference_id: args.reference_id ?? null,
      reference_type: args.reference_type ?? null,
      metadata: args.metadata ?? null,
      error: args.error ?? null,
    })

    if (error) {
      console.error('[logApiCost] insert failed', error)
    }
  } catch (e) {
    console.error('[logApiCost] threw', e)
  }
}
