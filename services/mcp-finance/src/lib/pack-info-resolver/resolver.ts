import type { CanonicalUnit, Conflict, PackInfo, ResolverResult, Source } from './types.js';
import type { PackInfoDataProvider, SupplierCatalogRow, MakroResult } from './data-provider.js';
import { parsePackWeight } from './parse-pack.js';

export interface ResolveInput {
  nomenclature_id: string;
  supplier_id: string;
  barcode?: string;
  last_price_thb?: number;
  name?: string;
  brand?: string;
}

const CANONICAL_UNIT_MAP: Record<string, CanonicalUnit> = {
  g: 'kg',
  kg: 'kg',
  ml: 'L',
  L: 'L',
};

function rowToPackInfo(row: SupplierCatalogRow, last_price_thb: number | undefined): PackInfo | null {
  if (!row.package_weight) return null;
  const parsed = parsePackWeight(row.package_weight);
  if (!parsed) return null;
  const base_unit = CANONICAL_UNIT_MAP[parsed.unit] ?? 'pcs';
  const grams_or_ml = parsed.unit === 'kg' || parsed.unit === 'L' ? parsed.qty * 1000 : parsed.qty;
  const cost_per_kg =
    last_price_thb != null && grams_or_ml > 0
      ? (last_price_thb / grams_or_ml) * 1000
      : null;
  return {
    base_unit,
    package_weight: row.package_weight,
    package_qty: parsed.qty,
    package_unit: parsed.unit,
    cost_per_kg,
  };
}

function makroToPackInfo(m: MakroResult, last_price_thb: number | undefined): PackInfo | null {
  if (!m.found || !m.unit) return null;
  const parsed = parsePackWeight(m.unit);
  if (!parsed) return null;
  const base_unit = CANONICAL_UNIT_MAP[parsed.unit] ?? 'pcs';
  const grams_or_ml = parsed.unit === 'kg' || parsed.unit === 'L' ? parsed.qty * 1000 : parsed.qty;
  const cost_per_kg = last_price_thb != null && grams_or_ml > 0 ? (last_price_thb / grams_or_ml) * 1000 : null;
  return {
    base_unit,
    package_weight: m.unit,
    package_qty: parsed.qty,
    package_unit: parsed.unit,
    cost_per_kg,
  };
}

function emptyResult(nomenclature_id: string): ResolverResult {
  return { nomenclature_id, resolved: null, source: null, confidence: 0, conflicts: [], evidence: {} };
}

function detectConflict(rows: SupplierCatalogRow[], src: Source, last_price_thb?: number): Conflict[] {
  const seen = new Map<string, Conflict>();
  for (const r of rows) {
    if (!r.package_weight) continue;
    const pi = rowToPackInfo(r, last_price_thb);
    if (!pi) continue;
    const key = `${pi.package_qty}|${pi.package_unit}`;
    if (!seen.has(key)) {
      seen.set(key, { source: src, pack_info: pi, evidence: { ...r } });
    }
  }
  return seen.size > 1 ? Array.from(seen.values()) : [];
}

export async function resolve(input: ResolveInput, p: PackInfoDataProvider): Promise<ResolverResult> {
  // Level 1: supplier_catalog exact (requires barcode)
  if (input.barcode) {
    const exact = await p.getSupplierCatalogExact(input.nomenclature_id, input.barcode);
    if (exact.length === 1) {
      const pi = rowToPackInfo(exact[0], input.last_price_thb);
      if (pi) {
        return {
          nomenclature_id: input.nomenclature_id,
          resolved: pi,
          source: 'supplier_catalog_exact',
          confidence: 1.0,
          conflicts: [],
          evidence: { sc: exact[0] },
        };
      }
    } else if (exact.length > 1) {
      const conflicts = detectConflict(exact, 'supplier_catalog_exact', input.last_price_thb);
      if (conflicts.length > 0) {
        return {
          nomenclature_id: input.nomenclature_id,
          resolved: null,
          source: null,
          confidence: 0.5,
          conflicts,
          evidence: { sc: exact },
        };
      }
    }
  }

  // Level 2: supplier_catalog fuzzy (by nomenclature_id only)
  const fuzzy = await p.getSupplierCatalogFuzzy(input.nomenclature_id);
  if (fuzzy.length > 0) {
    const conflicts = detectConflict(fuzzy, 'supplier_catalog_fuzzy', input.last_price_thb);
    if (conflicts.length > 0) {
      return {
        nomenclature_id: input.nomenclature_id,
        resolved: null,
        source: null,
        confidence: 0.5,
        conflicts,
        evidence: { sc: fuzzy },
      };
    }
    const pi = rowToPackInfo(fuzzy[0], input.last_price_thb);
    if (pi) {
      return {
        nomenclature_id: input.nomenclature_id,
        resolved: pi,
        source: 'supplier_catalog_fuzzy',
        confidence: 0.85,
        conflicts: [],
        evidence: { sc: fuzzy[0] },
      };
    }
  }

  // Level 3: GS1 barcode lookup
  if (input.barcode) {
    const gs1 = await p.getGs1Item(input.barcode);
    if (gs1) {
      const pi: PackInfo = {
        base_unit: 'kg',
        package_weight: `${gs1.weight_grams}g`,
        package_qty: gs1.weight_grams,
        package_unit: 'g',
        cost_per_kg:
          input.last_price_thb != null && gs1.weight_grams > 0
            ? (input.last_price_thb / gs1.weight_grams) * 1000
            : null,
      };
      return {
        nomenclature_id: input.nomenclature_id,
        resolved: pi,
        source: 'gs1',
        confidence: 0.9,
        conflicts: [],
        evidence: { gs1 },
      };
    }
  }

  // Level 4: Makro by barcode
  if (input.barcode) {
    try {
      const m = await p.fetchMakroByBarcode(input.barcode);
      const pi = makroToPackInfo(m, input.last_price_thb);
      if (pi) {
        return {
          nomenclature_id: input.nomenclature_id,
          resolved: pi,
          source: 'makro_barcode',
          confidence: 0.85,
          conflicts: [],
          evidence: { makro: m },
        };
      }
    } catch {
      // TODO(phase2): log structured telemetry on makro fetch failures
    }
  }

  // Level 5: Makro by name / brand
  if (input.name) {
    try {
      const query = input.brand ? `${input.brand} ${input.name}` : input.name;
      const m = await p.fetchMakroByName(query);
      const pi = makroToPackInfo(m, input.last_price_thb);
      if (pi) {
        return {
          nomenclature_id: input.nomenclature_id,
          resolved: pi,
          source: 'makro_fuzzy',
          confidence: 0.6,
          conflicts: [],
          evidence: { makro: m, query },
        };
      }
    } catch {
      // TODO(phase2): log structured telemetry on makro fetch failures
    }
  }

  return emptyResult(input.nomenclature_id);
}
