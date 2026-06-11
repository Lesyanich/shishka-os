import { createClient } from '@supabase/supabase-js'

// Anonymous client for the public menu. Reads v_public_menu (anon-safe view) and
// invokes the create-order edge function. Never inserts into orders directly.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set.')
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
})
