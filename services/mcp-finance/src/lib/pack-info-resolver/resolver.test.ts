import { describe, it, expect } from 'vitest';
import { resolve } from './resolver.js';
import { makeStubProvider, SCROW } from './fixtures.js';

const NID = 'd411c6ec-b843-46c7-8cd4-eba0f6efe19a';

describe('resolve()', () => {
  it('returns supplier_catalog_exact at conf=1.0 when barcode matches one row', async () => {
    const provider = makeStubProvider({ sc_exact: [SCROW()] });
    const r = await resolve({ nomenclature_id: NID, barcode: '8005121004113', last_price_thb: 133, supplier_id: 'sup-1' }, provider);
    expect(r.source).toBe('supplier_catalog_exact');
    expect(r.confidence).toBe(1.0);
    expect(r.resolved?.package_qty).toBe(500);
    expect(r.resolved?.package_unit).toBe('g');
    expect(r.resolved?.cost_per_kg).toBeCloseTo(266, 0);
    expect(r.conflicts).toEqual([]);
  });

  it('falls back to fuzzy when no barcode given', async () => {
    const provider = makeStubProvider({ sc_fuzzy: [SCROW()] });
    const r = await resolve({ nomenclature_id: NID, last_price_thb: 133, supplier_id: 'sup-1' }, provider);
    expect(r.source).toBe('supplier_catalog_fuzzy');
    expect(r.confidence).toBe(0.85);
  });

  it('detects conflict when fuzzy returns multiple rows with different pack_weight', async () => {
    const provider = makeStubProvider({
      sc_fuzzy: [SCROW({ package_weight: '500g', package_qty: 500 }), SCROW({ package_weight: '1kg', package_qty: 1, package_unit: 'kg' })],
    });
    const r = await resolve({ nomenclature_id: NID, last_price_thb: 133, supplier_id: 'sup-1' }, provider);
    expect(r.confidence).toBe(0.5);
    expect(r.conflicts.length).toBe(2);
    expect(r.resolved).toBeNull();
  });

  it('reaches makro_barcode level when local sources empty', async () => {
    const provider = makeStubProvider({
      makro_barcode: { found: true, name: 'Divella Farina 500g', unit: '500g', brand: 'Divella' },
    });
    const r = await resolve({ nomenclature_id: NID, barcode: '8005121004113', last_price_thb: 133, supplier_id: 'sup-1' }, provider);
    expect(r.source).toBe('makro_barcode');
    expect(r.confidence).toBe(0.85);
    expect(r.resolved?.package_qty).toBe(500);
  });

  it('continues cascade when makro fetch throws', async () => {
    const provider = makeStubProvider({
      throwOnMakroBarcode: true,
      makro_name: { found: true, name: 'Divella Farina 500g', unit: '500g', brand: 'Divella' },
    });
    const r = await resolve({ nomenclature_id: NID, barcode: '8005121004113', last_price_thb: 133, supplier_id: 'sup-1', name: 'Divella Farina', brand: 'Divella' }, provider);
    expect(r.source).toBe('makro_fuzzy');
    expect(r.confidence).toBe(0.6);
  });

  it('correctly converts Liters to cost_per_kg (regression for L-unit bug)', async () => {
    const provider = makeStubProvider({
      makro_barcode: { found: true, name: 'Olive Oil 2L', unit: '2L', brand: 'Bertolli' },
    });
    const r = await resolve({ nomenclature_id: NID, barcode: '12345', last_price_thb: 500, supplier_id: 'sup-1' }, provider);
    expect(r.source).toBe('makro_barcode');
    expect(r.resolved?.package_qty).toBe(2);
    expect(r.resolved?.package_unit).toBe('L');
    // 500 THB / 2 L = 250 THB/L → as cost_per_kg field (semantic per-base-unit cost)
    expect(r.resolved?.cost_per_kg).toBeCloseTo(250, 1);
  });

  it('returns null resolved + 0 confidence when entire cascade fails', async () => {
    const provider = makeStubProvider({});
    const r = await resolve({ nomenclature_id: NID, last_price_thb: 133, supplier_id: 'sup-1' }, provider);
    expect(r.resolved).toBeNull();
    expect(r.source).toBeNull();
    expect(r.confidence).toBe(0);
  });
});

describe('resolve() — makro telemetry', () => {
  it('invokes onMakroError when makro barcode fetch throws', async () => {
    const errors: Array<{ err: Error; level: 'barcode' | 'fuzzy' }> = [];
    const provider = makeStubProvider({ throwOnMakroBarcode: true });
    const r = await resolve(
      {
        nomenclature_id: NID,
        supplier_id: 'sup-1',
        barcode: '8005121004113',
        last_price_thb: 133,
        onMakroError: (err, level) => errors.push({ err, level }),
      },
      provider,
    );
    expect(errors.length).toBe(1);
    expect(errors[0].level).toBe('barcode');
    expect(errors[0].err.message).toContain('makro');
    expect(r.resolved).toBeNull();
  });

  it('invokes onMakroError when makro fuzzy fetch throws', async () => {
    const errors: Array<{ err: Error; level: 'barcode' | 'fuzzy' }> = [];
    const provider = makeStubProvider({ throwOnMakroFuzzy: true });
    const r = await resolve(
      {
        nomenclature_id: NID,
        supplier_id: 'sup-1',
        name: 'Divella Farina',
        brand: 'Divella',
        last_price_thb: 133,
        onMakroError: (err, level) => errors.push({ err, level }),
      },
      provider,
    );
    expect(errors.length).toBe(1);
    expect(errors[0].level).toBe('fuzzy');
    expect(r.resolved).toBeNull();
  });
});
