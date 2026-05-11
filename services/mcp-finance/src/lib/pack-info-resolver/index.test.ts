import { describe, it, expect } from 'vitest';
import {
  resolve,
  createSupabaseProvider,
  parsePackWeight,
  type ResolveInput,
  type ResolverResult,
  type PackInfo,
  type Conflict,
  type Source,
  type CanonicalUnit,
  type PackInfoDataProvider,
  type SupplierCatalogRow,
  type Gs1Row,
  type MakroResult,
} from './index.js';

describe('pack-info-resolver barrel exports', () => {
  it('exports resolve function', () => {
    expect(typeof resolve).toBe('function');
  });

  it('exports createSupabaseProvider function', () => {
    expect(typeof createSupabaseProvider).toBe('function');
  });

  it('exports parsePackWeight function', () => {
    expect(typeof parsePackWeight).toBe('function');
  });

  it('re-exports types for composition', () => {
    // Type validation happens at TypeScript compile time
    // This test confirms types are accessible from the barrel
    const _: ResolveInput | null = null;
    const __: ResolverResult | null = null;
    const ___: PackInfo | null = null;
    const ____: Conflict | null = null;
    const _____: Source | null = null;
    const ______: CanonicalUnit | null = null;
    const _______: PackInfoDataProvider | null = null;
    const ________: SupplierCatalogRow | null = null;
    const _________: Gs1Row | null = null;
    const __________: MakroResult | null = null;
    expect(true).toBe(true);
  });
});
