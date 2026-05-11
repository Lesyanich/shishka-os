import { describe, it, expect } from 'vitest';
import type {
  Source,
  CanonicalUnit,
  PackInfo,
  Conflict,
  ResolverResult,
} from './types';

describe('pack-info-resolver types', () => {
  it('types should compile without errors', () => {
    // Smoke test: verify types are importable and structurally sound
    const source: Source = 'supplier_catalog_exact';
    const unit: CanonicalUnit = 'kg';

    const packInfo: PackInfo = {
      base_unit: 'kg',
      package_weight: '1kg',
      package_qty: 1000,
      package_unit: 'g',
      cost_per_kg: 100,
    };

    const conflict: Conflict = {
      source,
      pack_info: packInfo,
      evidence: {},
    };

    const result: ResolverResult = {
      nomenclature_id: 'test-id',
      resolved: packInfo,
      source,
      confidence: 0.95,
      conflicts: [conflict],
      evidence: {},
    };

    expect(result.nomenclature_id).toBe('test-id');
    expect(result.confidence).toBe(0.95);
  });
});
