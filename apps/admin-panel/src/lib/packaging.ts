/** Category id for NF-PKG (Non-food → Packaging) in product_categories.
 *
 * Packaging materials live as nomenclature rows under this category (their
 * product_code is RAW-AUTO-*, so they cannot be identified by code prefix).
 * Packaging is attached to dishes as bom_structures lines whose component is
 * in this category — see migrations 246/247 and the Packaging-as-BOM design.
 */
export const NF_PKG_CATEGORY_ID = 'db03ad01-c11c-421a-b754-8715f7eef8be'
