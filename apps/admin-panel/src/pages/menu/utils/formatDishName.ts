/**
 * Staff-facing dish label: short code prefix + name, e.g. "S-1 Mango Smoothie".
 *
 * The `staff_code` is stored separately from `name` (see migration 221) and is
 * rendered as a prefix only on staff surfaces — owner table, kitchen views, and
 * cheat-sheets. Customer-facing surfaces pass nothing / null and get the bare
 * name back.
 */
export function formatDishName(
  staffCode: string | null | undefined,
  name: string,
): string {
  return staffCode ? `${staffCode} ${name}` : name
}
