import type { SupabaseClient } from '@supabase/supabase-js';

export interface SupplierCatalogRow {
  supplier_id: string;
  package_weight: string | null;
  package_qty: number | null;
  package_unit: string | null;
  barcode: string | null;
  product_name: string | null;
  brand: string | null;
}

export interface MakroResult {
  found: boolean;
  name: string | null;
  unit: string | null;
  brand: string | null;
}

export interface PackInfoDataProvider {
  getSupplierCatalogExact(nomenclature_id: string, barcode: string): Promise<SupplierCatalogRow[]>;
  getSupplierCatalogFuzzy(nomenclature_id: string): Promise<SupplierCatalogRow[]>;
  fetchMakroByBarcode(barcode: string): Promise<MakroResult>;
  fetchMakroByName(query: string): Promise<MakroResult>;
}

export function createSupabaseProvider(
  sb: SupabaseClient,
  fetchMakro: (q: string) => Promise<MakroResult>,
): PackInfoDataProvider {
  return {
    async getSupplierCatalogExact(nomenclature_id, barcode) {
      const { data, error } = await sb
        .from('supplier_catalog')
        .select('supplier_id, package_weight, package_qty, package_unit, barcode, product_name, brand')
        .eq('nomenclature_id', nomenclature_id)
        .eq('barcode', barcode)
        .not('package_weight', 'is', null);
      if (error) throw error;
      return data ?? [];
    },
    async getSupplierCatalogFuzzy(nomenclature_id) {
      const { data, error } = await sb
        .from('supplier_catalog')
        .select('supplier_id, package_weight, package_qty, package_unit, barcode, product_name, brand')
        .eq('nomenclature_id', nomenclature_id)
        .not('package_weight', 'is', null);
      if (error) throw error;
      return data ?? [];
    },
    async fetchMakroByBarcode(barcode) {
      return fetchMakro(barcode);
    },
    async fetchMakroByName(query) {
      return fetchMakro(query);
    },
  };
}
