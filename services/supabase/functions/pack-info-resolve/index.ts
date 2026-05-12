// ═══════════════════════════════════════════════════════════
// Edge Function: pack-info-resolve
// ═══════════════════════════════════════════════════════════
// Wraps the pack-info hook (MCP source-of-truth) so the admin
// panel can run it after fn_approve_receipt_with_learning.
//
// Input:  { expense_id: string, food_items: FoodItemInput[] }
// Output: HookResult { corrections, skipped, errors }
//
// Best-effort semantics — admin caller treats errors as non-fatal.
// Hook code is vendored under ../_shared/pack-info/ (see VENDOR.md).
// Originating task: 6b675b23
// ═══════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2";
import { runPackInfoHook } from "../_shared/pack-info/pack-info-hook/index.ts";
import {
  createSupabaseProvider,
  type MakroResult,
} from "../_shared/pack-info/pack-info-resolver/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
};

const MAKRO_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// Minimal Makro lookup — mirrors services/mcp-finance/src/tools/makro-lookup.ts
// but returns only the fields the resolver consumes (MakroResult).
async function fetchMakro(query: string): Promise<MakroResult> {
  const empty: MakroResult = { found: false, name: null, unit: null, brand: null };
  if (!query) return empty;
  const url = `https://www.makro.pro/search?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": MAKRO_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9,th;q=0.8",
      },
    });
    if (!res.ok) return empty;
    const html = await res.text();
    const nextDataMatch = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
    );
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        const products =
          nextData?.props?.pageProps?.initialData?.products ||
          nextData?.props?.pageProps?.products ||
          [];
        if (products.length > 0) {
          const p = products[0];
          return {
            found: true,
            name: p.name ?? p.title ?? null,
            unit: p.unit ?? p.uom ?? null,
            brand: p.brand ?? null,
          };
        }
      } catch {
        // fall through
      }
    }
    return empty;
  } catch {
    return empty;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
      { status: 500, headers: JSON_HEADERS },
    );
  }

  let body: { expense_id?: string; food_items?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json body" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const expense_id = body.expense_id;
  if (!expense_id || typeof expense_id !== "string") {
    return new Response(
      JSON.stringify({ error: "expense_id (uuid) is required" }),
      { status: 400, headers: JSON_HEADERS },
    );
  }
  const food_items = Array.isArray(body.food_items) ? body.food_items : [];

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const provider = createSupabaseProvider(sb, fetchMakro);

  try {
    const result = await runPackInfoHook(sb, provider, {
      expense_id,
      // deno-lint-ignore no-explicit-any
      food_items: food_items as any,
    });
    return new Response(JSON.stringify(result), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[pack-info-resolve] hook crashed", message);
    return new Response(
      JSON.stringify({
        corrections: [],
        skipped: [],
        errors: [{ stage: "hook-init", message }],
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  }
});
