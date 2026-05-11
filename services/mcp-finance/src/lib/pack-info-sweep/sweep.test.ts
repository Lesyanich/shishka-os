import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPackInfoSweep } from './sweep.js';
import { makeStubProvider } from '../pack-info-resolver/fixtures.js';
import type { SweepCandidate } from './candidates.js';

const NID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SUP = '99999999-9999-9999-9999-999999999999';
const RULE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeCandidate(over: Partial<SweepCandidate> = {}): SweepCandidate {
  return {
    nomenclature_id: NID_A,
    base_unit: 'pcs',
    cost_per_unit: 30,
    name: 'Test Item',
    recent_supplier_id: SUP,
    recent_barcode: '8005121004113',
    recent_price_per_unit: 133,
    ...over,
  };
}

/**
 * Builds a fake SupabaseClient stub with:
 *  - rpc('pack_info_sweep_candidates') → returns `candidates`
 *  - from('data_health_rules') → returns the rule row
 *  - from('data_health_decisions') / .insert() → records calls
 *  - from('nomenclature') / .update() → records calls
 *  - from('supplier_catalog') / .update() → records calls
 *  - cooldown queries return empty (no recent skips)
 */
function makeSb(opts: {
  candidates: SweepCandidate[];
  ruleErr?: string;
  cooldownHit?: boolean;
}) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];

  const rpc = vi.fn().mockResolvedValue({ data: opts.candidates, error: null });

  const from = vi.fn((table: string) => {
    if (table === 'data_health_rules') {
      return {
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue(
              opts.ruleErr
                ? { data: null, error: { message: opts.ruleErr } }
                : { data: { id: RULE_ID }, error: null },
            ),
          }),
        }),
      };
    }
    if (table === 'data_health_decisions') {
      const cooldownData = opts.cooldownHit ? [{ id: 'x' }] : [];
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                gt: () => ({
                  limit: vi.fn().mockResolvedValue({ data: cooldownData, error: null }),
                }),
              }),
            }),
          }),
        }),
        insert: vi.fn((row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return Promise.resolve({ data: null, error: null });
        }),
      };
    }
    if (table === 'nomenclature') {
      return {
        update: vi.fn((patch: Record<string, unknown>) => {
          updates.push({ table, patch });
          return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }),
      };
    }
    if (table === 'supplier_catalog') {
      return {
        update: vi.fn((patch: Record<string, unknown>) => {
          updates.push({ table, patch });
          return {
            eq: () => ({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return {
    sb: { rpc, from } as unknown as Parameters<typeof runPackInfoSweep>[0],
    inserts,
    updates,
  };
}

describe('runPackInfoSweep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-applies when resolver returns confidence >= 0.9 with resolved pack', async () => {
    const provider = makeStubProvider({
      sc_exact: [
        {
          supplier_id: SUP,
          barcode: '8005121004113',
          package_weight: '500g',
          package_qty: 500,
          package_unit: 'g',
          product_name: 'Test Item',
          brand: null,
        },
      ],
    });
    const { sb, inserts, updates } = makeSb({ candidates: [makeCandidate()] });
    const result = await runPackInfoSweep(sb, provider, { limit: 10 });

    expect(result.errors).toEqual([]);
    expect(result.auto_applied).toHaveLength(1);
    expect(result.auto_applied[0].nomenclature_id).toBe(NID_A);
    expect(result.auto_applied[0].action).toBe('auto-applied');

    // nomenclature base_unit was updated (pcs → kg / g)
    expect(updates.some((u) => u.table === 'nomenclature' && u.patch.base_unit !== undefined)).toBe(true);
    // supplier_catalog cache was refreshed
    expect(updates.some((u) => u.table === 'supplier_catalog')).toBe(true);
    // applied decision row exists
    expect(inserts.some((i) => i.row.status === 'applied' && i.row.field === 'base_unit')).toBe(true);
    // cost_per_unit pending row exists
    expect(
      inserts.some((i) => i.row.status === 'pending' && i.row.field === 'cost_per_unit'),
    ).toBe(true);
  });

  it('queues pending when the resolver returns 0.5 <= conf < 0.9 (makro_fuzzy hit)', async () => {
    const provider = makeStubProvider({
      makro_name: { found: true, name: 'Mystery Flour', unit: '500g', brand: null },
    });
    const { sb, inserts } = makeSb({
      candidates: [
        makeCandidate({
          recent_barcode: null,
          name: 'Mystery Flour',
        }),
      ],
    });
    const result = await runPackInfoSweep(sb, provider, { limit: 10 });

    expect(result.errors).toEqual([]);
    expect(result.pending).toHaveLength(1);
    expect(result.auto_applied).toEqual([]);
    expect(inserts.some((i) => i.row.status === 'pending' && i.row.decision_source === 'rule_auto')).toBe(true);
  });

  it('records conflict-driven pending when two supplier_catalog rows disagree', async () => {
    const provider = makeStubProvider({
      sc_fuzzy: [
        {
          supplier_id: SUP,
          barcode: null,
          package_weight: '500g',
          package_qty: 500,
          package_unit: 'g',
          product_name: 'Test Item',
          brand: null,
        },
        {
          supplier_id: 'sup-other',
          barcode: null,
          package_weight: '1kg',
          package_qty: 1,
          package_unit: 'kg',
          product_name: 'Test Item',
          brand: null,
        },
      ],
    });
    const { sb, inserts } = makeSb({
      candidates: [makeCandidate({ recent_barcode: null })],
    });
    const result = await runPackInfoSweep(sb, provider, { limit: 10 });

    expect(result.pending).toHaveLength(1);
    expect(inserts.some((i) => i.row.decision_source === 'rule_auto_conflict' && i.row.status === 'pending')).toBe(true);
  });

  it('writes a skip-decision when cascade fails entirely', async () => {
    const provider = makeStubProvider({}); // every source empty / not-found
    const { sb, inserts } = makeSb({ candidates: [makeCandidate({ recent_barcode: null })] });
    const result = await runPackInfoSweep(sb, provider, { limit: 10 });

    expect(result.skipped.some((s) => s.reason === 'cascade-fail')).toBe(true);
    expect(inserts.some((i) => i.row.status === 'skip' && i.row.decision_source === 'skip')).toBe(true);
  });

  it('honors the 7-day cooldown — skips silently without writing', async () => {
    const provider = makeStubProvider({});
    const { sb, inserts } = makeSb({
      candidates: [makeCandidate()],
      cooldownHit: true,
    });
    const result = await runPackInfoSweep(sb, provider, { limit: 10 });

    expect(result.skipped.some((s) => s.reason === '7d-cooldown')).toBe(true);
    // No insert at all (cooldown is "do nothing", not "re-skip")
    expect(inserts).toEqual([]);
  });

  it('returns a sweep-fetch error and an empty result when the RPC fails', async () => {
    const provider = makeStubProvider({});
    const sb = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } }),
      from: vi.fn(),
    } as unknown as Parameters<typeof runPackInfoSweep>[0];
    const result = await runPackInfoSweep(sb, provider, { limit: 10 });
    expect(result.errors[0].stage).toBe('sweep-fetch');
    expect(result.errors[0].message).toContain('permission denied');
    expect(result.auto_applied).toEqual([]);
    expect(result.pending).toEqual([]);
  });

  it('emits a fetch-rule error and skips work when the rule lookup fails', async () => {
    const provider = makeStubProvider({});
    const { sb } = makeSb({ candidates: [makeCandidate()], ruleErr: 'no row' });
    const result = await runPackInfoSweep(sb, provider, { limit: 10 });
    expect(result.errors.some((e) => e.stage === 'fetch-rule')).toBe(true);
  });

  it('uses the provided run_id when supplied', async () => {
    const provider = makeStubProvider({});
    const { sb, inserts } = makeSb({ candidates: [makeCandidate({ recent_barcode: null })] });
    const RUN = '00000000-0000-0000-0000-000000000099';
    await runPackInfoSweep(sb, provider, { limit: 10, runId: RUN });
    // skip row carries the run_id
    expect(inserts.some((i) => i.row.run_id === RUN)).toBe(true);
  });
});
