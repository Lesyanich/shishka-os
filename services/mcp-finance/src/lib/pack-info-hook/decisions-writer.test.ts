import { describe, it, expect, vi } from 'vitest';
import { writeAutoApply, writePending, writeSkip } from './decisions-writer.js';
import type { ResolverResult } from '../pack-info-resolver/types.js';

const NID = 'd411c6ec-b843-46c7-8cd4-eba0f6efe19a';
const RULE_ID = '11111111-1111-1111-1111-111111111111';
const RUN_ID = '22222222-2222-2222-2222-222222222222';

function makeStubSb() {
  const captured: Array<{ table: string; payload: any }> = [];
  const buildBuilder = (table: string) => ({
    insert: vi.fn((payload: any) => {
      captured.push({ table, payload });
      return Promise.resolve({ data: null, error: null });
    }),
    update: vi.fn((payload: any) => {
      const upd: any = {
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        then: (resolve: any) => {
          captured.push({ table, payload });
          resolve({ data: null, error: null });
        },
      };
      return upd;
    }),
  });
  return {
    captured,
    from: vi.fn((t: string) => buildBuilder(t)),
  };
}

const RESOLVED: ResolverResult = {
  nomenclature_id: NID,
  resolved: {
    base_unit: 'kg',
    package_weight: '500g',
    package_qty: 500,
    package_unit: 'g',
    cost_per_kg: 266,
  },
  source: 'supplier_catalog_exact',
  confidence: 1.0,
  conflicts: [],
  evidence: {},
};

describe('writeAutoApply', () => {
  it('updates nomenclature.base_unit + supplier_catalog cache + writes applied decision', async () => {
    const sb = makeStubSb();
    await writeAutoApply(sb as any, {
      run_id: RUN_ID,
      rule_id: RULE_ID,
      result: RESOLVED,
      supplier_id: 'sup-1',
      current_base_unit: 'pcs',
      current_cost_per_unit: 133,
    });
    const tables = sb.captured.map((c) => c.table);
    expect(tables).toContain('nomenclature');
    expect(tables).toContain('supplier_catalog');
    expect(tables).toContain('data_health_decisions');
    const applied = sb.captured.find((c) => c.table === 'data_health_decisions' && c.payload.status === 'applied');
    expect(applied).toBeDefined();
    expect(applied?.payload.field).toBe('base_unit');
    expect(applied?.payload.decision_source).toBe('rule_auto');
    expect(applied?.payload.confidence_score).toBe(1.0);
  });

  it('always inserts a separate pending row for cost_per_unit', async () => {
    const sb = makeStubSb();
    await writeAutoApply(sb as any, {
      run_id: RUN_ID,
      rule_id: RULE_ID,
      result: RESOLVED,
      supplier_id: 'sup-1',
      current_base_unit: 'pcs',
      current_cost_per_unit: 133,
    });
    const pendingCost = sb.captured.find(
      (c) =>
        c.table === 'data_health_decisions' &&
        c.payload.status === 'pending' &&
        c.payload.field === 'cost_per_unit',
    );
    expect(pendingCost).toBeDefined();
    expect(pendingCost?.payload.decision_source).toBe('rule_auto_cost_pending');
    expect(pendingCost?.payload.new_value).toBe('266');
    expect(pendingCost?.payload.old_value).toBe('133');
  });

  it('skips nomenclature update when base_unit already matches', async () => {
    const sb = makeStubSb();
    await writeAutoApply(sb as any, {
      run_id: RUN_ID,
      rule_id: RULE_ID,
      result: RESOLVED,
      supplier_id: 'sup-1',
      current_base_unit: 'kg', // already correct
      current_cost_per_unit: 133,
    });
    const noBaseUnitDecision = sb.captured.find(
      (c) => c.table === 'data_health_decisions' && c.payload.field === 'base_unit',
    );
    expect(noBaseUnitDecision).toBeUndefined();
  });
});

describe('writePending', () => {
  it('inserts a pending decision row with conflict source when conflicts exist', async () => {
    const sb = makeStubSb();
    const conflictResult: ResolverResult = {
      ...RESOLVED,
      resolved: null,
      source: null,
      confidence: 0.5,
      conflicts: [
        { source: 'supplier_catalog_fuzzy', pack_info: RESOLVED.resolved!, evidence: {} },
        {
          source: 'supplier_catalog_fuzzy',
          pack_info: { ...RESOLVED.resolved!, package_qty: 1, package_unit: 'kg', package_weight: '1kg' },
          evidence: {},
        },
      ],
    };
    await writePending(sb as any, {
      run_id: RUN_ID,
      rule_id: RULE_ID,
      result: conflictResult,
      current_base_unit: 'pcs',
    });
    const row = sb.captured.find((c) => c.table === 'data_health_decisions');
    expect(row?.payload.status).toBe('pending');
    expect(row?.payload.decision_source).toBe('rule_auto_conflict');
    expect(row?.payload.confidence_score).toBe(0.5);
  });

  it('uses rule_auto when low-confidence (no conflicts)', async () => {
    const sb = makeStubSb();
    const lowConfResult: ResolverResult = { ...RESOLVED, confidence: 0.6, source: 'makro_fuzzy' };
    await writePending(sb as any, {
      run_id: RUN_ID,
      rule_id: RULE_ID,
      result: lowConfResult,
      current_base_unit: 'pcs',
    });
    const row = sb.captured.find((c) => c.table === 'data_health_decisions');
    expect(row?.payload.status).toBe('pending');
    expect(row?.payload.decision_source).toBe('rule_auto');
  });
});

describe('writeSkip', () => {
  it('inserts a skip-decision row with empty resolved', async () => {
    const sb = makeStubSb();
    await writeSkip(sb as any, {
      run_id: RUN_ID,
      rule_id: RULE_ID,
      nomenclature_id: NID,
      current_base_unit: 'pcs',
      reason: 'cascade-fail',
    });
    const row = sb.captured.find((c) => c.table === 'data_health_decisions');
    expect(row?.payload.status).toBe('skip');
    expect(row?.payload.decision_source).toBe('skip');
    expect(row?.payload.confidence_score).toBe(0);
    expect(row?.payload.notes).toContain('cascade-fail');
  });
});
