/** Packaging taxonomy lives under the NF-PKG category SUBTREE in
 * product_categories: the parent `NF-PKG` plus children `NF-PKG-CNT`
 * (containers: bowls/boxes/cups/bottles), `NF-PKG-BAG` (bags/film) and
 * `NF-PKG-CTL` (cutlery/napkins). All their codes share this prefix.
 *
 * Packaging materials are ordinary nomenclature rows (product_code RAW-*),
 * attached to dishes as bom_structures lines whose component's category code
 * starts with this prefix — see migrations 246/247/248 and the
 * Packaging-as-BOM design. Identify packaging by CATEGORY CODE PREFIX, never
 * by product_code.
 */
export const NF_PKG_CODE_PREFIX = 'NF-PKG'

/** True when a product_categories.code belongs to the packaging subtree. */
export function isPackagingCategoryCode(code: string | null | undefined): boolean {
  return !!code && code.startsWith(NF_PKG_CODE_PREFIX)
}
