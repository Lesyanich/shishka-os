export { resolve } from './resolver.ts';
export type { ResolveInput } from './resolver.ts';
export type {
  ResolverResult,
  PackInfo,
  Conflict,
  Source,
  CanonicalUnit,
} from './types.ts';
export { createSupabaseProvider } from './data-provider.ts';
export type {
  PackInfoDataProvider,
  SupplierCatalogRow,
  MakroResult,
} from './data-provider.ts';
export { parsePackWeight } from './parse-pack.ts';
