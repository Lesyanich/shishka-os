// Deep-link helpers for the kitchen task tracker. A task may point at a relevant
// in-app tab (a dish recipe, the stock sheet, the labels station…) so a cook can
// jump straight from "make hummus" to the hummus recipe steps.
//
// Two kinds of link:
//   • a dish recipe → built from product_code + station via buildDishLink()
//   • a fixed page  → one of FIXED_LINKS below
//
// All targets are reachable by the `cook` role (the recipe route used is the
// cook-facing /kitchen/recipes, NOT the owner-gated /menu/dish/:code).

import type { TaskStation } from '../hooks/useStaffTasks'

export interface TaskLink {
  route: string
  label: string
  label_th: string
}

export interface FixedLinkOption extends TaskLink {
  /** Stable id for the picker select. */
  id: string
}

/** Fixed destinations a task can link to (besides a specific dish recipe).
 * The `/count/<code>` family (S3) opens a station's count screen; recurring
 * stock_check tasks (mig 356) point here too. */
export const FIXED_LINKS: FixedLinkOption[] = [
  { id: 'stock', route: '/stock', label: 'Stock sheet', label_th: 'เช็คสต็อก' },
  { id: 'waste', route: '/kitchen/waste', label: 'Stocktake & Waste', label_th: 'นับสต็อก & ของเสีย' },
  { id: 'labels', route: '/kitchen/labels', label: 'Prep labels', label_th: 'พิมพ์ป้าย' },
  { id: 'receiving', route: '/receive', label: 'Receiving', label_th: 'รับของ' },
  { id: 'count-bar', route: '/count/bar', label: 'Count · Bar', label_th: 'นับสต็อก · บาร์' },
  { id: 'count-salad-bar', route: '/count/salad-bar', label: 'Count · Salad Bar', label_th: 'นับสต็อก · สลัดบาร์' },
  { id: 'count-manakish', route: '/count/manakish', label: 'Count · Manakish', label_th: 'นับสต็อก · มานาคีช' },
  { id: 'count-chocolate', route: '/count/chocolate', label: 'Count · Chocolate', label_th: 'นับสต็อก · ช็อกโกแลต' },
  { id: 'count-bread', route: '/count/bread', label: 'Count · Bread', label_th: 'นับสต็อก · ขนมปัง' },
  { id: 'thaw', route: '/thaw', label: 'Thaw / Put away', label_th: 'ละลาย / เก็บแช่แข็ง' },
]

/** Map a task's station to the cook recipe page's station tab. */
export function recipeStationParam(station: TaskStation): 'l1-cook' | 'l2-assembler' {
  return station === 'L2' ? 'l2-assembler' : 'l1-cook'
}

/**
 * Build a deep link to a dish's recipe on the cook-facing recipe page, opened on
 * the station tab appropriate to the task. The page reads ?dish & ?station to
 * surface that dish's steps.
 */
export function buildDishLink(
  productCode: string,
  dishName: string,
  station: TaskStation,
  dishNameTh?: string | null,
): TaskLink {
  const route = `/kitchen/recipes?dish=${encodeURIComponent(productCode)}&station=${recipeStationParam(station)}`
  return {
    route,
    label: `Recipe: ${dishName}`,
    label_th: `สูตร: ${dishNameTh || dishName}`,
  }
}
