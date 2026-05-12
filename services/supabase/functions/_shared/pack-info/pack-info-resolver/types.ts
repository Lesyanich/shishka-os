export type Source =
  | 'supplier_catalog_exact'
  | 'supplier_catalog_fuzzy'
  | 'makro_barcode'
  | 'makro_fuzzy';

export type CanonicalUnit = 'kg' | 'g' | 'L' | 'ml' | 'pcs' | 'portion';

export interface PackInfo {
  base_unit: CanonicalUnit;
  package_weight: string;        // e.g. "500g", "1kg"
  package_qty: number;           // numeric form, e.g. 500
  package_unit: string;          // unit of qty, e.g. "g"
  cost_per_kg: number | null;    // computed when last_price + qty available
}

export interface Conflict {
  source: Source;
  pack_info: PackInfo;
  evidence: Record<string, unknown>;
}

export interface ResolverResult {
  nomenclature_id: string;
  resolved: PackInfo | null;
  source: Source | null;
  confidence: number;             // 0..1
  conflicts: Conflict[];
  evidence: Record<string, unknown>;
}
