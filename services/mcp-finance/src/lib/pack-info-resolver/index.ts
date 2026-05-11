export { resolve } from './resolver.js';
export type { ResolveInput } from './resolver.js';
export type {
  ResolverResult,
  PackInfo,
  Conflict,
  Source,
  CanonicalUnit,
} from './types.js';
export { createSupabaseProvider } from './data-provider.js';
export type {
  PackInfoDataProvider,
  SupplierCatalogRow,
  MakroResult,
} from './data-provider.js';
export { parsePackWeight } from './parse-pack.js';
