import { describe, it, expect } from 'vitest';
import { makeStubProvider, SCROW } from './fixtures.js';

describe('fixtures helpers', () => {
  it('SCROW returns defaults with correct shape', () => {
    const row = SCROW();
    expect(row.supplier_id).toBe('sup-1');
    expect(row.package_weight).toBe('500g');
    expect(row.package_qty).toBe(500);
    expect(row.package_unit).toBe('g');
    expect(row.barcode).toBe('8005121004113');
  });

  it('SCROW merges overrides', () => {
    const row = SCROW({ package_weight: '1kg', package_qty: 1, package_unit: 'kg' });
    expect(row.package_weight).toBe('1kg');
    expect(row.package_qty).toBe(1);
    expect(row.supplier_id).toBe('sup-1');
  });

  it('makeStubProvider returns empty arrays by default', async () => {
    const p = makeStubProvider({});
    expect(await p.getSupplierCatalogExact('any', 'any')).toEqual([]);
    expect(await p.getSupplierCatalogFuzzy('any')).toEqual([]);
    const m = await p.fetchMakroByBarcode('any');
    expect(m.found).toBe(false);
    const m2 = await p.fetchMakroByName('any');
    expect(m2.found).toBe(false);
  });

  it('makeStubProvider propagates configured values', async () => {
    const row = SCROW();
    const p = makeStubProvider({ sc_exact: [row], sc_fuzzy: [row] });
    expect(await p.getSupplierCatalogExact('any', 'any')).toEqual([row]);
    expect(await p.getSupplierCatalogFuzzy('any')).toEqual([row]);
  });

  it('makeStubProvider throws on fetchMakroByBarcode when configured', async () => {
    const p = makeStubProvider({ throwOnMakroBarcode: true });
    await expect(p.fetchMakroByBarcode('any')).rejects.toThrow('makro 5xx');
  });
});
