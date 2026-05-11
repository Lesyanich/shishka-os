import { createClient } from '@supabase/supabase-js';
import { runPackInfoSweep, postSweepSummary } from '../lib/pack-info-sweep/index.js';
import { createSupabaseProvider, type MakroResult } from '../lib/pack-info-resolver/index.js';
import { makroLookup } from '../tools/makro-lookup.js';

export interface JobConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  limit: number;
  mcTaskId: string | null;
}

export type ConfigResult =
  | { ok: true; value: JobConfig }
  | { ok: false; error: string };

interface RawEnv {
  SUPABASE_URL: string | undefined;
  SUPABASE_SERVICE_ROLE_KEY: string | undefined;
  PACK_INFO_SWEEP_LIMIT: string | undefined;
  PACK_INFO_SWEEP_MC_TASK_ID: string | undefined;
}

/** Pure function — exported for unit testing. */
export function resolveJobConfig(env: RawEnv): ConfigResult {
  if (!env.SUPABASE_URL) return { ok: false, error: 'missing SUPABASE_URL' };
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, error: 'missing SUPABASE_SERVICE_ROLE_KEY' };

  let limit = 100;
  if (env.PACK_INFO_SWEEP_LIMIT !== undefined) {
    const parsed = Number.parseInt(env.PACK_INFO_SWEEP_LIMIT, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return { ok: false, error: `PACK_INFO_SWEEP_LIMIT must be a positive integer (got: ${env.PACK_INFO_SWEEP_LIMIT})` };
    }
    limit = parsed;
  }

  return {
    ok: true,
    value: {
      supabaseUrl: env.SUPABASE_URL,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      limit,
      mcTaskId: env.PACK_INFO_SWEEP_MC_TASK_ID ?? null,
    },
  };
}

async function main(): Promise<number> {
  const cfg = resolveJobConfig({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    PACK_INFO_SWEEP_LIMIT: process.env.PACK_INFO_SWEEP_LIMIT,
    PACK_INFO_SWEEP_MC_TASK_ID: process.env.PACK_INFO_SWEEP_MC_TASK_ID,
  });
  if (!cfg.ok) {
    console.error(`[pack-info-sweep] config error: ${cfg.error}`);
    return 2;
  }

  const sb = createClient(cfg.value.supabaseUrl, cfg.value.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Same adapter shape as services/mcp-finance/src/tools/approve-receipt.ts:174
  // — createSupabaseProvider takes a single fetchMakro(query) function and
  // routes both barcode + name lookups through it.
  const fetchMakro = async (q: string): Promise<MakroResult> => {
    const raw = await makroLookup({ barcode: q });
    const r = raw as { found?: boolean; name?: string | null; unit?: string | null; brand?: string | null };
    return {
      found: !!r.found,
      name: r.name ?? null,
      unit: r.unit ?? null,
      brand: r.brand ?? null,
    };
  };
  const provider = createSupabaseProvider(sb, fetchMakro);

  const result = await runPackInfoSweep(sb, provider, { limit: cfg.value.limit });
  await postSweepSummary(sb, { task_id: cfg.value.mcTaskId, result });

  // Exit 0 even when the sweep reports per-row errors — the cron should not
  // be marked "failed" on an external-source flake. The summary already
  // carries the error list; a non-zero exit is reserved for catastrophic
  // failure (config, RPC, etc.) where main throws.
  return 0;
}

// ES-module entrypoint guard
const invokedDirectly =
  typeof (globalThis as { process?: { argv: string[] } }).process !== 'undefined' &&
  (import.meta as { url: string }).url === `file://${(globalThis as { process: { argv: string[] } }).process.argv[1]}`;

if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`[pack-info-sweep] fatal: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    });
}
