import { describe, it, expect, vi } from 'vitest';
import { runPackInfoHook } from './hook.js';
import { makeStubProvider, SCROW } from '../pack-info-resolver/fixtures.js';

const EXPENSE_ID = '33333333-3333-3333-3333-333333333333';
const NID_A = '44444444-4444-4444-4444-444444444444';
const NID_B = '55555555-5555-5555-5555-555555555555';
const RULE_ID = '11111111-1111-1111-1111-111111111111';

function makeStubSb(opts: {
  purchase_logs?: Array<Record<string, any>>;
  nomenclature?: Array<Record<string, any>>;
  rule_id?: string;
}) {
  const captured: Array<{ table: string; op: 'insert' | 'update'; payload: any }> = [];
  return {
    captured,
    from: vi.fn((table: string) => {
      const builder: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (table === 'data_health_rules') {
            return Promise.resolve({ data: { id: opts.rule_id ?? RULE_ID }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
        insert: vi.fn((payload: any) => {
          captured.push({ table, op: 'insert', payload });
          return Promise.resolve({ data: null, error: null });
        }),
        update: vi.fn((payload: any) => {
          captured.push({ table, op: 'update', payload });
          return {
            eq: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ data: null, error: null }),
          };
        }),
        then: (resolve: any) => {
          if (table === 'purchase_logs') {
            resolve({ data: opts.purchase_logs ?? [], error: null });
          } else if (table === 'nomenclature') {
            resolve({ data: opts.nomenclature ?? [], error: null });
          } else if (table === 'data_health_decisions') {
            resolve({ data: [], error: null });
          } else {
            resolve({ data: null, error: null });
          }
        },
      };
      return builder;
    }),
  };
}

describe('runPackInfoHook', () => {
  it('runs resolver per purchase_log line and writes auto-apply on conf=1.0', async () => {
    const sb = makeStubSb({
      purchase_logs: [
        { nomenclature_id: NID_A, supplier_id: 'sup-1', barcode: '8005121004113', price_per_unit: 133 },
      ],
      nomenclature: [{ id: NID_A, base_unit: 'pcs', cost_per_unit: 133, name: 'Divella Farina' }],
    });
    const provider = makeStubProvider({ sc_exact: [SCROW()] });
    const result = await runPackInfoHook(sb as any, provider, {
      expense_id: EXPENSE_ID,
      food_items: [{ name: 'Divella Farina', brand: 'Divella', barcode: '8005121004113' } as any],
    });
    expect(result.corrections.length).toBe(1);
    expect(result.corrections[0].source).toBe('supplier_catalog_exact');
    expect(result.corrections[0].action).toBe('auto-applied');
    expect(result.errors.length).toBe(0);

    const ddhInsert = sb.captured.find((c) => c.table === 'data_health_decisions' && c.op === 'insert');
    expect(ddhInsert).toBeDefined();
    const nomUpdate = sb.captured.find((c) => c.table === 'nomenclature' && c.op === 'update');
    expect(nomUpdate).toBeDefined();
  });

  it('skips lines whose nomenclature is in 7-day cooldown', async () => {
    const sb = makeStubSb({
      purchase_logs: [{ nomenclature_id: NID_B, supplier_id: 'sup-1', barcode: null, price_per_unit: 200 }],
      nomenclature: [{ id: NID_B, base_unit: 'pcs', cost_per_unit: 200, name: 'Mystery Item' }],
    });
    const originalFrom = sb.from;
    sb.from = vi.fn((table: string) => {
      const builder: any = originalFrom(table);
      if (table === 'data_health_decisions') {
        builder.limit = vi.fn().mockResolvedValue({ data: [{ id: 'cooldown-row' }], error: null });
      }
      return builder;
    }) as any;
    const provider = makeStubProvider({});
    const result = await runPackInfoHook(sb as any, provider, {
      expense_id: EXPENSE_ID,
      food_items: [{ name: 'Mystery Item' } as any],
    });
    expect(result.corrections.length).toBe(0);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0].reason).toBe('7d-cooldown');
  });

  it('routes conflicts to pending', async () => {
    const sb = makeStubSb({
      purchase_logs: [{ nomenclature_id: NID_A, supplier_id: 'sup-1', barcode: null, price_per_unit: 100 }],
      nomenclature: [{ id: NID_A, base_unit: 'pcs', cost_per_unit: 100, name: 'Conflict Item' }],
    });
    const provider = makeStubProvider({
      sc_fuzzy: [
        SCROW({ package_weight: '500g', package_qty: 500, package_unit: 'g' }),
        SCROW({ package_weight: '1kg', package_qty: 1, package_unit: 'kg' }),
      ],
    });
    const result = await runPackInfoHook(sb as any, provider, {
      expense_id: EXPENSE_ID,
      food_items: [{ name: 'Conflict Item' } as any],
    });
    expect(result.corrections.length).toBe(1);
    expect(result.corrections[0].action).toBe('pending');
    expect(result.corrections[0].confidence).toBe(0.5);
  });

  it('records makro errors via telemetry callback', async () => {
    const sb = makeStubSb({
      purchase_logs: [{ nomenclature_id: NID_A, supplier_id: 'sup-1', barcode: '8005121004113', price_per_unit: 100 }],
      nomenclature: [{ id: NID_A, base_unit: 'pcs', cost_per_unit: 100, name: 'Foo' }],
    });
    const provider = makeStubProvider({ throwOnMakroBarcode: true });
    const result = await runPackInfoHook(sb as any, provider, {
      expense_id: EXPENSE_ID,
      food_items: [{ name: 'Foo', barcode: '8005121004113' } as any],
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].level).toBe('barcode');
    expect(result.errors[0].nomenclature_id).toBe(NID_A);
  });

  it('captures resolve-stage error and continues batch', async () => {
    const sb = makeStubSb({
      purchase_logs: [
        { nomenclature_id: NID_A, supplier_id: 'sup-1', barcode: '8005121004113', price_per_unit: 100 },
      ],
      nomenclature: [{ id: NID_A, base_unit: 'pcs', cost_per_unit: 100, name: 'Foo' }],
    });
    const provider = makeStubProvider({ throwOnScExact: true });
    const result = await runPackInfoHook(sb as any, provider, {
      expense_id: EXPENSE_ID,
      food_items: [{ name: 'Foo', barcode: '8005121004113' } as any],
    });
    expect(result.errors.length).toBeGreaterThan(0);
    const resolveErr = result.errors.find((e) => e.stage === 'resolve');
    expect(resolveErr).toBeDefined();
    expect(resolveErr?.nomenclature_id).toBe(NID_A);
    expect(result.corrections.length).toBe(0);
  });

  it('returns empty corrections + an error when purchase_logs query fails (graceful)', async () => {
    const sb = makeStubSb({});
    sb.from = vi.fn((table: string) => {
      if (table === 'purchase_logs') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: (resolve: any) => resolve({ data: null, error: { message: 'db down' } }),
        } as any;
      }
      return { from: vi.fn() } as any;
    }) as any;
    const provider = makeStubProvider({});
    const result = await runPackInfoHook(sb as any, provider, {
      expense_id: EXPENSE_ID,
      food_items: [],
    });
    expect(result.corrections).toEqual([]);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].stage).toBe('fetch-purchase-logs');
  });
});
