/** Recipe-step station model.
 *
 * Each recipes_flow row carries a location_id (→ locations.name). The menu UI
 * splits a dish's process into two physical stations:
 *   • L1 — the prep kitchen: pressing, baking, blast-freeze, storage (Kitchen + Storage)
 *   • L2 — the service bar: Merrychef reheat / plating (Assembly)
 *
 * Manakish (mig 292/293) are the first dishes tagged this way. Most other dishes
 * (smoothies, salads, …) have NULL location_id — for those we must NOT hide
 * anything, so callers fall back to "show all" when `tagged` is false.
 */

export type Station = 'L1' | 'L2'

const L1_LOCATIONS = new Set(['Kitchen', 'Storage'])
const L2_LOCATIONS = new Set(['Assembly'])

/** Map a locations.name to its station, or null if unknown/untagged. */
export function stationForLocation(name: string | null | undefined): Station | null {
  if (!name) return null
  if (L2_LOCATIONS.has(name)) return 'L2'
  if (L1_LOCATIONS.has(name)) return 'L1'
  return null
}

export interface StationBuckets<T> {
  /** Prep-kitchen steps (Kitchen, Storage) — plus any null/unknown step. */
  l1: T[]
  /** Service-bar steps (Assembly / Merrychef). */
  l2: T[]
  /** True when at least one step carries a recognized station. When false,
   *  the dish is untagged (legacy) and callers should show all steps as-is. */
  tagged: boolean
}

/** Split recipe steps into L1 / L2 buckets by their location_name.
 *
 * Unrecognized or null-location steps bucket into L1 (prep) so a step can never
 * silently disappear from the UI. Read `tagged` to decide whether to apply the
 * split at all: if false, render every step (legacy behaviour, no regression). */
export function bucketStepsByStation<T extends { location_name: string | null }>(
  steps: T[],
): StationBuckets<T> {
  const l1: T[] = []
  const l2: T[] = []
  let tagged = false
  for (const s of steps) {
    const station = stationForLocation(s.location_name)
    if (station) tagged = true
    if (station === 'L2') l2.push(s)
    else l1.push(s) // L1, null, unknown → prep bucket
  }
  return { l1, l2, tagged }
}
