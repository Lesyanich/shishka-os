import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  const c = getSupabaseOptional();
  if (!c) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
    );
  }
  return c;
}

/**
 * Like getSupabase() but returns null when env vars are missing instead of
 * throwing. Use in code paths that must degrade gracefully (e.g., post-commit
 * hook running on a dev machine without .env).
 */
export function getSupabaseOptional(): SupabaseClient | null {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return client;
}
