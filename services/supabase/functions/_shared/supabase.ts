import { createClient } from "npm:@supabase/supabase-js@2"

export const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
export const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
export const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? ""
export const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? ""
export const googleKey = Deno.env.get("GOOGLE_API_KEY") ?? ""
export const googleVisionKey = Deno.env.get("GOOGLE_API_KEY_VISAI") ?? Deno.env.get("GOOGLE_API_KEY") ?? ""

export const db = createClient(supabaseUrl, supabaseKey)
