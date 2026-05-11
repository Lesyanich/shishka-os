import type { PackInfoDataProvider, SupplierCatalogRow, MakroResult } from './data-provider.js';

export interface StubConfig {
  sc_exact?: SupplierCatalogRow[];
  sc_fuzzy?: SupplierCatalogRow[];
  makro_barcode?: MakroResult;
  makro_name?: MakroResult;
  throwOnMakroBarcode?: boolean;
  throwOnMakroFuzzy?: boolean;
}

export function makeStubProvider(cfg: StubConfig): PackInfoDataProvider {
  const empty: MakroResult = { found: false, name: null, unit: null, brand: null };
  return {
    async getSupplierCatalogExact() { return cfg.sc_exact ?? []; },
    async getSupplierCatalogFuzzy() { return cfg.sc_fuzzy ?? []; },
    async fetchMakroByBarcode() {
      if (cfg.throwOnMakroBarcode) throw new Error('makro 5xx');
      return cfg.makro_barcode ?? empty;
    },
    async fetchMakroByName() {
      if (cfg.throwOnMakroFuzzy) throw new Error('makro fuzzy 5xx');
      return cfg.makro_name ?? empty;
    },
  };
}

export const SCROW = (over: Partial<SupplierCatalogRow> = {}): SupplierCatalogRow => ({
  supplier_id: 'sup-1',
  package_weight: '500g',
  package_qty: 500,
  package_unit: 'g',
  barcode: '8005121004113',
  product_name: 'Divella Farina',
  brand: 'Divella',
  ...over,
});
