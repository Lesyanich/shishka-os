import { describe, it, expect } from 'vitest';
import type {
  SupplierCatalogRow,
  MakroResult,
  PackInfoDataProvider,
} from './data-provider.js';

describe('PackInfoDataProvider types', () => {
  it('types should compile without errors', () => {
    // Smoke test: verify types are importable and structurally sound

    const row: SupplierCatalogRow = {
      supplier_id: 'sup-1',
      package_weight: '1kg',
      package_qty: 6,
      package_unit: 'pcs',
      barcode: '8850000000001',
      product_name: 'Test Product',
      brand: 'TestBrand',
    };

    const makroResult: MakroResult = {
      found: true,
      name: 'Test Product',
      unit: 'kg',
      brand: 'TestBrand',
    };

    // Verify that the PackInfoDataProvider interface shape is correct
    // (structural type check — no runtime implementation needed)
    const _typeCheck: PackInfoDataProvider = {
      getSupplierCatalogExact: async () => [row],
      getSupplierCatalogFuzzy: async () => [row],
      fetchMakroByBarcode: async () => makroResult,
      fetchMakroByName: async () => makroResult,
    };

    expect(row.supplier_id).toBe('sup-1');
    expect(makroResult.found).toBe(true);
    expect(_typeCheck).toBeDefined();
  });
});
